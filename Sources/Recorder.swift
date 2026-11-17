import Cocoa
import AVFoundation
import CoreMedia

/// Gravador de tela: verifica as fontes, faz a contagem, grava em trechos, pausa,
/// marca, trata falhas e finaliza o MP4.
final class Recorder: NSObject, CaptureSourcesDelegate {
    static let shared = Recorder()

    enum State: Equatable {
        case idle, countdown, recording, paused, finishing
    }

    private(set) var state: State = .idle {
        didSet { DispatchQueue.main.async { self.onChange?() } }
    }
    /// Avisos para o menu da barra (estado, tempo).
    var onChange: (() -> Void)?
    /// Abre a prévia quando o vídeo fica pronto.
    var onFinished: ((URL) -> Void)?

    private(set) var profile = RecSettings.current
    private(set) var request: CaptureRequest?
    private var format: RecVideoFormat?
    private var sources: CaptureSources?
    private var webcam: WebcamSource?
    private(set) var webcamActive = false
    private(set) var store: RecSessionStore?
    private let compositor = FrameCompositor()
    private var countdown: CountdownWindow?
    private var progressWindow: ProgressHUD?
    private var muxer: Muxer?

    // Somente na fila de captura:
    private var writer: ChunkWriter?
    private var closing: [(ChunkWriter, Int)] = []
    private var pausedQ = false
    private var needsNewChunk = true
    private var chunkIndex = -1
    private var clicks: [ClickMark] = []
    private var audioKinds: [AudioKind] = []
    private var webcamVisibleQ = true
    private var markerCount = 0
    private var lastSource: CVPixelBuffer?
    private let finishGroup = DispatchGroup()
    private var consecutiveFailures = 0
    private var repeatTimer: DispatchSourceTimer?

    // Tempo gravado (fila principal)
    private var accumulated: Double = 0
    private var segmentStart: Date?
    private var healthTimer: Timer?
    private var clickMonitors: [Any] = []
    private var warnings: [String] = []

    var elapsed: Double {
        return accumulated + (segmentStart.map { Date().timeIntervalSince($0) } ?? 0)
    }

    var isBusy: Bool { return state != .idle }

    func level(_ kind: AudioKind) -> Float {
        return sources?.level(kind) ?? 0
    }

    var hasSystemAudio: Bool { return request?.systemAudio ?? false }
    var hasMicrophone: Bool { return request?.microphone != nil }

    // MARK: Início

    /// Começa a gravar a área indicada com o perfil atual (verifica tudo antes).
    func start(screen: NSScreen, rect: NSRect, profile: RecProfile = RecSettings.current) {
        guard state == .idle else { return }
        // Verificações que podem pedir uma decisão do usuário.
        preflight(profile) { [weak self] ok, adjusted in
            guard let self = self, ok else { return }
            self.profile = adjusted
            RecSettings.lastArea = RecLastArea(displayID: screen.displayID, screenWidth: screen.frame.width,
                                               screenHeight: screen.frame.height, x: rect.minX, y: rect.minY,
                                               width: rect.width, height: rect.height)
            let mic = adjusted.microphone ? AudioDevices.microphone(uid: adjusted.micDeviceUID) : nil
            var req = CaptureRequest(screen: screen, rect: rect, video: true, systemAudio: adjusted.systemAudio,
                                     microphone: mic, fps: adjusted.videoQuality.fps)
            req.showsCursor = adjusted.showCursor ?? true
            self.request = req
            self.format = RecVideoFormat(capturePixels: req.pixelSize, quality: adjusted.videoQuality)
            if adjusted.countdown && ProcessInfo.processInfo.environment["RECORTE_TEST"] == nil {
                self.state = .countdown
                let globalRect = req.globalRect
                self.countdown = CountdownWindow(around: globalRect, seconds: 3, onFinish: { [weak self] in
                    self?.countdown = nil
                    self?.begin()
                }, onCancel: { [weak self] in
                    self?.countdown = nil
                    self?.state = .idle
                })
                self.countdown?.show()
            } else {
                self.begin()
            }
        }
    }

    private func begin() {
        guard let req = request, let fmt = format else { state = .idle; return }
        var volumes: [AudioKind: Float] = [:]
        volumes[.system] = profile.systemVolume
        volumes[.mic] = profile.micVolume
        do {
            store = try RecSessionStore(profile: profile, volumes: volumes)
        } catch {
            alert("Não foi possível preparar a gravação", error.localizedDescription)
            state = .idle
            return
        }
        var kinds: [AudioKind] = []
        if req.systemAudio { kinds.append(.system) }
        if req.microphone != nil { kinds.append(.mic) }
        let sources = CaptureSources(request: req)
        sources.delegate = self
        self.sources = sources

        // Estado da fila de captura
        sources.queue.sync {
            self.audioKinds = kinds
            self.writer = nil
            self.closing = []
            self.pausedQ = false
            self.needsNewChunk = true
            self.chunkIndex = -1
            self.clicks = []
            self.webcamVisibleQ = true
            self.markerCount = 0
        }
        warnings = []
        accumulated = 0
        _ = fmt

        if profile.webcam, let cam = WebcamSource.camera(uid: profile.cameraUID) {
            let w = WebcamSource()
            if let error = w.start(device: cam) {
                warnings.append(error)
            } else {
                webcam = w
                webcamActive = true
                w.onDisconnect = { [weak self] in
                    self?.webcamActive = false
                    self?.notify("Webcam desconectada", "A gravação continua sem a câmera.")
                }
            }
        }

        state = .recording
        sources.start { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                self.teardownSources()
                self.store?.remove()
                self.store = nil
                self.state = .idle
                self.alert("Não foi possível começar a gravar", error)
                return
            }
            self.segmentStart = Date()
            self.startFrameRepeater(fps: req.fps)
            if self.profile.clickHighlight { self.startClickMonitor() }
            self.startHealthTimer()
            self.onChange?()
        }
    }

    // MARK: Verificações

    /// Permissões e fontes por versão do macOS. Para cada fonte indisponível, oferece
    /// corrigir (abre o lugar certo) ou gravar sem ela.
    private func preflight(_ profile: RecProfile, completion: @escaping (Bool, RecProfile) -> Void) {
        var p = profile
        // Tela
        if #available(macOS 10.15, *), ProcessInfo.processInfo.environment["RECORTE_TEST"] == nil {
            if !CGPreflightScreenCaptureAccess() {
                CGRequestScreenCaptureAccess()
                let choice = ask("Falta a permissão de Gravação de Tela",
                                 "Ative o Recorte em Ajustes do Sistema › Privacidade e Segurança › Gravação de Tela "
                                 + "e abra o app de novo.", buttons: ["Abrir Ajustes", "Cancelar"])
                if choice == 0 {
                    NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
                }
                completion(false, p); return
            }
        }
        // Microfone
        if p.microphone {
            switch AVCaptureDevice.authorizationStatus(for: .audio) {
            case .notDetermined where ProcessInfo.processInfo.environment["RECORTE_TEST"] == nil:
                AVCaptureDevice.requestAccess(for: .audio) { _ in
                    DispatchQueue.main.async {
                        self.preflight(p, completion: completion)
                    }
                }
                return
            case .denied, .restricted:
                let c = ask("O Recorte não tem acesso ao microfone",
                            "Permita em Ajustes do Sistema › Privacidade e Segurança › Microfone, "
                            + "ou grave sem o microfone.", buttons: ["Gravar sem microfone", "Abrir Ajustes", "Cancelar"])
                if c == 0 { p.microphone = false } else {
                    if c == 1 { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!) }
                    completion(false, p); return
                }
            default:
                break
            }
        }
        if p.microphone && AudioDevices.microphone(uid: p.micDeviceUID) == nil {
            let c = ask("Nenhum microfone encontrado", "Conecte um microfone ou grave sem ele.",
                        buttons: ["Gravar sem microfone", "Preferências…", "Cancelar"])
            if c == 0 { p.microphone = false } else {
                if c == 1 { openPreferences() }
                completion(false, p); return
            }
        } else if p.microphone, let uid = p.micDeviceUID, AudioDevices.microphones().first(where: { $0.uniqueID == uid }) == nil {
            warnings.append("O microfone escolhido não está conectado; usando o padrão do sistema.")
        }
        // Som do Mac
        if p.systemAudio && !CaptureSources.systemAudioViaSCK {
            if AudioDevices.blackHole() == nil {
                let c = ask("Som do Mac indisponível: BlackHole 2ch não encontrado",
                            "Nesta versão do macOS o som do Mac é gravado pelo BlackHole 2ch (gratuito).\n\n"
                            + AudioDevices.setupInstructions,
                            buttons: ["Gravar sem o som do Mac", "Baixar BlackHole", "Cancelar"])
                if c == 0 { p.systemAudio = false } else {
                    if c == 1 { NSWorkspace.shared.open(AudioDevices.blackHoleURL) }
                    completion(false, p); return
                }
            } else {
                switch AudioDevices.systemAudioRoute() {
                case .multiOutput:
                    break
                case .blackHoleOnly:
                    warnings.append("A saída de som é o BlackHole: o áudio será gravado, mas você não vai ouvir. "
                                    + "Crie uma Saída Múltipla para ouvir e gravar ao mesmo tempo.")
                case .notRouted(let current):
                    let c = ask("O som do Mac não está indo para o BlackHole",
                                "A saída atual é “\(current)”, então o som do Mac sairia mudo na gravação.\n\n"
                                + AudioDevices.setupInstructions,
                                buttons: ["Gravar sem o som do Mac", "Abrir Configuração de Áudio e MIDI",
                                          "Gravar mesmo assim", "Cancelar"])
                    switch c {
                    case 0: p.systemAudio = false
                    case 1: AudioDevices.openAudioMIDISetup(); completion(false, p); return
                    case 2: break
                    default: completion(false, p); return
                    }
                }
            }
        }
        // Webcam
        if p.webcam {
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .notDetermined where ProcessInfo.processInfo.environment["RECORTE_TEST"] == nil:
                AVCaptureDevice.requestAccess(for: .video) { _ in
                    DispatchQueue.main.async {
                        self.preflight(p, completion: completion)
                    }
                }
                return
            case .denied, .restricted:
                let c = ask("O Recorte não tem acesso à câmera",
                            "Permita em Ajustes do Sistema › Privacidade e Segurança › Câmera, ou grave sem a webcam.",
                            buttons: ["Gravar sem webcam", "Abrir Ajustes", "Cancelar"])
                if c == 0 { p.webcam = false } else {
                    if c == 1 { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera")!) }
                    completion(false, p); return
                }
            default:
                break
            }
            if p.webcam && WebcamSource.camera(uid: p.cameraUID) == nil {
                let c = ask("Nenhuma câmera encontrada", "Conecte uma câmera ou grave sem a webcam.",
                            buttons: ["Gravar sem webcam", "Cancelar"])
                if c == 0 { p.webcam = false } else { completion(false, p); return }
            }
        }
        // Pasta e espaço
        let folder = p.outputFolderURL
        if !RecSessionStore.isWritableFolder(folder) {
            let c = ask("Não é possível gravar na pasta escolhida",
                        "“\(folder.path)” não aceita gravação (sem permissão ou desconectada).",
                        buttons: ["Usar Filmes/Recorte", "Preferências…", "Cancelar"])
            if c == 0 { p.outputFolder = nil } else {
                if c == 1 { openPreferences() }
                completion(false, p); return
            }
        }
        let free = min(RecSessionStore.freeSpace(at: p.outputFolderURL) ?? .max,
                       RecSessionStore.freeSpace(at: FileManager.default.temporaryDirectory) ?? .max)
        if free < 1_000_000_000 {
            let c = ask("Pouco espaço em disco",
                        "Há menos de 1 GB livre. A gravação vai parar sozinha se o espaço acabar.",
                        buttons: ["Gravar mesmo assim", "Cancelar"])
            if c != 0 { completion(false, p); return }
        }
        completion(true, p)
    }

    private func openPreferences() {
        (NSApp.delegate as? AppDelegate)?.showPreferences(nil)
    }

    // MARK: Controles

    func togglePause() {
        if state == .recording { pause() } else if state == .paused { resume() }
    }

    func pause() {
        guard state == .recording, let sources = sources else { return }
        if let s = segmentStart { accumulated += Date().timeIntervalSince(s) }
        segmentStart = nil
        state = .paused
        sources.queue.async {
            self.pausedQ = true
            self.closeCurrentChunk(at: SampleTiming.hostNow())
            self.needsNewChunk = true
        }
    }

    func resume() {
        guard state == .paused, let sources = sources else { return }
        segmentStart = Date()
        state = .recording
        sources.queue.async { self.pausedQ = false }
    }

    func addMarker() {
        guard state == .recording || state == .paused, let sources = sources, let store = store else { return }
        let now = SampleTiming.hostNow()
        sources.queue.async {
            var chunk = self.chunkIndex
            var offset = Double.greatestFiniteMagnitude
            if let w = self.writer, let start = w.startTime {
                offset = CMTimeGetSeconds(CMTimeSubtract(now, start))
            } else if chunk < 0 {
                chunk = 0
                offset = 0
            }
            let n = store.addMarker(chunk: chunk, offset: offset)
            DispatchQueue.main.async {
                self.markerCount = n
                if CaptureSources.modernScreenAvailable {
                    Toast.show("Marcador \(n) adicionado", subtitle: Recorder.format(self.elapsed), duration: 1.2)
                } else {
                    NSSound(named: NSSound.Name("Tink"))?.play()
                }
                self.onChange?()
            }
        }
    }

    func toggleWebcam() {
        guard webcamActive, let sources = sources else { return }
        sources.queue.async { self.webcamVisibleQ.toggle() }
    }

    var webcamVisible: Bool {
        guard let sources = sources else { return false }
        return sources.queue.sync { webcamVisibleQ }
    }

    var markersAdded: Int { return markerCount }

    /// Para e finaliza. `reason` é mostrado no fim (falha de disco, dispositivo etc.).
    private var discardOnStop = false

    /// Cancela a gravação e apaga o que foi gravado.
    func cancel() {
        guard state == .recording || state == .paused || state == .countdown else { return }
        discardOnStop = true
        stop()
    }

    func stop(reason: String? = nil) {
        guard state == .recording || state == .paused || state == .countdown else { return }
        if state == .countdown {
            discardOnStop = false
            countdown?.cancel()
            return
        }
        if let s = segmentStart { accumulated += Date().timeIntervalSince(s) }
        segmentStart = nil
        if let r = reason { warnings.append(r) }
        state = .finishing
        stopClickMonitor()
        healthTimer?.invalidate()
        healthTimer = nil
        guard let sources = sources else { return }
        repeatTimer?.cancel()
        repeatTimer = nil
        let end = SampleTiming.hostNow()
        sources.queue.async {
            self.pausedQ = true
            self.lastSource = nil
            self.closeCurrentChunk(at: end)
            // Espera o áudio que ainda está chegando e fecha todos os trechos.
            sources.queue.asyncAfter(deadline: .now() + 0.5) {
                let pending = self.closing
                self.closing = []
                for (w, index) in pending {
                    w.finish { ok in
                        self.store?.chunkFinished(index: index, duration: w.duration, ok: ok)
                        self.finishGroup.leave()
                    }
                }
                // Espera TODOS os trechos (inclusive os que já estavam fechando) antes de montar o MP4.
                self.finishGroup.notify(queue: .main) {
                    self.teardownSources()
                    if self.discardOnStop {
                        self.discardOnStop = false
                        self.store?.remove()
                        self.store = nil
                        self.state = .idle
                        Toast.show("Gravação cancelada", subtitle: "Nada foi salvo.")
                    } else {
                        self.finalizeRecording()
                    }
                }
            }
        }
    }

    private func teardownSources() {
        repeatTimer?.cancel()
        repeatTimer = nil
        sources?.stop()
        sources = nil
        webcam?.stop()
        webcam = nil
        webcamActive = false
    }

    // MARK: Fila de captura

    /// Fecha o trecho atual; o áudio anterior a `time` ainda entra por 0,4 s.
    private func closeCurrentChunk(at time: CMTime) {
        guard let w = writer else { return }
        w.end(at: time)
        writer = nil
        let index = chunkIndex
        closing.append((w, index))
        // Cada trecho fechado só conta como pronto quando o arquivo termina de ser gravado.
        finishGroup.enter()
        sources?.queue.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self = self, let i = self.closing.firstIndex(where: { $0.0 === w }) else { return }
            self.closing.remove(at: i)
            w.finish { ok in
                self.store?.chunkFinished(index: index, duration: w.duration, ok: ok)
                self.finishGroup.leave()
            }
        }
    }

    private func openChunk(at time: CMTime) {
        guard let store = store, let fmt = format else { return }
        chunkIndex += 1
        store.addChunk(index: chunkIndex, audioKinds: audioKinds)
        do {
            let w = try ChunkWriter(url: store.chunkURL(chunkIndex),
                                    video: ChunkWriter.VideoFormat(width: fmt.width, height: fmt.height,
                                                                   fps: fmt.fps, bitrate: fmt.bitrate),
                                    audioKinds: audioKinds, audioBitrate: profile.audioQuality.bitrate)
            guard w.prepare(at: time) else {
                throw w.error ?? RecError.message("Não foi possível gravar na pasta temporária.")
            }
            writer = w
            needsNewChunk = false
        } catch {
            let message = "Não foi possível continuar gravando: \(error.localizedDescription)"
            DispatchQueue.main.async { self.stop(reason: message) }
        }
    }

    /// O ScreenCaptureKit só manda quadros quando a tela muda. Repetimos o último quadro
    /// para manter a taxa constante: duração certa, áudio intercalado e trechos legíveis.
    private func startFrameRepeater(fps: Int) {
        guard let sources = sources else { return }
        let interval = 1.0 / Double(max(fps, 1))
        let t = DispatchSource.makeTimerSource(queue: sources.queue)
        t.schedule(deadline: .now() + interval, repeating: interval)
        t.setEventHandler { [weak self] in
            guard let self = self, !self.pausedQ, let src = self.lastSource else { return }
            let now = SampleTiming.hostNow()
            if self.needsNewChunk {
                self.handleFrame(src, at: now)
            } else if let last = self.writer?.lastVideoTime,
                      CMTimeGetSeconds(CMTimeSubtract(now, last)) >= interval * 1.5 {
                self.handleFrame(src, at: now)
            }
        }
        t.resume()
        repeatTimer = t
    }

    func captureSources(_ sources: CaptureSources, didOutputVideo pixelBuffer: CVPixelBuffer, at time: CMTime) {
        if pausedQ { return }
        lastSource = pixelBuffer
        handleFrame(pixelBuffer, at: time)
    }

    private func handleFrame(_ pixelBuffer: CVPixelBuffer, at time: CMTime) {
        if needsNewChunk {
            openChunk(at: time)
        } else if let w = writer, w.duration > 120 {
            // Trechos de 2 minutos: menos perda se o app for encerrado de repente.
            closeCurrentChunk(at: time)
            openChunk(at: time)
        }
        guard let w = writer, let pool = w.pixelBufferPool else { return }
        var out: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &out)
        guard let destination = out else { return }
        clicks.removeAll { CMTimeGetSeconds(CMTimeSubtract(time, $0.time)) > 1 }
        compositor.render(source: pixelBuffer, into: destination, time: time, clicks: clicks,
                          webcam: webcamVisibleQ ? webcam?.currentFrame : nil,
                          webcamPosition: profile.webcamPosition, webcamSize: profile.webcamSize)
        w.append(pixelBuffer: destination, at: time)
        if w.failed {
            // Um trecho com erro não derruba a gravação: guarda o que ele já tem e abre outro.
            consecutiveFailures += 1
            let index = chunkIndex
            writer = nil
            needsNewChunk = true
            store?.chunkFinished(index: index, duration: w.duration, ok: false)
            if consecutiveFailures >= 4 {
                let message = "A gravação foi interrompida: \(w.error?.localizedDescription ?? "erro ao gravar no disco")."
                pausedQ = true
                DispatchQueue.main.async { self.stop(reason: message) }
            } else if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
                print("Trecho \(index) falhou; continuando em um trecho novo.")
            }
        } else {
            consecutiveFailures = 0
        }
    }

    func captureSources(_ sources: CaptureSources, didOutputAudio sampleBuffer: CMSampleBuffer, kind: AudioKind) {
        if let w = writer { w.append(audio: sampleBuffer, kind: kind) }
        for (w, _) in closing { w.append(audio: sampleBuffer, kind: kind) }
    }

    func captureSources(_ sources: CaptureSources, sourceFailed kind: String, message: String, fatal: Bool) {
        if fatal {
            stop(reason: message)
        } else {
            warnings.append(message)
            notify("\(kind): problema na gravação", message + " A gravação continua.")
        }
    }

    // MARK: Cliques e saúde

    private func startClickMonitor() {
        let handler: (NSEvent) -> Void = { [weak self] _ in self?.recordClick() }
        if let g = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown], handler: handler) {
            clickMonitors.append(g)
        }
        if let l = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown], handler: { e in
            handler(e)
            return e
        }) {
            clickMonitors.append(l)
        }
    }

    private func stopClickMonitor() {
        for m in clickMonitors { NSEvent.removeMonitor(m) }
        clickMonitors.removeAll()
    }

    private func recordClick() {
        guard let req = request, let sources = sources else { return }
        let p = NSEvent.mouseLocation
        let r = req.globalRect
        guard r.contains(p) else { return }
        let mark = ClickMark(time: SampleTiming.hostNow(),
                             position: CGPoint(x: (p.x - r.minX) / r.width, y: (p.y - r.minY) / r.height))
        sources.queue.async { self.clicks.append(mark) }
    }

    /// Simula um clique (testes automáticos).
    func testClick(at normalized: CGPoint) {
        guard let sources = sources else { return }
        let mark = ClickMark(time: SampleTiming.hostNow(), position: normalized)
        sources.queue.async { self.clicks.append(mark) }
    }

    private func startHealthTimer() {
        healthTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            guard let self = self, let store = self.store else { return }
            if let free = RecSessionStore.freeSpace(at: store.folder), free < 300_000_000 {
                self.stop(reason: "O disco ficou com pouco espaço livre; a gravação foi encerrada e o trecho gravado foi salvo.")
                return
            }
            let folder = URL(fileURLWithPath: store.manifest.outputFolder, isDirectory: true)
            if !FileManager.default.isWritableFile(atPath: folder.path),
               !self.warnings.contains(where: { $0.hasPrefix("A pasta de saída") }) {
                self.warnings.append("A pasta de saída ficou inacessível durante a gravação; o vídeo será salvo em Filmes/Recorte.")
            }
        }
        RunLoop.main.add(healthTimer!, forMode: .common)
    }

    // MARK: Finalização

    private func finalizeRecording() {
        guard let store = store else { state = .idle; return }
        let hud = ProgressHUD(title: "Finalizando o vídeo…")
        hud.show()
        progressWindow = hud
        let muxer = Muxer()
        self.muxer = muxer
        hud.onCancel = { muxer.cancel() }
        store.finalize(muxer: muxer, progress: { p in
            DispatchQueue.main.async { hud.progress = p }
        }, completion: { [weak self] result in
            guard let self = self else { return }
            hud.close()
            self.progressWindow = nil
            self.muxer = nil
            self.store = nil
            self.state = .idle
            switch result {
            case .success(let (url, markers, duration)):
                store.remove()
                RecLibrary.add(url: url, duration: duration, markers: markers)
                if !self.warnings.isEmpty {
                    self.alert("Gravação salva com avisos", self.warnings.joined(separator: "\n\n"))
                }
                Toast.show("Gravação salva", subtitle: url.lastPathComponent, duration: 2)
                self.onFinished?(url)
            case .failure(let error):
                store.setStatus("recording")
                self.alert("Não foi possível finalizar o vídeo",
                           "\(error.localizedDescription)\n\nOs trechos gravados foram preservados. "
                           + "Use “Recuperar gravação incompleta” no menu do Recorte para tentar de novo.")
            }
        })
    }

    /// Recupera uma gravação interrompida. Mantém os dados se falhar.
    func recover(_ store: RecSessionStore, completion: @escaping (URL?) -> Void) {
        let hud = ProgressHUD(title: "Recuperando gravação…")
        hud.show()
        let muxer = Muxer()
        hud.onCancel = { muxer.cancel() }
        store.finalize(muxer: muxer, progress: { p in
            DispatchQueue.main.async { hud.progress = p }
        }, completion: { result in
            hud.close()
            switch result {
            case .success(let (url, markers, duration)):
                store.remove()
                RecLibrary.add(url: url, duration: duration, markers: markers)
                completion(url)
            case .failure(let error):
                store.setStatus("recording")
                self.alert("Não foi possível recuperar a gravação",
                           "\(error.localizedDescription)\n\nOs dados temporários foram mantidos para outra tentativa.")
                completion(nil)
            }
        })
    }

    // MARK: Utilidades

    static func format(_ seconds: Double) -> String {
        let s = Int(seconds.rounded(.down))
        if s >= 3600 { return String(format: "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60) }
        return String(format: "%02d:%02d", s / 60, s % 60)
    }

    private func ask(_ title: String, _ text: String, buttons: [String]) -> Int {
        if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
            print("AVISO: \(title) — \(text.replacingOccurrences(of: "\n", with: " "))")
            return 0
        }
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        for b in buttons { alert.addButton(withTitle: b) }
        let r = alert.runModal()
        return r.rawValue - NSApplication.ModalResponse.alertFirstButtonReturn.rawValue
    }

    private func alert(_ title: String, _ text: String) {
        _ = ask(title, text, buttons: ["OK"])
    }

    private func notify(_ title: String, _ text: String) {
        if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil { print("AVISO: \(title) — \(text)") }
        Toast.show(title, subtitle: text, duration: 3)
    }
}
