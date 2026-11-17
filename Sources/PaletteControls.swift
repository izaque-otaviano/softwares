import Cocoa

/// Botão leve usado na paleta flutuante (realce ao passar o mouse e estado selecionado).
class PaletteButton: NSView {
    var isSelected = false { didSet { needsDisplay = true } }
    var onClick: (() -> Void)?
    /// Chamado ao entrar/sair com o mouse (para mostrar o nome do botão).
    var onHover: ((Bool) -> Void)?
    let tip: String
    private var isHovering = false { didSet { needsDisplay = true } }
    private var isPressed = false { didSet { needsDisplay = true } }
    private let fixedSize: NSSize

    init(size: NSSize, tip: String) {
        fixedSize = size
        self.tip = tip
        super.init(frame: NSRect(origin: .zero, size: size))
        toolTip = tip
        setAccessibilityRole(.button)
        setAccessibilityLabel(tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var intrinsicContentSize: NSSize { return fixedSize }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: .zero,
                                       options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    override func mouseEntered(with event: NSEvent) { isHovering = true; onHover?(true) }
    override func mouseExited(with event: NSEvent) { isHovering = false; onHover?(false) }
    override func mouseDown(with event: NSEvent) { isPressed = true }
    override func mouseUp(with event: NSEvent) {
        isPressed = false
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }

    override func draw(_ dirtyRect: NSRect) {
        let bg = NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 7, yRadius: 7)
        if isSelected && showsSelectionBackground {
            NSColor.controlAccentColor.withAlphaComponent(0.22).setFill()
            bg.fill()
        } else if isPressed {
            NSColor.labelColor.withAlphaComponent(0.16).setFill()
            bg.fill()
        } else if isHovering {
            NSColor.labelColor.withAlphaComponent(0.08).setFill()
            bg.fill()
        }
        drawContent()
    }

    var showsSelectionBackground: Bool { return true }
    func drawContent() {}
}

final class IconButton: PaletteButton {
    let image: NSImage

    init(image: NSImage, tip: String) {
        self.image = image
        super.init(size: NSSize(width: 32, height: 30), tip: tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func drawContent() {
        let r = NSRect(x: bounds.midX - 10, y: bounds.midY - 10, width: 20, height: 20)
        Icons.drawTinted(image, in: r, color: isSelected ? .controlAccentColor : .labelColor)
    }
}

final class ColorButton: PaletteButton {
    let color: NSColor

    init(color: NSColor, tip: String) {
        self.color = color
        super.init(size: NSSize(width: 24, height: 30), tip: tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var showsSelectionBackground: Bool { return false }

    override func drawContent() {
        let d: CGFloat = 16
        let dot = NSRect(x: bounds.midX - d / 2, y: bounds.midY - d / 2, width: d, height: d)
        if isSelected {
            let ring = NSBezierPath(ovalIn: dot.insetBy(dx: -3, dy: -3))
            ring.lineWidth = 2
            NSColor.labelColor.withAlphaComponent(0.85).setStroke()
            ring.stroke()
        }
        color.setFill()
        let path = NSBezierPath(ovalIn: dot)
        path.fill()
        NSColor.black.withAlphaComponent(0.18).setStroke()
        path.lineWidth = 0.5
        path.stroke()
    }
}

final class WidthButton: PaletteButton {
    let width: CGFloat

    init(width: CGFloat, tip: String) {
        self.width = width
        super.init(size: NSSize(width: 28, height: 30), tip: tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func drawContent() {
        let d = 3 + width * 1.2
        let dot = NSRect(x: bounds.midX - d / 2, y: bounds.midY - d / 2, width: d, height: d)
        (isSelected ? NSColor.controlAccentColor : NSColor.labelColor).setFill()
        NSBezierPath(ovalIn: dot).fill()
    }
}

/// Fundo arredondado e sutil para agrupar opções (estilo "cartão" das Preferências).
final class CardView: NSView {
    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: 10, yRadius: 10)
        let dark = effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        (dark ? NSColor(white: 1, alpha: 0.06) : NSColor(white: 1, alpha: 0.6)).setFill()
        path.fill()
        (dark ? NSColor(white: 1, alpha: 0.12) : NSColor(white: 0, alpha: 0.1)).setStroke()
        path.lineWidth = 1
        path.stroke()
    }

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        needsDisplay = true
    }
}

func makeSeparator(height: CGFloat = 20) -> NSView {
    let box = NSBox(frame: NSRect(x: 0, y: 0, width: 1, height: height))
    box.boxType = .separator
    box.translatesAutoresizingMaskIntoConstraints = false
    box.widthAnchor.constraint(equalToConstant: 1).isActive = true
    box.heightAnchor.constraint(equalToConstant: height).isActive = true
    return box
}

/// Botão principal (OK): preenchido com a cor de destaque do sistema.
final class AccentButton: PaletteButton {
    let title: String

    init(title: String, tip: String, width: CGFloat = 58) {
        self.title = title
        super.init(size: NSSize(width: width, height: 30), tip: tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var showsSelectionBackground: Bool { return false }

    override func draw(_ dirtyRect: NSRect) {
        let bg = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 7, yRadius: 7)
        NSColor.controlAccentColor.setFill()
        bg.fill()
        let check = NSRect(x: 7, y: bounds.midY - 8, width: 16, height: 16)
        Icons.drawTinted(Icons.check, in: check, color: .white)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 13, weight: .semibold),
            .foregroundColor: NSColor.white,
        ]
        let size = (title as NSString).size(withAttributes: attrs)
        (title as NSString).draw(at: NSPoint(x: check.maxX + 3, y: bounds.midY - size.height / 2), withAttributes: attrs)
    }
}

/// NSVisualEffectView que "engole" cliques no fundo, para que não passem
/// para a tela de seleção que está atrás.
class SolidEffectView: NSVisualEffectView {
    override func mouseDown(with event: NSEvent) {}
    override func mouseDragged(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {}
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }
}

/// Botão secundário com texto (fundo discreto). Pode ficar desativado.
final class SecondaryButton: PaletteButton {
    let title: String
    var isEnabled = true { didSet { needsDisplay = true } }

    init(title: String, tip: String, width: CGFloat) {
        self.title = title
        super.init(size: NSSize(width: width, height: 30), tip: tip)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var showsSelectionBackground: Bool { return false }

    override func mouseUp(with event: NSEvent) {
        if isEnabled { super.mouseUp(with: event) }
    }

    override func draw(_ dirtyRect: NSRect) {
        let alpha: CGFloat = isEnabled ? 1 : 0.4
        let bg = NSBezierPath(roundedRect: bounds.insetBy(dx: 2, dy: 2), xRadius: 7, yRadius: 7)
        NSColor.labelColor.withAlphaComponent(0.14 * alpha).setFill()
        bg.fill()
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 13, weight: .medium),
            .foregroundColor: NSColor.labelColor.withAlphaComponent(alpha),
        ]
        let size = (title as NSString).size(withAttributes: attrs)
        (title as NSString).draw(at: NSPoint(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2),
                                 withAttributes: attrs)
    }
}

/// Fundo cinza bem escuro e opaco para a barra de ferramentas e o painel de texto.
final class DarkFillView: NSView {
    private let radius: CGFloat

    init(radius: CGFloat) {
        self.radius = radius
        super.init(frame: .zero)
        autoresizingMask = [.width, .height]
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func hitTest(_ point: NSPoint) -> NSView? { return nil }

    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds.insetBy(dx: 0.5, dy: 0.5), xRadius: radius, yRadius: radius)
        NSColor(calibratedWhite: 0.11, alpha: 0.96).setFill()
        path.fill()
        path.lineWidth = 1
        NSColor(calibratedWhite: 1, alpha: 0.1).setStroke()
        path.stroke()
    }
}

/// Balão com o nome do botão sob o mouse.
final class TipView: NSView {
    var text = "" { didSet { needsDisplay = true } }

    private var attributes: [NSAttributedString.Key: Any] {
        return [.font: NSFont.systemFont(ofSize: 12, weight: .medium), .foregroundColor: NSColor.white]
    }

    var fittingTextSize: NSSize {
        let s = (text as NSString).size(withAttributes: attributes)
        return NSSize(width: ceil(s.width) + 20, height: ceil(s.height) + 10)
    }

    override func hitTest(_ point: NSPoint) -> NSView? { return nil }

    override func draw(_ dirtyRect: NSRect) {
        let path = NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7)
        NSColor(calibratedWhite: 0.06, alpha: 0.96).setFill()
        path.fill()
        NSColor(calibratedWhite: 1, alpha: 0.15).setStroke()
        path.stroke()
        let size = (text as NSString).size(withAttributes: attributes)
        (text as NSString).draw(at: NSPoint(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2),
                                withAttributes: attributes)
    }
}
