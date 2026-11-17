import Cocoa
import AVFoundation
import Carbon

/// Contagem regressiva no centro da área a gravar. Esc cancela.
final class CountdownWindow: NSWindow {
    private var remaining: Int
    private let label = NSTextField(labelWithString: "")
    private var timer: Timer?
    private var monitor: Any?
    private let onFinish: () -> Void
    private let onCancel: () -> Void

    init(around rect: NSRect, seconds: Int, onFinish: @escaping () -> Void, onCancel: @escaping () -> Void) {
        remaining = seconds
        self.onFinish = onFinish
        self.onCancel = onCancel
        let size: CGFloat = 160
        let frame = NSRect(x: rect.midX - size / 2, y: rect.midY - size / 2, width: size, height: size + 34)
        super.init(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        level = .screenSaver
        hasShadow = true
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let circle = DarkFillView(radius: size / 2)
        circle.frame = NSRect(x: 0, y: 34, width: size, height: size)
        let content = NSView(frame: NSRect(origin: .zero, size: frame.size))
        content.addSubview(circle)
        label.font = NSFont.systemFont(ofSize: 84, weight: .semibold)
        label.textColor = .white
        label.alignment = .center
        label.frame = NSRect(x: 0, y: 34 + (size - 100) / 2, width: size, height: 100)
        content.addSubview(label)
        let hint = NSTextField(labelWithString: "Esc cancela")
        hint.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        hint.textColor = .white
        hint.alignment = .center
        hint.frame = NSRect(x: 0, y: 6, width: size, height: 18)
        let pill = DarkFillView(radius: 11)
        pill.frame = NSRect(x: size / 2 - 50, y: 3, width: 100, height: 24)
        content.addSubview(pill)
        content.addSubview(hint)
        contentView = content
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var canBecomeKey: Bool { return true }

    func show() {
        label.stringValue = "\(remaining)"
        NSApp.activate(ignoringOtherApps: true)
        makeKeyAndOrderFront(nil)
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if Int(event.keyCode) == kVK_Escape {
                self?.cancel()
                return nil
            }
            return event
        }
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func tick() {
        remaining -= 1
        if remaining <= 0 {
            cleanup()
            // A janela some antes do primeiro quadro.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.onFinish() }
        } else {
            label.stringValue = "\(remaining)"
        }
    }

    func cancel() {
        cleanup()
        onCancel()
    }

    private func cleanup() {
        timer?.invalidate()
        timer = nil
        if let m = monitor { NSEvent.removeMonitor(m) }
        monitor = nil
        orderOut(nil)
    }
}

/// Janela pequena com barra de progresso (finalizar, recuperar, exportar corte).
final class ProgressHUD: NSWindow {
    private let bar = NSProgressIndicator()
    private let percent = NSTextField(labelWithString: "0%")
    var onCancel: (() -> Void)?

    var progress: Double = 0 {
        didSet {
            bar.doubleValue = progress * 100
            percent.stringValue = "\(Int(progress * 100))%"
        }
    }

    init(title: String) {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 340, height: 110),
                   styleMask: [.titled, .fullSizeContentView], backing: .buffered, defer: false)
        titlebarAppearsTransparent = true
        titleVisibility = .hidden
        isReleasedWhenClosed = false
        level = .floating
        let bg = NSVisualEffectView()
        bg.material = .hudWindow
        bg.blendingMode = .behindWindow
        bg.state = .active
        contentView = bg

        let label = NSTextField(labelWithString: title)
        label.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        bar.isIndeterminate = false
        bar.minValue = 0
        bar.maxValue = 100
        bar.style = .bar
        percent.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        percent.textColor = .secondaryLabelColor
        let cancel = NSButton(title: "Cancelar", target: nil, action: nil)
        cancel.bezelStyle = .rounded
        cancel.controlSize = .small
        cancel.target = self
        cancel.action = #selector(cancelPressed)
        let row = NSStackView(views: [percent, NSView(), cancel])
        row.orientation = .horizontal
        let stack = NSStackView(views: [label, bar, row])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        bg.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: bg.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: bg.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: bg.topAnchor, constant: 24),
            bar.widthAnchor.constraint(equalTo: stack.widthAnchor),
            row.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    @objc private func cancelPressed() {
        onCancel?()
    }

    func show() {
        center()
        NSApp.activate(ignoringOtherApps: true)
        makeKeyAndOrderFront(nil)
    }
}

/// Medidor de nível de áudio (verde → amarelo → vermelho).
final class LevelMeterView: NSView {
    var value: Float = 0 { didSet { if abs(value - oldValue) > 0.005 { needsDisplay = true } } }

    override var intrinsicContentSize: NSSize { return NSSize(width: 140, height: 8) }

    override func draw(_ dirtyRect: NSRect) {
        let r = bounds.insetBy(dx: 0.5, dy: 0.5)
        let bg = NSBezierPath(roundedRect: r, xRadius: r.height / 2, yRadius: r.height / 2)
        NSColor.labelColor.withAlphaComponent(0.12).setFill()
        bg.fill()
        let v = CGFloat(AudioLevel.meterValue(value))
        guard v > 0 else { return }
        NSGraphicsContext.saveGraphicsState()
        bg.addClip()
        let fill = NSRect(x: r.minX, y: r.minY, width: r.width * v, height: r.height)
        let gradient = NSGradient(colors: [.systemGreen, .systemGreen, .systemYellow, .systemRed],
                                  atLocations: [0, 0.6, 0.85, 1], colorSpace: .sRGB)
        gradient?.draw(in: NSRect(x: r.minX, y: r.minY, width: r.width, height: r.height), angle: 0)
        NSColor.labelColor.withAlphaComponent(0.12).setFill()
        NSRect(x: fill.maxX, y: r.minY, width: r.maxX - fill.maxX, height: r.height).fill()
        NSGraphicsContext.restoreGraphicsState()
    }
}

/// Liga as fontes de áudio só para os medidores e para o teste de 5 segundos.
final class AudioMonitor: NSObject, CaptureSourcesDelegate {
    private var sources: CaptureSources?
    private var writer: ChunkWriter?
    private var testURL: URL?
    private var player: AVPlayer?
    private(set) var running = false

    func start(profile: RecProfile, completion: ((String?) -> Void)? = nil) {
        stop()
        let wantsMic = profile.microphone && AVCaptureDevice.authorizationStatus(for: .audio) == .authorized
        let mic = wantsMic ? AudioDevices.microphone(uid: profile.micDeviceUID) : nil
        var system = profile.systemAudio
        if system && !CaptureSources.systemAudioViaSCK && AudioDevices.blackHole() == nil { system = false }
        if system && CaptureSources.systemAudioViaSCK {
            if #available(macOS 10.15, *), !CGPreflightScreenCaptureAccess() { system = false }
        }
        guard mic != nil || system, let screen = NSScreen.main else {
            completion?(nil)
            return
        }
        let req = CaptureRequest(screen: screen, rect: NSRect(x: 0, y: 0, width: 2, height: 2), video: false,
                                 systemAudio: system, microphone: mic, fps: 1)
        let s = CaptureSources(request: req)
        s.delegate = self
        sources = s
        running = true
        s.start { error in completion?(error) }
    }

    func stop() {
        sources?.stop()
        sources = nil
        running = false
    }

    func level(_ kind: AudioKind) -> Float {
        return sources?.level(kind) ?? 0
    }

    /// Grava 5 s das fontes escolhidas e toca em seguida.
    func runTest(profile: RecProfile, status: @escaping (String) -> Void, done: @escaping () -> Void) {
        stop()
        player?.pause()
        var kinds: [AudioKind] = []
        if profile.systemAudio { kinds.append(.system) }
        if profile.microphone { kinds.append(.mic) }
        guard !kinds.isEmpty else {
            status("Ative pelo menos uma fonte de áudio.")
            done()
            return
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("recorte-teste-\(UUID().uuidString).mov")
        do {
            writer = try ChunkWriter(url: url, video: nil, audioKinds: kinds, audioBitrate: profile.audioQuality.bitrate)
        } catch {
            status("Não foi possível iniciar o teste: \(error.localizedDescription)")
            done()
            return
        }
        start(profile: profile) { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                status(error)
                self.stop()
                done()
                return
            }
            var left = 5
            status("Gravando… \(left)")
            let t = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { timer in
                left -= 1
                if left > 0 { status("Gravando… \(left)"); return }
                timer.invalidate()
                self.finishTest(url: url, kinds: kinds, profile: profile, status: status, done: done)
            }
            RunLoop.main.add(t, forMode: .common)
        }
    }

    private func finishTest(url: URL, kinds: [AudioKind], profile: RecProfile,
                            status: @escaping (String) -> Void, done: @escaping () -> Void) {
        let w = writer
        stop()
        writer = nil
        status("Preparando reprodução…")
        guard let chunk = w else { done(); return }
        chunk.finish { ok in
            DispatchQueue.main.async {
                guard ok else { status("Nenhum áudio foi recebido das fontes escolhidas."); done(); return }
                let out = FileManager.default.temporaryDirectory.appendingPathComponent("recorte-teste-\(UUID().uuidString).m4a")
                let muxer = Muxer()
                var volumes: [AudioKind: Float] = [:]
                volumes[.system] = profile.systemVolume
                volumes[.mic] = profile.micVolume
                muxer.export(segments: [Muxer.Segment(url: url, range: nil, audioKinds: kinds)],
                             audio: .mix(bitrate: profile.audioQuality.bitrate, volumes: volumes),
                             markers: [], output: out, progress: { _ in }) { error in
                    try? FileManager.default.removeItem(at: url)
                    if let error = error {
                        status("Falha no teste: \(error.localizedDescription)")
                        done()
                        return
                    }
                    status("Reproduzindo o teste…")
                    let item = AVPlayerItem(url: out)
                    let player = AVPlayer(playerItem: item)
                    self.player = player
                    NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item,
                                                           queue: .main) { _ in
                        status("Teste concluído. Ouviu as duas fontes?")
                        try? FileManager.default.removeItem(at: out)
                        done()
                    }
                    player.play()
                }
            }
        }
    }

    func captureSources(_ sources: CaptureSources, didOutputVideo pixelBuffer: CVPixelBuffer, at time: CMTime) {}

    func captureSources(_ sources: CaptureSources, didOutputAudio sampleBuffer: CMSampleBuffer, kind: AudioKind) {
        writer?.append(audio: sampleBuffer, kind: kind)
    }

    func captureSources(_ sources: CaptureSources, sourceFailed kind: String, message: String, fatal: Bool) {}
}
