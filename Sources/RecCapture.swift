import Cocoa
import AVFoundation
import CoreMedia
import ScreenCaptureKit

/// O que gravar: tela, retângulo (pontos, origem no canto inferior esquerdo da tela) e fontes.
struct CaptureRequest {
    var screen: NSScreen
    var rect: NSRect
    var video: Bool
    var systemAudio: Bool
    var microphone: AVCaptureDevice?
    var fps: Int
    var showsCursor = true

    /// Tamanho da área em pixels (Retina = 2×).
    var pixelSize: CGSize {
        let s = screen.backingScaleFactor
        return CGSize(width: (rect.width * s).rounded(), height: (rect.height * s).rounded())
    }

    /// Área em coordenadas globais (para alinhar os cliques).
    var globalRect: NSRect {
        return rect.offsetBy(dx: screen.frame.minX, dy: screen.frame.minY)
    }
}

protocol CaptureSourcesDelegate: AnyObject {
    /// Quadro de vídeo, com tempo no relógio do sistema.
    func captureSources(_ sources: CaptureSources, didOutputVideo pixelBuffer: CVPixelBuffer, at time: CMTime)
    /// Áudio já convertido para o relógio do sistema.
    func captureSources(_ sources: CaptureSources, didOutputAudio sampleBuffer: CMSampleBuffer, kind: AudioKind)
    /// Uma fonte parou (desconectada, erro). `fatal` = a tela parou de ser capturada.
    func captureSources(_ sources: CaptureSources, sourceFailed kind: String, message: String, fatal: Bool)
}

/// Inicia as fontes escolhidas e entrega tudo no relógio do sistema, para manter a sincronia.
/// - macOS 12.3+: tela por ScreenCaptureKit; 13+: som do Mac também; 15+: microfone também.
/// - macOS 10.14–12.2: tela por AVCaptureScreenInput, som do Mac pelo BlackHole, microfone por AVFoundation.
final class CaptureSources: NSObject {
    weak var delegate: CaptureSourcesDelegate?
    let request: CaptureRequest
    let queue = DispatchQueue(label: "recorte.capture", qos: .userInteractive)

    private(set) var levels: [AudioKind: Float] = [:]
    private let levelLock = NSLock()

    private var sessions: [AVCaptureSession] = []
    private var sckCapture: AnyObject?
    private var observers: [NSObjectProtocol] = []
    /// Fontes que usam AVFoundation (para saber qual relógio converter).
    private var sessionKinds: [ObjectIdentifier: AudioKind] = [:]
    private var outputSessions: [ObjectIdentifier: AVCaptureSession] = [:]
    private var screenSession: AVCaptureSession?

    /// Indica qual tecnologia está sendo usada (para os testes e mensagens).
    private(set) var backendDescription = ""

    static var forceLegacy: Bool {
        return ProcessInfo.processInfo.environment["RECORTE_FORCE_LEGACY"] != nil
    }

    static var modernScreenAvailable: Bool {
        if forceLegacy { return false }
        if #available(macOS 12.3, *) { return true }
        return false
    }

    /// O som do Mac vem do ScreenCaptureKit (13+) ou do BlackHole (versões anteriores).
    static var systemAudioViaSCK: Bool {
        if forceLegacy { return false }
        if #available(macOS 13.0, *) { return true }
        return false
    }

    init(request: CaptureRequest) {
        self.request = request
        super.init()
    }

    func level(_ kind: AudioKind) -> Float {
        levelLock.lock(); defer { levelLock.unlock() }
        return levels[kind] ?? 0
    }

    fileprivate func report(level: Float, kind: AudioKind) {
        levelLock.lock()
        let old = levels[kind] ?? 0
        // Decaimento suave para o medidor.
        levels[kind] = max(level, old * 0.85)
        levelLock.unlock()
    }

    // MARK: Início / fim

    func start(completion: @escaping (String?) -> Void) {
        var micHandledBySCK = false
        let useSCK = CaptureSources.modernScreenAvailable && (request.video || (request.systemAudio && CaptureSources.systemAudioViaSCK))

        // Microfone e BlackHole por AVFoundation.
        if let mic = request.microphone {
            if #available(macOS 15.0, *), useSCK, !CaptureSources.forceLegacy {
                micHandledBySCK = true
            } else if let error = startAudioDevice(mic, kind: .mic) {
                completion(error); return
            }
        }
        if request.systemAudio && !CaptureSources.systemAudioViaSCK {
            guard let bh = AudioDevices.blackHole() else {
                completion("O dispositivo BlackHole 2ch não foi encontrado."); return
            }
            if let error = startAudioDevice(bh, kind: .system) { completion(error); return }
        }

        if useSCK {
            if #available(macOS 12.3, *) {
                let capture = SCKCapture(owner: self, micUID: micHandledBySCK ? request.microphone?.uniqueID : nil)
                sckCapture = capture
                backendDescription = "ScreenCaptureKit"
                capture.start { error in
                    DispatchQueue.main.async { completion(error) }
                }
                return
            }
        }
        if request.video {
            if let error = startLegacyScreen() { completion(error); return }
            backendDescription = "AVCaptureScreenInput"
        } else {
            backendDescription = "AVFoundation (áudio)"
        }
        completion(nil)
    }

    func stop() {
        for s in sessions where s.isRunning { s.stopRunning() }
        sessions.removeAll()
        if #available(macOS 12.3, *), let capture = sckCapture as? SCKCapture {
            capture.stop()
        }
        sckCapture = nil
        for o in observers { NotificationCenter.default.removeObserver(o) }
        observers.removeAll()
    }

    // MARK: AVFoundation

    private func startAudioDevice(_ device: AVCaptureDevice, kind: AudioKind) -> String? {
        let session = AVCaptureSession()
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return "Não foi possível usar \(device.localizedName)." }
            session.addInput(input)
        } catch {
            return "Não foi possível abrir \(device.localizedName): \(error.localizedDescription)"
        }
        let output = AVCaptureAudioDataOutput()
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { return "Não foi possível ler o áudio de \(device.localizedName)." }
        session.addOutput(output)
        sessionKinds[ObjectIdentifier(output)] = kind
        outputSessions[ObjectIdentifier(output)] = session
        watch(session, device: device, label: kind.title, fatal: false)
        session.startRunning()
        sessions.append(session)
        return nil
    }

    private func startLegacyScreen() -> String? {
        let session = AVCaptureSession()
        guard let input = AVCaptureScreenInput(displayID: request.screen.displayID) else {
            return "Não foi possível capturar a tela escolhida."
        }
        input.cropRect = request.rect
        input.minFrameDuration = CMTime(value: 1, timescale: CMTimeScale(request.fps))
        input.capturesCursor = request.showsCursor
        input.capturesMouseClicks = false
        guard session.canAddInput(input) else { return "Não foi possível capturar a tela escolhida." }
        session.addInput(input)
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { return "Não foi possível ler os quadros da tela." }
        session.addOutput(output)
        outputSessions[ObjectIdentifier(output)] = session
        watch(session, device: nil, label: "Tela", fatal: true)
        screenSession = session
        session.startRunning()
        sessions.append(session)
        return nil
    }

    private func watch(_ session: AVCaptureSession, device: AVCaptureDevice?, label: String, fatal: Bool) {
        let nc = NotificationCenter.default
        observers.append(nc.addObserver(forName: .AVCaptureSessionRuntimeError, object: session, queue: .main) {
            [weak self] note in
            guard let self = self else { return }
            let err = note.userInfo?[AVCaptureSessionErrorKey] as? Error
            self.delegate?.captureSources(self, sourceFailed: label,
                                          message: err?.localizedDescription ?? "erro desconhecido", fatal: fatal)
        })
        if let device = device {
            observers.append(nc.addObserver(forName: .AVCaptureDeviceWasDisconnected, object: device, queue: .main) {
                [weak self] _ in
                guard let self = self else { return }
                self.delegate?.captureSources(self, sourceFailed: label,
                                              message: "\(device.localizedName) foi desconectado.", fatal: fatal)
            })
        }
    }

    fileprivate func clock(of session: AVCaptureSession?) -> CMClock? {
        guard let session = session else { return nil }
        if #available(macOS 12.3, *) { return session.synchronizationClock }
        return session.masterClock
    }

    fileprivate func deliverVideo(_ sampleBuffer: CMSampleBuffer, hostTime: CMTime) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        delegate?.captureSources(self, didOutputVideo: pixelBuffer, at: hostTime)
    }

    fileprivate func deliverAudio(_ sampleBuffer: CMSampleBuffer, kind: AudioKind) {
        report(level: AudioLevel.peak(of: sampleBuffer), kind: kind)
        delegate?.captureSources(self, didOutputAudio: sampleBuffer, kind: kind)
    }

    fileprivate func fail(_ label: String, _ message: String, fatal: Bool) {
        DispatchQueue.main.async {
            self.delegate?.captureSources(self, sourceFailed: label, message: message, fatal: fatal)
        }
    }
}

extension CaptureSources: AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        let session = outputSessions[ObjectIdentifier(output)]
        guard let converted = SampleTiming.toHostClock(sampleBuffer, from: clock(of: session)) else { return }
        if output is AVCaptureVideoDataOutput {
            deliverVideo(converted, hostTime: CMSampleBufferGetPresentationTimeStamp(converted))
        } else if let kind = sessionKinds[ObjectIdentifier(output)] {
            deliverAudio(converted, kind: kind)
        }
    }
}

// MARK: - ScreenCaptureKit

@available(macOS 12.3, *)
private final class SCKCapture: NSObject, SCStreamOutput, SCStreamDelegate {
    weak var owner: CaptureSources?
    let micUID: String?
    private var stream: SCStream?

    init(owner: CaptureSources, micUID: String?) {
        self.owner = owner
        self.micUID = micUID
    }

    func start(completion: @escaping (String?) -> Void) {
        guard let owner = owner else { completion("Gravação cancelada."); return }
        let request = owner.request
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: true) { [weak self] content, error in
            guard let self = self else { return }
            guard let content = content else {
                completion("Sem permissão para capturar a tela: \(error?.localizedDescription ?? "verifique Gravação de Tela nos Ajustes").")
                return
            }
            guard let display = content.displays.first(where: { $0.displayID == request.screen.displayID }) else {
                completion("A tela escolhida não está mais disponível.")
                return
            }
            // Não grava as janelas do próprio Recorte (contagem, avisos, controles).
            let mine = content.applications.filter { $0.processID == ProcessInfo.processInfo.processIdentifier }
            let filter = SCContentFilter(display: display, excludingApplications: mine, exceptingWindows: [])

            let config = SCStreamConfiguration()
            let screenHeight = request.screen.frame.height
            if request.video {
                config.sourceRect = CGRect(x: request.rect.minX, y: screenHeight - request.rect.maxY,
                                           width: request.rect.width, height: request.rect.height)
                config.width = Int(request.pixelSize.width)
                config.height = Int(request.pixelSize.height)
                config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(request.fps))
            } else {
                // Só áudio (teste e medidores): vídeo mínimo.
                config.width = 2
                config.height = 2
                config.minimumFrameInterval = CMTime(value: 1, timescale: 1)
            }
            config.pixelFormat = kCVPixelFormatType_32BGRA
            config.showsCursor = request.showsCursor
            config.queueDepth = 6
            var wantsAudio = false
            if #available(macOS 13.0, *), request.systemAudio, CaptureSources.systemAudioViaSCK {
                config.capturesAudio = true
                config.sampleRate = 48_000
                config.channelCount = 2
                config.excludesCurrentProcessAudio = true
                wantsAudio = true
            }
            var wantsMic = false
            if #available(macOS 15.0, *), let uid = self.micUID {
                config.captureMicrophone = true
                config.microphoneCaptureDeviceID = uid
                wantsMic = true
            }

            let stream = SCStream(filter: filter, configuration: config, delegate: self)
            do {
                try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: owner.queue)
                if wantsAudio, #available(macOS 13.0, *) {
                    try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: owner.queue)
                }
                if wantsMic, #available(macOS 15.0, *) {
                    try stream.addStreamOutput(self, type: .microphone, sampleHandlerQueue: owner.queue)
                }
            } catch {
                completion("Não foi possível iniciar a captura: \(error.localizedDescription)")
                return
            }
            self.stream = stream
            stream.startCapture { error in
                completion(error.map { "Não foi possível iniciar a captura: \($0.localizedDescription)" })
            }
        }
    }

    func stop() {
        stream?.stopCapture(completionHandler: nil)
        stream = nil
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard let owner = owner, sampleBuffer.isValid else { return }
        switch type {
        case .screen:
            guard owner.request.video else { return }
            // Só quadros completos (os "ociosos" não trazem imagem nova).
            if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false)
                as? [[SCStreamFrameInfo: Any]],
               let raw = attachments.first?[.status] as? Int,
               let status = SCFrameStatus(rawValue: raw), status != .complete {
                return
            }
            owner.deliverVideo(sampleBuffer, hostTime: CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
        default:
            if #available(macOS 15.0, *), type == .microphone {
                owner.deliverAudio(sampleBuffer, kind: .mic)
            } else {
                owner.deliverAudio(sampleBuffer, kind: .system)
            }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        owner?.fail("Tela", "A captura da tela parou: \(error.localizedDescription)", fatal: true)
    }
}

// MARK: - Webcam

/// Mantém o quadro mais recente da câmera para a sobreposição no vídeo.
final class WebcamSource: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "recorte.webcam")
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    var onDisconnect: (() -> Void)?
    private var observer: NSObjectProtocol?

    static func cameras() -> [AVCaptureDevice] {
        return AVCaptureDevice.devices(for: .video)
    }

    static func camera(uid: String?) -> AVCaptureDevice? {
        if let uid = uid, let c = cameras().first(where: { $0.uniqueID == uid }) { return c }
        return AVCaptureDevice.default(for: .video) ?? cameras().first
    }

    func start(device: AVCaptureDevice) -> String? {
        do {
            let input = try AVCaptureDeviceInput(device: device)
            guard session.canAddInput(input) else { return "Não foi possível usar a câmera \(device.localizedName)." }
            session.addInput(input)
        } catch {
            return "Não foi possível abrir a câmera: \(error.localizedDescription)"
        }
        if session.canSetSessionPreset(.medium) { session.sessionPreset = .medium }
        let output = AVCaptureVideoDataOutput()
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { return "Não foi possível ler a câmera." }
        session.addOutput(output)
        observer = NotificationCenter.default.addObserver(forName: .AVCaptureDeviceWasDisconnected, object: device,
                                                          queue: .main) { [weak self] _ in self?.onDisconnect?() }
        session.startRunning()
        return nil
    }

    func stop() {
        if session.isRunning { session.stopRunning() }
        if let o = observer { NotificationCenter.default.removeObserver(o) }
    }

    var currentFrame: CVPixelBuffer? {
        lock.lock(); defer { lock.unlock() }
        return latest
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        lock.lock()
        latest = pb
        lock.unlock()
    }
}
