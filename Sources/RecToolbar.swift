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

// MARK: - Painel de gravação (antes de gravar)

/// Bloco de modo (Área, Tela, Janela, Webcam): ícone em cima, nome embaixo.
final class ModeTile: NSView {
    var onClick: (() -> Void)?
    var isOn = false { didSet { needsDisplay = true } }
    var subtitle: String? { didSet { needsDisplay = true } }
    var isEnabled = true { didSet { alphaValue = isEnabled ? 1 : 0.35 } }
    private let image: NSImage
    private let title: String
    private var hover = false { didSet { needsDisplay = true } }

    init(image: NSImage, title: String, tip: String) {
        self.image = image
        self.title = title
        super.init(frame: .zero)
        toolTip = tip
        setAccessibilityRole(.button)
        setAccessibilityLabel(title)
        translatesAutoresizingMaskIntoConstraints = false
        widthAnchor.constraint(equalToConstant: 64).isActive = true
        heightAnchor.constraint(equalToConstant: 56).isActive = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
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
    override func mouseUp(with event: NSEvent) {
        if isEnabled, bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }

    override func draw(_ dirtyRect: NSRect) {
        let r = bounds.insetBy(dx: 0.5, dy: 0.5)
        let shape = NSBezierPath(roundedRect: r, xRadius: 9, yRadius: 9)
        if isOn {
            RecTheme.lavender.withAlphaComponent(0.2).setFill()
            shape.fill()
            shape.lineWidth = 1
            RecTheme.lavender.withAlphaComponent(0.8).setStroke()
            shape.stroke()
        } else {
            NSColor(white: 1, alpha: hover ? 0.1 : 0.05).setFill()
            shape.fill()
        }
        let iconColor = isOn ? RecTheme.lavender : RecTheme.text
        Icons.drawTinted(image, in: NSRect(x: bounds.midX - 10, y: bounds.maxY - 28, width: 20, height: 20), color: iconColor)
        let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 11, weight: .medium),
                                                    .foregroundColor: isOn ? RecTheme.text : RecTheme.secondary]
        let text = subtitle.map { "\(title) \($0)" } ?? title
        let size = (text as NSString).size(withAttributes: attrs)
        (text as NSString).draw(at: NSPoint(x: bounds.midX - size.width / 2, y: 7), withAttributes: attrs)
    }
}

/// O botão REC: disco vermelho com anel lavanda.
final class RecCircleButton: NSView {
    var onClick: (() -> Void)?
    private var hover = false { didSet { needsDisplay = true } }
    private var pressed = false { didSet { needsDisplay = true } }
    private let diameter: CGFloat

    init(diameter: CGFloat) {
        self.diameter = diameter
        super.init(frame: .zero)
        toolTip = "Começar a gravar (Enter)"
        setAccessibilityRole(.button)
        setAccessibilityLabel("Gravar")
        translatesAutoresizingMaskIntoConstraints = false
        widthAnchor.constraint(equalToConstant: diameter).isActive = true
        heightAnchor.constraint(equalToConstant: diameter).isActive = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
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
    override func mouseDown(with event: NSEvent) { pressed = true }
    override func mouseUp(with event: NSEvent) {
        pressed = false
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }

    override func draw(_ dirtyRect: NSRect) {
        let ring = NSBezierPath(ovalIn: bounds.insetBy(dx: 1.5, dy: 1.5))
        ring.lineWidth = 2
        RecTheme.lavender.withAlphaComponent(hover ? 1 : 0.75).setStroke()
        ring.stroke()
        let inset = diameter * 0.13 + (pressed ? 1.5 : 0)
        RecTheme.record.withAlphaComponent(hover ? 1 : 0.92).setFill()
        NSBezierPath(ovalIn: bounds.insetBy(dx: inset, dy: inset)).fill()
        if diameter >= 40 {
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: diameter * 0.22, weight: .heavy),
                                                        .foregroundColor: NSColor.white]
            let size = ("REC" as NSString).size(withAttributes: attrs)
            ("REC" as NSString).draw(at: NSPoint(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2),
                                     withAttributes: attrs)
        }
    }
}

/// Botão redondo pequeno da linha de baixo (cursor, cliques, som, microfone).
final class RoundToggle: NSView {
    var onClick: (() -> Void)?
    var isOn = false { didSet { needsDisplay = true } }
    private let image: NSImage
    let meter = MiniMeter()

    init(image: NSImage, tip: String, withMeter: Bool = false) {
        self.image = image
        super.init(frame: .zero)
        toolTip = tip
        setAccessibilityRole(.checkBox)
        setAccessibilityLabel(tip)
        translatesAutoresizingMaskIntoConstraints = false
        widthAnchor.constraint(equalToConstant: 28).isActive = true
        heightAnchor.constraint(equalToConstant: 28).isActive = true
        if withMeter {
            meter.frame = NSRect(x: 5, y: 2, width: 18, height: 2.5)
            addSubview(meter)
        }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }
    override func mouseUp(with event: NSEvent) {
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }

    override func draw(_ dirtyRect: NSRect) {
        let circle = NSBezierPath(ovalIn: bounds.insetBy(dx: 0.5, dy: 0.5))
        (isOn ? RecTheme.lavender.withAlphaComponent(0.85) : NSColor(white: 1, alpha: 0.1)).setFill()
        circle.fill()
        let color: NSColor = isOn ? RecTheme.navy.withAlphaComponent(1) : RecTheme.secondary
        Icons.drawTinted(image, in: NSRect(x: bounds.midX - 8, y: bounds.midY - 7, width: 16, height: 16), color: color)
        meter.isHidden = !isOn
    }
}

/// Abre com "Gravar tela": modo (Área, Tela, Janela), webcam, fontes, formato e REC.
final class RecSetupBar: NSObject {
    static let shared = RecSetupBar()

    enum Target { case fullScreen, window, area }

    private var panel: BarPanel?
    private var target: Target = .fullScreen
    private var tiles: [Target: ModeTile] = [:]
    private var webcamTile: ModeTile!
    private var cursorToggle: RoundToggle!
    private var clicksToggle: RoundToggle!
    private var systemToggle: RoundToggle!
    private var micToggle: RoundToggle!
    private let formatButton = NSButton(title: "", target: nil, action: nil)
    private let profileButton = NSButton(title: "", target: nil, action: nil)
    private let monitor = AudioMonitor()
    private var meterTimer: Timer?
    private var profile = RecSettings.current

    /// Chamado ao clicar em REC: alvo escolhido e perfil ajustado.
    var onRecord: ((Target, RecProfile) -> Void)?

    var isVisible: Bool { return panel?.isVisible ?? false }

    func show() {
        if isVisible { panel?.makeKeyAndOrderFront(nil); return }
        profile = RecSettings.current
        target = profile.areaMode == .fullScreen ? .fullScreen : .area
        let p = build()
        panel = p
        let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) }) ?? NSScreen.main
        let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        p.setFrameOrigin(NSPoint(x: (area.midX - p.frame.width / 2).rounded(),
                                 y: (area.maxY - p.frame.height - 60).rounded()))
        p.alphaValue = 0
        p.makeKeyAndOrderFront(nil)
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.16
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

    private func small(_ button: NSButton, title: String) {
        button.isBordered = false
        button.attributedTitle = NSAttributedString(string: title, attributes: [
            .font: NSFont.systemFont(ofSize: 11, weight: .medium), .foregroundColor: RecTheme.secondary])
    }

    private func build() -> BarPanel {
        // Linha de cima: título, perfil, pasta, fechar.
        let title = NSTextField(labelWithString: "Gravar tela")
        title.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        title.textColor = RecTheme.text
        profileButton.target = self
        profileButton.action = #selector(profileMenu(_:))
        profileButton.toolTip = "Trocar o perfil de gravação"
        let folder = BarButton(image: RecTheme.symbol("folder", fallback: Icons.save), tip: "Abrir a pasta das gravações")
        folder.onClick = { (NSApp.delegate as? AppDelegate)?.showRecordingsFolder(nil) }
        let close = BarButton(image: RecTheme.symbol("xmark", fallback: RecIcons.close), tip: "Fechar (Esc)")
        close.onClick = { [weak self] in self?.close() }
        for b in [folder, close] {
            b.translatesAutoresizingMaskIntoConstraints = false
            b.widthAnchor.constraint(equalToConstant: 26).isActive = true
            b.heightAnchor.constraint(equalToConstant: 26).isActive = true
        }
        let top = NSStackView(views: [title, profileButton, NSView(), folder, close])
        top.orientation = .horizontal
        top.spacing = 6

        // Blocos de modo + webcam + REC.
        let area = ModeTile(image: RecTheme.symbol("viewfinder", fallback: RecIcons.area), title: "Área",
                            tip: "Arraste para escolher a área")
        let full = ModeTile(image: RecTheme.symbol("display", fallback: RecIcons.fullScreen), title: "Tela",
                            tip: "Gravar a tela inteira")
        let window = ModeTile(image: RecTheme.symbol("macwindow", fallback: RecIcons.window), title: "Janela",
                              tip: "Clique na janela a gravar")
        tiles = [.area: area, .fullScreen: full, .window: window]
        for (t, tile) in tiles { tile.onClick = { [weak self] in self?.target = t; self?.refresh() } }
        webcamTile = ModeTile(image: RecTheme.symbol("web.camera", fallback: RecIcons.camera), title: "Webcam",
                              tip: "Mostrar a webcam no canto do vídeo")
        webcamTile.onClick = { [weak self] in self?.toggle(\.webcam) }
        let rec = RecCircleButton(diameter: 50)
        rec.onClick = { [weak self] in self?.record() }
        let tilesRow = NSStackView(views: [area, full, window, webcamTile, NSView(), rec])
        tilesRow.orientation = .horizontal
        tilesRow.spacing = 6
        tilesRow.alignment = .centerY
        tilesRow.setCustomSpacing(14, after: webcamTile)

        // Linha de baixo: cursor, cliques, som do Mac, microfone · formato · opções.
        cursorToggle = RoundToggle(image: RecTheme.symbol("cursorarrow", fallback: Icons.arrow), tip: "Mostrar o cursor")
        cursorToggle.onClick = { [weak self] in
            guard let self = self else { return }
            self.profile.showCursor = !(self.profile.showCursor ?? true)
            RecSettings.save(self.profile)
            self.refresh()
        }
        clicksToggle = RoundToggle(image: RecTheme.symbol("cursorarrow.click", fallback: Icons.ellipse), tip: "Destacar cliques")
        clicksToggle.onClick = { [weak self] in self?.toggle(\.clickHighlight) }
        systemToggle = RoundToggle(image: RecTheme.symbol("speaker.wave.2.fill", fallback: RecIcons.speaker),
                                   tip: "Som do Mac", withMeter: true)
        systemToggle.onClick = { [weak self] in self?.toggle(\.systemAudio) }
        micToggle = RoundToggle(image: RecTheme.symbol("mic.fill", fallback: RecIcons.mic), tip: "Microfone", withMeter: true)
        micToggle.onClick = { [weak self] in self?.toggle(\.microphone) }
        formatButton.target = self
        formatButton.action = #selector(qualityMenu(_:))
        formatButton.toolTip = "Qualidade do vídeo"
        let options = BarButton(image: RecTheme.symbol("gearshape", fallback: RecIcons.gear), tip: "Mais opções")
        options.translatesAutoresizingMaskIntoConstraints = false
        options.widthAnchor.constraint(equalToConstant: 26).isActive = true
        options.heightAnchor.constraint(equalToConstant: 26).isActive = true
        options.onClick = { [weak self, weak options] in
            guard let self = self, let o = options else { return }
            self.showOptionsMenu(from: o)
        }
        let bottom = NSStackView(views: [cursorToggle, clicksToggle, systemToggle, micToggle, NSView(), formatButton, options])
        bottom.orientation = .horizontal
        bottom.spacing = 6
        bottom.alignment = .centerY

        let column = NSStackView(views: [top, tilesRow, bottom])
        column.orientation = .vertical
        column.alignment = .leading
        column.spacing = 10
        column.translatesAutoresizingMaskIntoConstraints = false
        for row in [top, tilesRow, bottom] { row.widthAnchor.constraint(equalTo: column.widthAnchor).isActive = true }

        let bg = BarBackground(radius: 14)
        bg.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: bg.leadingAnchor, constant: 14),
            column.trailingAnchor.constraint(equalTo: bg.trailingAnchor, constant: -14),
            column.topAnchor.constraint(equalTo: bg.topAnchor, constant: 10),
            column.bottomAnchor.constraint(equalTo: bg.bottomAnchor, constant: -12),
        ])
        refresh()
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
        return p
    }

    private func refresh() {
        for (t, tile) in tiles { tile.isOn = t == target }
        let hasCamera = !WebcamSource.cameras().isEmpty
        webcamTile.isEnabled = hasCamera
        webcamTile.isOn = profile.webcam && hasCamera
        if !hasCamera { webcamTile.toolTip = "Nenhuma câmera conectada" }
        cursorToggle.isOn = profile.showCursor ?? true
        clicksToggle.isOn = profile.clickHighlight
        systemToggle.isOn = profile.systemAudio
        micToggle.isOn = profile.microphone
        small(profileButton, title: "Perfil: \(profile.name) ▾")
        let screen = profile.displayID.flatMap { id in NSScreen.screens.first { $0.displayID == id } } ?? NSScreen.main
        let px = screen.map { CGSize(width: $0.frame.width * $0.backingScaleFactor, height: $0.frame.height * $0.backingScaleFactor) }
            ?? CGSize(width: 1920, height: 1080)
        let fmt = RecVideoFormat(capturePixels: px, quality: profile.videoQuality)
        let label = target == .fullScreen ? "\(fmt.width)×\(fmt.height) · \(fmt.fps) fps ▾" : "até \(fmt.height)p · \(fmt.fps) fps ▾"
        small(formatButton, title: label)
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
            self.systemToggle.meter.value = self.monitor.level(.system)
            self.micToggle.meter.value = self.monitor.level(.mic)
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

    // MARK: Menus

    @objc private func profileMenu(_ sender: NSButton) {
        let menu = NSMenu()
        for name in RecProfile.names {
            let i = ClosureMenuItem(title: name) { [weak self] in
                RecSettings.currentProfileName = name
                self?.profile = RecSettings.current
                self?.target = self?.profile.areaMode == .fullScreen ? .fullScreen : .area
                self?.refresh()
                self?.startMeters()
            }
            i.state = name == profile.name ? .on : .off
            menu.addItem(i)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.height + 4), in: sender)
    }

    @objc private func qualityMenu(_ sender: NSButton) {
        let menu = NSMenu()
        for q in RecVideoQuality.allCases {
            let i = ClosureMenuItem(title: q.title) { [weak self] in
                self?.profile.videoQuality = q
                if let p = self?.profile { RecSettings.save(p) }
                self?.refresh()
            }
            i.state = q == profile.videoQuality ? .on : .off
            menu.addItem(i)
        }
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: sender.bounds.height + 4), in: sender)
    }

    private func showOptionsMenu(from view: NSView) {
        let menu = NSMenu()
        func item(_ title: String, _ on: Bool, _ action: @escaping () -> Void) -> NSMenuItem {
            let i = ClosureMenuItem(title: title, handler: action)
            i.state = on ? .on : .off
            return i
        }
        menu.addItem(item("Contagem regressiva de 3 s", profile.countdown) { [weak self] in self?.toggle(\.countdown) })
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
                self?.refresh()
            })
            for s in NSScreen.screens {
                let id = s.displayID
                sm.addItem(item(s.recorteName, profile.displayID == id) { [weak self] in
                    self?.profile.displayID = id
                    if let p = self?.profile { RecSettings.save(p) }
                    self?.refresh()
                })
            }
            screens.submenu = sm
            menu.addItem(screens)
        }
        if RecSettings.lastArea?.validScreen() != nil {
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
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: view.bounds.height + 4), in: view)
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
