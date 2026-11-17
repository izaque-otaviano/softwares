import Cocoa
import AVFoundation
import Carbon

// MARK: - Identidade visual da barra (mesma família do ícone do app)

enum RecTheme {
    static let navy = NSColor(calibratedRed: 0x1B / 255, green: 0x20 / 255, blue: 0x30 / 255, alpha: 0.88)
    static let lavender = NSColor(calibratedRed: 0x9A / 255, green: 0xB2 / 255, blue: 0xE6 / 255, alpha: 1)
    static let record = NSColor(calibratedRed: 1, green: 0x45 / 255, blue: 0x3A / 255, alpha: 1)
    static let text = NSColor(white: 1, alpha: 0.92)
    static let secondary = NSColor(white: 1, alpha: 0.55)
    static let hairline = NSColor(white: 1, alpha: 0.12)

    /// SF Symbols no macOS 11+; no 10.14, o desenho equivalente.
    static func symbol(_ name: String, fallback: NSImage) -> NSImage {
        if #available(macOS 11.0, *),
           let image = NSImage(systemSymbolName: name, accessibilityDescription: nil)?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 14, weight: .medium)) {
            return image
        }
        return fallback
    }
}

/// Ícones desenhados (usados no macOS 10.14, onde não há SF Symbols).
enum RecIcons {
    private static func icon(_ draw: @escaping (NSRect) -> Void) -> NSImage {
        let image = NSImage(size: NSSize(width: 20, height: 20), flipped: false) { rect in
            NSColor.black.set()
            draw(rect)
            return true
        }
        image.isTemplate = true
        return image
    }

    private static func stroke(_ p: NSBezierPath, _ w: CGFloat = 1.6) {
        p.lineWidth = w
        p.lineCapStyle = roundLineCap
        p.lineJoinStyle = roundLineJoin
        p.stroke()
    }

    static let fullScreen = icon { _ in
        stroke(NSBezierPath(roundedRect: NSRect(x: 2.5, y: 4.5, width: 15, height: 11), xRadius: 2, yRadius: 2))
    }
    static let window = icon { _ in
        stroke(NSBezierPath(roundedRect: NSRect(x: 3, y: 4, width: 14, height: 12), xRadius: 2, yRadius: 2))
        let bar = NSBezierPath()
        bar.move(to: NSPoint(x: 3, y: 12.5)); bar.line(to: NSPoint(x: 17, y: 12.5))
        stroke(bar, 1.2)
    }
    static let area = icon { _ in
        let p = NSBezierPath(rect: NSRect(x: 3.5, y: 4.5, width: 13, height: 11))
        p.setLineDash([2.5, 2], count: 2, phase: 0)
        stroke(p, 1.4)
    }
    static let speaker = icon { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 3, y: 8)); p.line(to: NSPoint(x: 6, y: 8)); p.line(to: NSPoint(x: 10, y: 4.5))
        p.line(to: NSPoint(x: 10, y: 15.5)); p.line(to: NSPoint(x: 6, y: 12)); p.line(to: NSPoint(x: 3, y: 12)); p.close()
        p.fill()
        let w = NSBezierPath()
        w.appendArc(withCenter: NSPoint(x: 10, y: 10), radius: 4.5, startAngle: -40, endAngle: 40)
        w.move(to: NSPoint(x: 10 + 7 * cos(-0.7), y: 10 + 7 * sin(-0.7)))
        w.appendArc(withCenter: NSPoint(x: 10, y: 10), radius: 7, startAngle: -40, endAngle: 40)
        stroke(w, 1.4)
    }
    static let mic = icon { _ in
        stroke(NSBezierPath(roundedRect: NSRect(x: 7.5, y: 7.5, width: 5, height: 9), xRadius: 2.5, yRadius: 2.5))
        let p = NSBezierPath()
        p.appendArc(withCenter: NSPoint(x: 10, y: 10), radius: 5, startAngle: 200, endAngle: 340)
        p.move(to: NSPoint(x: 10, y: 5)); p.line(to: NSPoint(x: 10, y: 2.5))
        stroke(p, 1.4)
    }
    static let camera = icon { _ in
        stroke(NSBezierPath(roundedRect: NSRect(x: 2.5, y: 5.5, width: 11, height: 9), xRadius: 2, yRadius: 2))
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 13.5, y: 9)); p.line(to: NSPoint(x: 17.5, y: 6.5)); p.line(to: NSPoint(x: 17.5, y: 13.5))
        p.line(to: NSPoint(x: 13.5, y: 11))
        stroke(p, 1.4)
    }
    static let gear = icon { _ in
        stroke(NSBezierPath(ovalIn: NSRect(x: 7, y: 7, width: 6, height: 6)), 1.5)
        let p = NSBezierPath()
        for i in 0..<8 {
            let a = CGFloat(i) * .pi / 4
            p.move(to: NSPoint(x: 10 + cos(a) * 5.5, y: 10 + sin(a) * 5.5))
            p.line(to: NSPoint(x: 10 + cos(a) * 7.5, y: 10 + sin(a) * 7.5))
        }
        stroke(p, 1.8)
    }
    static let pause = icon { _ in
        NSBezierPath(roundedRect: NSRect(x: 5.5, y: 4.5, width: 3, height: 11), xRadius: 1, yRadius: 1).fill()
        NSBezierPath(roundedRect: NSRect(x: 11.5, y: 4.5, width: 3, height: 11), xRadius: 1, yRadius: 1).fill()
    }
    static let play = icon { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 6, y: 4.5)); p.line(to: NSPoint(x: 15.5, y: 10)); p.line(to: NSPoint(x: 6, y: 15.5)); p.close()
        p.fill()
    }
    static let marker = icon { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 5, y: 3)); p.line(to: NSPoint(x: 5, y: 17))
        stroke(p, 1.6)
        let f = NSBezierPath()
        f.move(to: NSPoint(x: 5, y: 16.5)); f.line(to: NSPoint(x: 15.5, y: 14)); f.line(to: NSPoint(x: 5, y: 10.5)); f.close()
        f.fill()
    }
    static let stop = icon { _ in
        NSBezierPath(roundedRect: NSRect(x: 5, y: 5, width: 10, height: 10), xRadius: 2, yRadius: 2).fill()
    }
    static let trash = icon { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 4, y: 14.5)); p.line(to: NSPoint(x: 16, y: 14.5))
        p.move(to: NSPoint(x: 8, y: 14.5)); p.line(to: NSPoint(x: 8.5, y: 16.5)); p.line(to: NSPoint(x: 11.5, y: 16.5)); p.line(to: NSPoint(x: 12, y: 14.5))
        p.move(to: NSPoint(x: 5.5, y: 14.5)); p.line(to: NSPoint(x: 6.5, y: 3.5)); p.line(to: NSPoint(x: 13.5, y: 3.5)); p.line(to: NSPoint(x: 14.5, y: 14.5))
        stroke(p, 1.4)
    }
    static let close = Icons.close
}

// MARK: - Peças da barra

/// Botão da barra: ícone (e, se houver, texto). Pode ser alternável (ligado = lavanda).
final class BarButton: NSView {
    var onClick: (() -> Void)?
    var isOn = false { didSet { needsDisplay = true } }
    var isToggle = false
    var isEnabled = true { didSet { needsDisplay = true; alphaValue = isEnabled ? 1 : 0.35 } }
    var title: String { didSet { invalidateIntrinsicContentSize(); needsDisplay = true } }
    var image: NSImage { didSet { needsDisplay = true } }
    var tint: NSColor?
    let tip: String
    private var hover = false { didSet { needsDisplay = true } }
    private var pressed = false { didSet { needsDisplay = true } }
    private let font = NSFont.systemFont(ofSize: 12, weight: .medium)

    init(image: NSImage, title: String = "", tip: String, toggle: Bool = false) {
        self.image = image
        self.title = title
        self.tip = tip
        self.isToggle = toggle
        super.init(frame: .zero)
        toolTip = tip
        setAccessibilityRole(toggle ? .checkBox : .button)
        setAccessibilityLabel(tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var intrinsicContentSize: NSSize {
        if title.isEmpty { return NSSize(width: 34, height: 34) }
        let w = (title as NSString).size(withAttributes: [.font: font]).width
        return NSSize(width: 34 + w + 10, height: 34)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for a in trackingAreas { removeTrackingArea(a) }
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    override func mouseEntered(with event: NSEvent) { hover = true }
    override func mouseExited(with event: NSEvent) { hover = false }
    override func mouseDown(with event: NSEvent) { if isEnabled { pressed = true } }
    override func mouseUp(with event: NSEvent) {
        pressed = false
        guard isEnabled, bounds.contains(convert(event.locationInWindow, from: nil)) else { return }
        onClick?()
    }

    override func draw(_ dirtyRect: NSRect) {
        let bg = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 2), xRadius: 8, yRadius: 8)
        if isToggle && isOn {
            RecTheme.lavender.withAlphaComponent(pressed ? 0.34 : 0.24).setFill()
            bg.fill()
        } else if pressed {
            NSColor(white: 1, alpha: 0.18).setFill()
            bg.fill()
        } else if hover && isEnabled {
            NSColor(white: 1, alpha: 0.09).setFill()
            bg.fill()
        }
        let color: NSColor = tint ?? (isToggle ? (isOn ? RecTheme.lavender : RecTheme.secondary) : RecTheme.text)
        let iconRect = NSRect(x: 8, y: bounds.midY - 9, width: 18, height: 18)
        Icons.drawTinted(image, in: iconRect, color: color)
        if !title.isEmpty {
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: isToggle && !isOn ? RecTheme.secondary : RecTheme.text]
            let size = (title as NSString).size(withAttributes: attrs)
            (title as NSString).draw(at: NSPoint(x: 31, y: bounds.midY - size.height / 2), withAttributes: attrs)
        }
    }
}

/// O botão principal: círculo vermelho com anel lavanda ("Gravar").
final class RecordButton: NSView {
    var onClick: (() -> Void)?
    private var hover = false { didSet { needsDisplay = true } }
    private var pressed = false { didSet { needsDisplay = true } }
    private let font = NSFont.systemFont(ofSize: 13, weight: .semibold)

    override init(frame: NSRect) {
        super.init(frame: frame)
        toolTip = "Começar a gravar (Enter)"
        setAccessibilityRole(.button)
        setAccessibilityLabel("Gravar")
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var intrinsicContentSize: NSSize { return NSSize(width: 104, height: 34) }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for a in trackingAreas { removeTrackingArea(a) }
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    override func mouseEntered(with event: NSEvent) { hover = true }
    override func mouseExited(with event: NSEvent) { hover = false }
    override func mouseDown(with event: NSEvent) { pressed = true }
    override func mouseUp(with event: NSEvent) {
        pressed = false
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }

    override func draw(_ dirtyRect: NSRect) {
        let pill = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 2), xRadius: 15, yRadius: 15)
        NSColor(white: 1, alpha: pressed ? 0.24 : (hover ? 0.18 : 0.12)).setFill()
        pill.fill()
        let dot = NSRect(x: 10, y: bounds.midY - 8, width: 16, height: 16)
        let ring = NSBezierPath(ovalIn: dot.insetBy(dx: -2.5, dy: -2.5))
        ring.lineWidth = 1.5
        RecTheme.lavender.setStroke()
        ring.stroke()
        RecTheme.record.setFill()
        NSBezierPath(ovalIn: dot).fill()
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: RecTheme.text]
        let size = ("Gravar" as NSString).size(withAttributes: attrs)
        ("Gravar" as NSString).draw(at: NSPoint(x: 36, y: bounds.midY - size.height / 2), withAttributes: attrs)
    }
}

/// Medidor bem fino, embaixo do botão de áudio.
final class MiniMeter: NSView {
    var value: Float = 0 { didSet { if abs(value - oldValue) > 0.01 { needsDisplay = true } } }

    override func draw(_ dirtyRect: NSRect) {
        let r = bounds
        NSColor(white: 1, alpha: 0.12).setFill()
        NSBezierPath(roundedRect: r, xRadius: r.height / 2, yRadius: r.height / 2).fill()
        let v = CGFloat(AudioLevel.meterValue(value))
        guard v > 0 else { return }
        let color: NSColor = v > 0.92 ? RecTheme.record : (v > 0.75 ? .systemYellow : .systemGreen)
        color.setFill()
        NSBezierPath(roundedRect: NSRect(x: r.minX, y: r.minY, width: max(r.height, r.width * v), height: r.height),
                     xRadius: r.height / 2, yRadius: r.height / 2).fill()
    }
}

/// Fundo das barras: material HUD da Apple + véu azul-marinho + borda fina.
final class BarBackground: NSVisualEffectView {
    init(radius: CGFloat) {
        super.init(frame: .zero)
        material = .hudWindow
        blendingMode = .behindWindow
        state = .active
        appearance = NSAppearance(named: .darkAqua)
        maskImage = Icons.roundedMask(radius: radius)
        let tint = NavyTint(radius: radius)
        tint.autoresizingMask = [.width, .height]
        addSubview(tint)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)  // arrastar a barra pelo fundo
    }

    private final class NavyTint: NSView {
        let radius: CGFloat
        init(radius: CGFloat) {
            self.radius = radius
            super.init(frame: .zero)
        }
        required init?(coder: NSCoder) { fatalError("init(coder:) não é usado") }
        override func hitTest(_ point: NSPoint) -> NSView? { return nil }
        override func draw(_ dirtyRect: NSRect) {
            let p = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: radius, yRadius: radius)
            RecTheme.navy.setFill()
            p.fill()
            p.lineWidth = 1
            RecTheme.hairline.setStroke()
            p.stroke()
        }
    }
}

private func barSeparator() -> NSView {
    let v = NSView()
    v.wantsLayer = true
    v.layer?.backgroundColor = RecTheme.hairline.cgColor
    v.translatesAutoresizingMaskIntoConstraints = false
    v.widthAnchor.constraint(equalToConstant: 1).isActive = true
    v.heightAnchor.constraint(equalToConstant: 22).isActive = true
    return v
}

/// Painel flutuante que pode receber teclado (Esc / Enter) sem roubar o foco dos outros apps.
class BarPanel: NSPanel {
    var onKey: ((NSEvent) -> Bool)?

    init(size: NSSize) {
        super.init(contentRect: NSRect(origin: .zero, size: size),
                   styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        level = .statusBar
        isFloatingPanel = true
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        isMovableByWindowBackground = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    }

    override var canBecomeKey: Bool { return true }

    override func keyDown(with event: NSEvent) {
        if onKey?(event) != true { super.keyDown(with: event) }
    }
}

// MARK: - Barra de configuração (antes de gravar)

/// Abre com "Gravar tela": escolher o que gravar, fontes de áudio, webcam e opções.
final class RecSetupBar: NSObject {
    static let shared = RecSetupBar()

    enum Target { case fullScreen, window, area }

    private var panel: BarPanel?
    private var target: Target = .fullScreen
    private var targetButtons: [Target: BarButton] = [:]
    private var systemButton: BarButton!
    private var micButton: BarButton!
    private var webcamButton: BarButton!
    private let systemMeter = MiniMeter()
    private let micMeter = MiniMeter()
    private let monitor = AudioMonitor()
    private var meterTimer: Timer?
    private var profile = RecSettings.current

    /// Chamado ao clicar em "Gravar": alvo escolhido e perfil ajustado.
    var onRecord: ((Target, RecProfile) -> Void)?

    var isVisible: Bool { return panel?.isVisible ?? false }

    func show() {
        if isVisible { panel?.makeKeyAndOrderFront(nil); return }
        profile = RecSettings.current
        switch profile.areaMode {
        case .fullScreen: target = .fullScreen
        case .lastArea, .select: target = .area
        }
        let p = build()
        panel = p
        let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main
        let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        p.setFrameOrigin(NSPoint(x: (area.midX - p.frame.width / 2).rounded(), y: area.minY + 28))
        p.alphaValue = 0
        p.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.18
            p.animator().alphaValue = 1
        }, completionHandler: nil)
        startMeters()
    }

    func close() {
        meterTimer?.invalidate()
        meterTimer = nil
        monitor.stop()
        panel?.orderOut(nil)
        panel = nil
    }

    private func build() -> BarPanel {
        let close = BarButton(image: RecTheme.symbol("xmark", fallback: RecIcons.close), tip: "Fechar (Esc)")
        close.onClick = { [weak self] in self?.close() }

        let full = BarButton(image: RecTheme.symbol("rectangle", fallback: RecIcons.fullScreen),
                             title: "Tela inteira", tip: "Gravar a tela inteira", toggle: true)
        let window = BarButton(image: RecTheme.symbol("macwindow", fallback: RecIcons.window),
                               title: "Janela", tip: "Gravar uma janela (clique nela)", toggle: true)
        let area = BarButton(image: RecTheme.symbol("rectangle.dashed", fallback: RecIcons.area),
                             title: "Área", tip: "Gravar uma área (arraste para escolher)", toggle: true)
        targetButtons = [.fullScreen: full, .window: window, .area: area]
        for (t, b) in targetButtons { b.onClick = { [weak self] in self?.select(t) } }

        systemButton = BarButton(image: RecTheme.symbol("speaker.wave.2", fallback: RecIcons.speaker),
                                 title: "Som do Mac", tip: "Gravar o som do Mac", toggle: true)
        systemButton.onClick = { [weak self] in self?.toggle(\.systemAudio) }
        micButton = BarButton(image: RecTheme.symbol("mic", fallback: RecIcons.mic),
                              title: "Microfone", tip: "Gravar o microfone", toggle: true)
        micButton.onClick = { [weak self] in self?.toggle(\.microphone) }
        webcamButton = BarButton(image: RecTheme.symbol("video", fallback: RecIcons.camera),
                                 title: "Webcam", tip: "Sobrepor a webcam no vídeo", toggle: true)
        webcamButton.onClick = { [weak self] in self?.toggle(\.webcam) }

        let options = BarButton(image: RecTheme.symbol("gearshape", fallback: RecIcons.gear),
                                title: "Opções", tip: "Perfil, contagem, cliques, qualidade, microfone e tela")
        options.onClick = { [weak self, weak options] in
            guard let self = self, let o = options else { return }
            self.showOptionsMenu(from: o)
        }

        let record = RecordButton(frame: .zero)
        record.onClick = { [weak self] in self?.record() }

        let systemStack = withMeter(systemButton, systemMeter)
        let micStack = withMeter(micButton, micMeter)

        let row = NSStackView(views: [close, barSeparator(), full, window, area, barSeparator(),
                                      systemStack, micStack, webcamButton, barSeparator(), options, record])
        row.orientation = .horizontal
        row.spacing = 2
        row.alignment = .centerY
        row.setCustomSpacing(8, after: close)
        row.setCustomSpacing(10, after: options)
        row.translatesAutoresizingMaskIntoConstraints = false

        let bg = BarBackground(radius: 14)
        bg.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: bg.leadingAnchor, constant: 8),
            row.trailingAnchor.constraint(equalTo: bg.trailingAnchor, constant: -8),
            row.topAnchor.constraint(equalTo: bg.topAnchor, constant: 7),
            row.bottomAnchor.constraint(equalTo: bg.bottomAnchor, constant: -7),
        ])
        bg.layoutSubtreeIfNeeded()
        let size = bg.fittingSize
        let p = BarPanel(size: size)
        bg.frame = NSRect(origin: .zero, size: size)
        p.contentView = bg
        p.onKey = { [weak self] e in
            switch Int(e.keyCode) {
            case kVK_Escape: self?.close(); return true
            case kVK_Return, kVK_ANSI_KeypadEnter: self?.record(); return true
            default: return false
            }
        }
        refresh()
        return p
    }

    private func withMeter(_ button: BarButton, _ meter: MiniMeter) -> NSView {
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false
        button.translatesAutoresizingMaskIntoConstraints = false
        meter.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(button)
        container.addSubview(meter)
        NSLayoutConstraint.activate([
            button.topAnchor.constraint(equalTo: container.topAnchor),
            button.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            button.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            button.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            meter.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 31),
            meter.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -10),
            meter.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -4),
            meter.heightAnchor.constraint(equalToConstant: 3),
        ])
        return container
    }

    private func refresh() {
        for (t, b) in targetButtons { b.isOn = t == target }
        systemButton.isOn = profile.systemAudio
        micButton.isOn = profile.microphone
        webcamButton.isOn = profile.webcam
        webcamButton.isEnabled = !WebcamSource.cameras().isEmpty
        if !webcamButton.isEnabled { webcamButton.toolTip = "Nenhuma câmera conectada" }
        systemMeter.isHidden = !profile.systemAudio
        micMeter.isHidden = !profile.microphone
    }

    private func select(_ t: Target) {
        target = t
        refresh()
    }

    private func toggle(_ key: WritableKeyPath<RecProfile, Bool>) {
        profile[keyPath: key].toggle()
        RecSettings.save(profile)
        refresh()
        startMeters()
    }

    private func startMeters() {
        monitor.start(profile: profile)
        meterTimer?.invalidate()
        let t = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.systemMeter.value = self.monitor.level(.system)
            self.micMeter.value = self.monitor.level(.mic)
        }
        RunLoop.main.add(t, forMode: .common)
        meterTimer = t
    }

    private func record() {
        RecSettings.save(profile)
        let chosen = target
        let p = profile
        close()
        onRecord?(chosen, p)
    }

    // MARK: Opções

    private func showOptionsMenu(from view: NSView) {
        let menu = NSMenu()
        func item(_ title: String, _ on: Bool, _ action: @escaping () -> Void) -> NSMenuItem {
            let i = ClosureMenuItem(title: title, handler: action)
            i.state = on ? .on : .off
            return i
        }
        let profiles = NSMenuItem(title: "Perfil: \(profile.name)", action: nil, keyEquivalent: "")
        let pm = NSMenu()
        for name in RecProfile.names {
            pm.addItem(item(name, name == profile.name) { [weak self] in
                RecSettings.currentProfileName = name
                self?.profile = RecSettings.current
                self?.refresh()
                self?.startMeters()
            })
        }
        profiles.submenu = pm
        menu.addItem(profiles)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(item("Contagem regressiva de 3 s", profile.countdown) { [weak self] in self?.toggle(\.countdown) })
        menu.addItem(item("Destacar cliques", profile.clickHighlight) { [weak self] in self?.toggle(\.clickHighlight) })

        let quality = NSMenuItem(title: "Qualidade do vídeo", action: nil, keyEquivalent: "")
        let qm = NSMenu()
        for q in RecVideoQuality.allCases {
            qm.addItem(item(q.title, q == profile.videoQuality) { [weak self] in
                self?.profile.videoQuality = q
                if let p = self?.profile { RecSettings.save(p) }
            })
        }
        quality.submenu = qm
        menu.addItem(quality)

        let mics = NSMenuItem(title: "Microfone", action: nil, keyEquivalent: "")
        let mm = NSMenu()
        mm.addItem(item("Padrão do sistema", profile.micDeviceUID == nil) { [weak self] in
            self?.profile.micDeviceUID = nil
            if let p = self?.profile { RecSettings.save(p) }
            self?.startMeters()
        })
        for d in AudioDevices.microphones() {
            mm.addItem(item(d.localizedName, profile.micDeviceUID == d.uniqueID) { [weak self] in
                self?.profile.micDeviceUID = d.uniqueID
                if let p = self?.profile { RecSettings.save(p) }
                self?.startMeters()
            })
        }
        mics.submenu = mm
        menu.addItem(mics)

        if NSScreen.screens.count > 1 {
            let screens = NSMenuItem(title: "Tela", action: nil, keyEquivalent: "")
            let sm = NSMenu()
            sm.addItem(item("Onde está o mouse", profile.displayID == nil) { [weak self] in
                self?.profile.displayID = nil
                if let p = self?.profile { RecSettings.save(p) }
            })
            for s in NSScreen.screens {
                let id = s.displayID
                sm.addItem(item(s.recorteName, profile.displayID == id) { [weak self] in
                    self?.profile.displayID = id
                    if let p = self?.profile { RecSettings.save(p) }
                })
            }
            screens.submenu = sm
            menu.addItem(screens)
        }
        if RecSettings.lastArea?.validScreen() != nil {
            menu.addItem(NSMenuItem.separator())
            menu.addItem(item("Gravar a última área", false) { [weak self] in
                guard let self = self else { return }
                RecSettings.save(self.profile)
                self.close()
                (NSApp.delegate as? AppDelegate)?.recordLastArea(nil)
            })
        }
        menu.addItem(NSMenuItem.separator())
        menu.addItem(item("Mais preferências…", false) {
            (NSApp.delegate as? AppDelegate)?.showRecordingPreferences(nil)
        })
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: view.bounds.height + 6), in: view)
    }
}

/// Item de menu com ação em closure.
final class ClosureMenuItem: NSMenuItem {
    private let handler: () -> Void

    init(title: String, handler: @escaping () -> Void) {
        self.handler = handler
        super.init(title: title, action: #selector(run), keyEquivalent: "")
        target = self
    }

    required init(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    @objc private func run() { handler() }
}

// MARK: - Barra de controle (durante a gravação)

/// Barra compacta no topo: tempo, medidores, pausar, marcador, webcam, parar e cancelar.
/// No ScreenCaptureKit ela não aparece no vídeo; no Mojave ela se esconde se ficaria
/// dentro da área gravada (os controles continuam no menu e nos atalhos).
final class RecControlBar: NSObject {
    static let shared = RecControlBar()

    private var panel: BarPanel?
    private let timeLabel = NSTextField(labelWithString: "00:00")
    private let dot = NSView()
    private let systemMeter = MiniMeter()
    private let micMeter = MiniMeter()
    private var pauseButton: BarButton!
    private var webcamButton: BarButton!
    private var timer: Timer?

    func update() {
        let r = Recorder.shared
        switch r.state {
        case .recording, .paused:
            if panel == nil { show() }
            refresh()
        case .idle, .finishing, .countdown:
            hide()
        }
    }

    private func show() {
        guard let req = Recorder.shared.request else { return }
        let p = build()
        // Topo da tela gravada, centralizado.
        let screen = req.screen
        let x = (screen.frame.midX - p.frame.width / 2).rounded()
        let y = (screen.visibleFrame.maxY - p.frame.height - 10).rounded()
        p.setFrameOrigin(NSPoint(x: x, y: y))
        // Mojave (sem ScreenCaptureKit): a barra apareceria no vídeo se estivesse na área gravada.
        if !CaptureSources.modernScreenAvailable && p.frame.intersects(req.globalRect) {
            Toast.show("Gravando", subtitle: "Controles no menu do Recorte e nos atalhos (⌥⇧⌘P pausa, ⌥⇧⌘R para).",
                       duration: 3)
            return
        }
        panel = p
        p.orderFrontRegardless()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in self?.refresh() }
        RunLoop.main.add(timer!, forMode: .common)
    }

    private func hide() {
        timer?.invalidate()
        timer = nil
        panel?.orderOut(nil)
        panel = nil
    }

    private func build() -> BarPanel {
        dot.wantsLayer = true
        dot.layer?.cornerRadius = 5
        dot.translatesAutoresizingMaskIntoConstraints = false
        dot.widthAnchor.constraint(equalToConstant: 10).isActive = true
        dot.heightAnchor.constraint(equalToConstant: 10).isActive = true
        timeLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 14, weight: .semibold)
        timeLabel.textColor = RecTheme.text

        let meters = NSStackView(views: [systemMeter, micMeter])
        meters.orientation = .vertical
        meters.spacing = 4
        for m in [systemMeter, micMeter] {
            m.translatesAutoresizingMaskIntoConstraints = false
            m.widthAnchor.constraint(equalToConstant: 46).isActive = true
            m.heightAnchor.constraint(equalToConstant: 3).isActive = true
        }
        meters.toolTip = "Som do Mac (em cima) e microfone (embaixo)"

        pauseButton = BarButton(image: RecTheme.symbol("pause.fill", fallback: RecIcons.pause), tip: "Pausar (⌥⇧⌘P)")
        pauseButton.onClick = { Recorder.shared.togglePause() }
        let marker = BarButton(image: RecTheme.symbol("flag", fallback: RecIcons.marker), tip: "Adicionar marcador (⌥⇧⌘M)")
        marker.onClick = { Recorder.shared.addMarker() }
        webcamButton = BarButton(image: RecTheme.symbol("video", fallback: RecIcons.camera),
                                 tip: "Mostrar ou ocultar a webcam (⌥⇧⌘W)", toggle: true)
        webcamButton.onClick = { Recorder.shared.toggleWebcam() }
        let stop = BarButton(image: RecTheme.symbol("stop.fill", fallback: RecIcons.stop), title: "Parar",
                             tip: "Parar e salvar (⌥⇧⌘R)")
        stop.tint = RecTheme.record
        stop.onClick = { Recorder.shared.stop() }
        let cancel = BarButton(image: RecTheme.symbol("trash", fallback: RecIcons.trash), tip: "Cancelar e descartar")
        cancel.onClick = { RecControlBar.confirmCancel() }

        var views: [NSView] = [dot, timeLabel, meters, barSeparator(), pauseButton, marker]
        if Recorder.shared.webcamActive { views.append(webcamButton) }
        views += [barSeparator(), stop, cancel]
        let row = NSStackView(views: views)
        row.orientation = .horizontal
        row.spacing = 4
        row.alignment = .centerY
        row.setCustomSpacing(8, after: dot)
        row.setCustomSpacing(12, after: timeLabel)
        row.translatesAutoresizingMaskIntoConstraints = false

        let bg = BarBackground(radius: 12)
        bg.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: bg.leadingAnchor, constant: 14),
            row.trailingAnchor.constraint(equalTo: bg.trailingAnchor, constant: -6),
            row.topAnchor.constraint(equalTo: bg.topAnchor, constant: 4),
            row.bottomAnchor.constraint(equalTo: bg.bottomAnchor, constant: -4),
        ])
        bg.layoutSubtreeIfNeeded()
        let size = bg.fittingSize
        let p = BarPanel(size: size)
        bg.frame = NSRect(origin: .zero, size: size)
        p.contentView = bg
        return p
    }

    private func refresh() {
        let r = Recorder.shared
        timeLabel.stringValue = Recorder.format(r.elapsed)
        let paused = r.state == .paused
        // Ponto vermelho "respira" enquanto grava; laranja parado quando pausado.
        let pulse = 0.55 + 0.45 * abs(sin(Date().timeIntervalSince1970 * 2.2))
        dot.layer?.backgroundColor = paused ? NSColor.systemOrange.cgColor
            : RecTheme.record.withAlphaComponent(CGFloat(pulse)).cgColor
        timeLabel.textColor = paused ? NSColor.systemOrange : RecTheme.text
        pauseButton.image = paused ? RecTheme.symbol("play.fill", fallback: RecIcons.play)
                                   : RecTheme.symbol("pause.fill", fallback: RecIcons.pause)
        pauseButton.toolTip = paused ? "Retomar (⌥⇧⌘P)" : "Pausar (⌥⇧⌘P)"
        systemMeter.isHidden = !r.hasSystemAudio
        micMeter.isHidden = !r.hasMicrophone
        systemMeter.value = r.level(.system)
        micMeter.value = r.level(.mic)
        webcamButton.isOn = r.webcamVisible
    }

    static func confirmCancel() {
        if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil { Recorder.shared.cancel(); return }
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = "Descartar esta gravação?"
        a.informativeText = "O que foi gravado até agora será apagado."
        a.addButton(withTitle: "Descartar")
        a.addButton(withTitle: "Continuar gravando")
        if a.runModal() == .alertFirstButtonReturn { Recorder.shared.cancel() }
    }
}
