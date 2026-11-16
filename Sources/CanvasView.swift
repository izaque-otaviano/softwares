import Cocoa
import Carbon

/// Mostra a captura e permite desenhar marcações sobre ela.
final class CanvasView: NSView, NSTextFieldDelegate {
    let image: NSImage
    private(set) var annotations: [Annotation] = []

    var tool: Tool = .arrow {
        didSet {
            commitText()
            window?.invalidateCursorRects(for: self)
            onToolChange?(tool)
        }
    }
    var color: NSColor = .systemRed
    var lineWidth: CGFloat = 4
    var onToolChange: ((Tool) -> Void)?

    /// Espaço reservado (embaixo) para a paleta flutuante.
    var bottomInset: CGFloat = 76 { didSet { needsDisplay = true } }

    private var current: Annotation?
    private var textField: NSTextField?

    init(image: NSImage) {
        self.image = image
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var acceptsFirstResponder: Bool { return true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    // MARK: Geometria

    var imageRect: NSRect {
        let available = NSRect(x: bounds.minX + 24, y: bounds.minY + bottomInset,
                               width: max(1, bounds.width - 48),
                               height: max(1, bounds.height - bottomInset - 16))
        let w = max(image.size.width, 1), h = max(image.size.height, 1)
        let s = min(available.width / w, available.height / h, 1)
        let size = NSSize(width: w * s, height: h * s)
        return NSRect(x: (available.midX - size.width / 2).rounded(),
                      y: (available.midY - size.height / 2).rounded(),
                      width: size.width, height: size.height)
    }

    private var scale: CGFloat {
        return imageRect.width / max(image.size.width, 1)
    }

    private func toImage(_ p: NSPoint) -> CGPoint {
        let r = imageRect
        return CGPoint(x: (p.x - r.minX) / scale, y: (p.y - r.minY) / scale)
    }

    private func toView(_ p: CGPoint) -> NSPoint {
        let r = imageRect
        return NSPoint(x: r.minX + p.x * scale, y: r.minY + p.y * scale)
    }

    // MARK: Desenho

    override func draw(_ dirtyRect: NSRect) {
        let r = imageRect

        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.35)
        shadow.shadowBlurRadius = 16
        shadow.shadowOffset = NSSize(width: 0, height: -4)
        shadow.set()
        NSColor.white.setFill()
        r.fill()
        NSGraphicsContext.restoreGraphicsState()

        image.draw(in: r)

        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(rect: r).addClip()
        let t = NSAffineTransform()
        t.translateX(by: r.minX, yBy: r.minY)
        t.scaleX(by: scale, yBy: scale)
        t.concat()
        for a in annotations { a.draw() }
        current?.draw()
        NSGraphicsContext.restoreGraphicsState()
    }

    override func resetCursorRects() {
        addCursorRect(imageRect, cursor: tool == .text ? .iBeam : .crosshair)
    }

    override func setFrameSize(_ newSize: NSSize) {
        commitText()
        super.setFrameSize(newSize)
    }

    // MARK: Mouse

    override func mouseDown(with event: NSEvent) {
        if textField != nil {
            window?.makeFirstResponder(self)
            return
        }
        window?.makeFirstResponder(self)
        let viewPoint = convert(event.locationInWindow, from: nil)
        let p = toImage(viewPoint)
        if tool == .text {
            beginText(at: viewPoint)
            return
        }
        current = Annotation(tool: tool, color: color, width: lineWidth, start: p)
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let c = current else { return }
        var p = toImage(convert(event.locationInWindow, from: nil))
        if event.modifierFlags.contains(.shift) { p = constrain(p, from: c.start) }
        c.end = p
        if c.tool == .pen { c.points.append(p) }
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        guard let c = current else { return }
        current = nil
        if c.isMeaningful { add(c) }
        needsDisplay = true
    }

    private func constrain(_ p: CGPoint, from s: CGPoint) -> CGPoint {
        let dx = p.x - s.x, dy = p.y - s.y
        switch tool {
        case .arrow:
            let step = CGFloat.pi / 4
            let angle = (atan2(dy, dx) / step).rounded() * step
            let length = hypot(dx, dy)
            return CGPoint(x: s.x + cos(angle) * length, y: s.y + sin(angle) * length)
        case .rectangle, .ellipse, .highlight:
            let m = max(abs(dx), abs(dy))
            return CGPoint(x: s.x + (dx < 0 ? -m : m), y: s.y + (dy < 0 ? -m : m))
        default:
            return p
        }
    }

    // MARK: Teclado

    override func keyDown(with event: NSEvent) {
        let mods = event.modifierFlags.intersection(Shortcut.relevantModifiers)
        if Int(event.keyCode) == kVK_Escape {
            window?.performClose(nil)
            return
        }
        if mods.isEmpty, let chars = event.charactersIgnoringModifiers?.lowercased() {
            if let t = Tool.allCases.first(where: { $0.key == chars }) {
                tool = t
                return
            }
        }
        super.keyDown(with: event)
    }

    // MARK: Desfazer / refazer

    func add(_ a: Annotation) {
        annotations.append(a)
        undoManager?.registerUndo(withTarget: self) { target in target.remove(a) }
        undoManager?.setActionName("Marcação")
        needsDisplay = true
    }

    func remove(_ a: Annotation) {
        guard let i = annotations.firstIndex(where: { $0 === a }) else { return }
        annotations.remove(at: i)
        undoManager?.registerUndo(withTarget: self) { target in target.add(a) }
        undoManager?.setActionName("Marcação")
        needsDisplay = true
    }

    // MARK: Texto

    private func beginText(at viewPoint: NSPoint) {
        let field = NSTextField(string: "")
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.isEditable = true
        field.isSelectable = true
        field.font = NSFont.systemFont(ofSize: Annotation.fontSize(forWidth: lineWidth) * scale, weight: .semibold)
        field.textColor = color
        field.placeholderString = "Texto"
        field.delegate = self
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.sizeToFit()
        let height = field.frame.height
        field.frame = NSRect(x: viewPoint.x - 2, y: viewPoint.y - height / 2, width: 120, height: height)
        addSubview(field)
        textField = field
        window?.makeFirstResponder(field)
    }

    func controlTextDidChange(_ obj: Notification) {
        guard let field = textField else { return }
        let origin = field.frame.origin
        field.sizeToFit()
        field.setFrameOrigin(origin)
        field.setFrameSize(NSSize(width: max(120, field.frame.width + 24), height: field.frame.height))
    }

    func controlTextDidEndEditing(_ obj: Notification) {
        DispatchQueue.main.async { [weak self] in self?.commitText() }
    }

    /// Converte o campo de texto em edição numa marcação definitiva.
    func commitText() {
        guard let field = textField else { return }
        textField = nil
        let text = field.stringValue
        let origin = toImage(NSPoint(x: field.frame.minX + 2, y: field.frame.minY))
        field.delegate = nil
        field.removeFromSuperview()
        if window?.firstResponder == nil { window?.makeFirstResponder(self) }
        let a = Annotation(tool: .text, color: color, width: lineWidth, start: origin)
        a.text = text
        if a.isMeaningful { add(a) }
        needsDisplay = true
    }

    // MARK: Exportação

    /// Renderiza a captura com as marcações na resolução original (Retina).
    func renderBitmap() -> NSBitmapImageRep? {
        commitText()
        let size = image.size
        var pixelsWide = Int(size.width.rounded())
        var pixelsHigh = Int(size.height.rounded())
        for rep in image.representations where rep.pixelsWide > pixelsWide {
            pixelsWide = rep.pixelsWide
            pixelsHigh = rep.pixelsHigh
        }
        guard pixelsWide > 0, pixelsHigh > 0,
              let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                         pixelsWide: pixelsWide,
                                         pixelsHigh: pixelsHigh,
                                         bitsPerSample: 8,
                                         samplesPerPixel: 4,
                                         hasAlpha: true,
                                         isPlanar: false,
                                         colorSpaceName: .deviceRGB,
                                         bytesPerRow: 0,
                                         bitsPerPixel: 0) else { return nil }
        rep.size = size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        image.draw(in: NSRect(origin: .zero, size: size))
        for a in annotations { a.draw() }
        NSGraphicsContext.current?.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        return rep
    }
}
