import Cocoa
import Carbon

/// Janela sem bordas que cobre a tela inteira durante a captura.
final class OverlayWindow: NSWindow {
    override var canBecomeKey: Bool { return true }
    override var canBecomeMain: Bool { return true }
}

/// Controla uma sessão de captura: congela a tela, deixa o usuário selecionar
/// uma área, marcar por cima e confirmar.
final class CaptureOverlay: NSObject {
    let window: OverlayWindow
    let view: OverlayView

    /// Chamado ao confirmar (OK / Enter / ⌘C) com a imagem final.
    var onConfirm: ((NSBitmapImageRep) -> Void)?
    /// Chamado ao escolher "Salvar como…".
    var onSaveAs: ((NSBitmapImageRep) -> Void)?
    /// Sempre chamado quando a sobreposição fecha.
    var onFinish: (() -> Void)?

    /// - Parameter demoImage: usado só nos prints automáticos (substitui a tela real).
    init?(screen: NSScreen, demoImage: NSImage? = nil) {
        guard let shot = CaptureOverlay.captureScreen(screen, demoImage: demoImage) else { return nil }

        window = OverlayWindow(contentRect: screen.frame, styleMask: [.borderless],
                               backing: .buffered, defer: false)
        window.setFrame(screen.frame, display: false)
        window.level = .screenSaver
        window.backgroundColor = .black
        window.isOpaque = true
        window.hasShadow = false
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.acceptsMouseMovedEvents = true

        view = OverlayView(frame: NSRect(origin: .zero, size: screen.frame.size), screenshot: shot)
        window.contentView = view
        super.init()

        view.onCancel = { [weak self] in self?.finish() }
        view.onConfirm = { [weak self] in
            guard let self = self else { return }
            let rep = self.view.render()
            self.finish()
            if let rep = rep { self.onConfirm?(rep) }
        }
        view.onSaveAs = { [weak self] in
            guard let self = self else { return }
            let rep = self.view.render()
            self.finish()
            if let rep = rep { self.onSaveAs?(rep) }
        }
    }

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(view)
        window.invalidateCursorRects(for: view)
        NSCursor.crosshair.set()
    }

    private func finish() {
        view.commitText()
        window.orderOut(nil)
        window.close()
        let done = onFinish
        onFinish = nil
        done?()
    }

    /// Tira uma "foto" da tela inteira (no macOS 10.14 não precisa de permissão).
    private static func captureScreen(_ screen: NSScreen, demoImage: NSImage?) -> CGImage? {
        if let demo = demoImage {
            let scale = screen.backingScaleFactor
            let size = screen.frame.size
            guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                             pixelsWide: Int(size.width * scale),
                                             pixelsHigh: Int(size.height * scale),
                                             bitsPerSample: 8, samplesPerPixel: 4,
                                             hasAlpha: true, isPlanar: false,
                                             colorSpaceName: .deviceRGB,
                                             bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
            rep.size = size
            NSGraphicsContext.saveGraphicsState()
            NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
            demo.draw(in: NSRect(origin: .zero, size: size))
            NSGraphicsContext.restoreGraphicsState()
            return rep.cgImage
        }
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        let displayID = (screen.deviceDescription[key] as? NSNumber)?.uint32Value ?? CGMainDisplayID()
        return CGDisplayCreateImage(displayID)
    }
}

/// Tela congelada + seleção + marcações + barra de ferramentas.
final class OverlayView: NSView, NSTextFieldDelegate {
    private enum Drag {
        case none
        case selecting(NSPoint)
        case moving(NSPoint)
        case resizing(Int, Int, NSPoint, NSRect)
        case drawing
    }

    let screenshot: CGImage
    private let background: NSImage
    private let pixelScale: CGFloat

    var onCancel: (() -> Void)?
    var onConfirm: (() -> Void)?
    var onSaveAs: (() -> Void)?

    private(set) var selection: NSRect? {
        didSet {
            // Coordenadas inteiras evitam "costuras" claras no escurecimento.
            if let s = selection {
                let r = NSRect(x: s.minX.rounded(), y: s.minY.rounded(),
                               width: s.width.rounded(), height: s.height.rounded())
                if r != s { selection = r }
            }
        }
    }
    private var annotations: [Annotation] = []
    private var current: Annotation?
    private var textField: NSTextField?
    private var drag: Drag = .none

    private var isMoveTool = false
    private var tool: Tool = .arrow
    private var color: NSColor = .systemRed
    private var lineWidth: CGFloat = 4

    private let palette = NSVisualEffectView()
    private var moveButton: IconButton!
    private var toolButtons: [IconButton] = []
    private var colorButtons: [ColorButton] = []
    private var widthButtons: [WidthButton] = []

    init(frame: NSRect, screenshot: CGImage) {
        self.screenshot = screenshot
        self.background = NSImage(cgImage: screenshot, size: frame.size)
        self.pixelScale = CGFloat(screenshot.width) / max(frame.width, 1)
        super.init(frame: frame)
        buildPalette()
        selectTool(Settings.lastTool)
        selectColor(Settings.lastColorIndex)
        selectWidth(Settings.lastWidthIndex)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var acceptsFirstResponder: Bool { return true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }
    override var isOpaque: Bool { return true }

    // MARK: Barra de ferramentas

    private func buildPalette() {
        palette.material = .hudWindow
        palette.blendingMode = .withinWindow
        palette.state = .active
        palette.appearance = NSAppearance(named: .darkAqua)
        palette.maskImage = Icons.roundedMask(radius: 12)
        palette.isHidden = true

        var items: [NSView] = []

        moveButton = IconButton(image: Icons.move, tip: "Mover a seleção (M)")
        moveButton.onClick = { [weak self] in self?.selectMoveTool() }
        items.append(moveButton)
        for tool in Tool.allCases {
            let b = IconButton(image: tool.icon, tip: tool.title)
            b.onClick = { [weak self] in self?.selectTool(tool) }
            toolButtons.append(b)
            items.append(b)
        }
        items.append(makeSeparator())

        for (i, entry) in OverlayView.colors.enumerated() {
            let b = ColorButton(color: entry.0, tip: entry.1)
            b.onClick = { [weak self] in self?.selectColor(i) }
            colorButtons.append(b)
            items.append(b)
        }
        items.append(makeSeparator())

        for (i, entry) in OverlayView.widths.enumerated() {
            let b = WidthButton(width: entry.0, tip: "Espessura: \(entry.1)")
            b.onClick = { [weak self] in self?.selectWidth(i) }
            widthButtons.append(b)
            items.append(b)
        }
        items.append(makeSeparator())

        let undo = IconButton(image: Icons.undo, tip: "Desfazer (⌘Z)")
        undo.onClick = { [weak self] in self?.undoManager?.undo() }
        let redo = IconButton(image: Icons.redo, tip: "Refazer (⇧⌘Z)")
        redo.onClick = { [weak self] in self?.undoManager?.redo() }
        items.append(undo)
        items.append(redo)
        items.append(makeSeparator())

        let save = IconButton(image: Icons.save, tip: "Salvar como… (⌘S)")
        save.onClick = { [weak self] in self?.onSaveAs?() }
        let copy = IconButton(image: Icons.copy, tip: "Copiar (⌘C)")
        copy.onClick = { [weak self] in self?.onConfirm?() }
        let cancel = IconButton(image: Icons.close, tip: "Cancelar (Esc)")
        cancel.onClick = { [weak self] in self?.onCancel?() }
        let ok = AccentButton(title: "OK", tip: "Copiar e salvar (Enter)")
        ok.onClick = { [weak self] in self?.onConfirm?() }
        items.append(contentsOf: [save, copy, cancel, ok] as [NSView])

        let stack = NSStackView(views: items)
        stack.orientation = .horizontal
        stack.spacing = 2
        stack.alignment = .centerY
        stack.translatesAutoresizingMaskIntoConstraints = false
        palette.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: palette.leadingAnchor, constant: 6),
            stack.trailingAnchor.constraint(equalTo: palette.trailingAnchor, constant: -6),
            stack.topAnchor.constraint(equalTo: palette.topAnchor, constant: 4),
            stack.bottomAnchor.constraint(equalTo: palette.bottomAnchor, constant: -4),
        ])
        addSubview(palette)
    }

    static let colors: [(NSColor, String)] = [
        (.systemRed, "Vermelho"),
        (.systemYellow, "Amarelo"),
        (.systemGreen, "Verde"),
        (.systemBlue, "Azul"),
        (.black, "Preto"),
        (.white, "Branco"),
    ]
    static let widths: [(CGFloat, String)] = [(2, "Fino"), (4, "Médio"), (8, "Grosso")]

    private func layoutPalette() {
        guard let sel = selection else {
            palette.isHidden = true
            return
        }
        let size = palette.fittingSize
        var x = sel.midX - size.width / 2
        x = min(max(x, bounds.minX + 8), bounds.maxX - size.width - 8)
        var y = sel.minY - size.height - 10
        if y < bounds.minY + 8 { y = sel.maxY + 10 }
        if y + size.height > bounds.maxY - 8 { y = sel.minY + 10 }
        palette.frame = NSRect(x: x.rounded(), y: y.rounded(), width: size.width, height: size.height)
        palette.isHidden = false
        window?.invalidateCursorRects(for: self)
    }

    private func selectMoveTool() {
        commitText()
        isMoveTool = true
        moveButton.isSelected = true
        for b in toolButtons { b.isSelected = false }
        window?.invalidateCursorRects(for: self)
    }

    private func selectTool(_ t: Tool) {
        commitText()
        isMoveTool = false
        tool = t
        moveButton.isSelected = false
        for (i, b) in toolButtons.enumerated() { b.isSelected = (i == t.rawValue) }
        Settings.lastTool = t
        window?.invalidateCursorRects(for: self)
    }

    private func selectColor(_ index: Int) {
        let i = min(max(index, 0), OverlayView.colors.count - 1)
        color = OverlayView.colors[i].0
        for (j, b) in colorButtons.enumerated() { b.isSelected = (i == j) }
        Settings.lastColorIndex = i
        textField?.textColor = color
    }

    private func selectWidth(_ index: Int) {
        let i = min(max(index, 0), OverlayView.widths.count - 1)
        lineWidth = OverlayView.widths[i].0
        for (j, b) in widthButtons.enumerated() { b.isSelected = (i == j) }
        Settings.lastWidthIndex = i
    }

    // MARK: Desenho

    override func draw(_ dirtyRect: NSRect) {
        NSGraphicsContext.current?.imageInterpolation = .high
        background.draw(in: bounds)

        guard let sel = selection else {
            drawPill("Arraste para selecionar a área  ·  Esc para cancelar",
                     at: NSPoint(x: bounds.midX, y: bounds.maxY - 60), centered: true)
            return
        }

        // Escurece levemente tudo fora da seleção.
        NSColor(white: 0, alpha: 0.45).setFill()
        let b = bounds
        let outside = [
            NSRect(x: b.minX, y: sel.maxY, width: b.width, height: b.maxY - sel.maxY),
            NSRect(x: b.minX, y: b.minY, width: b.width, height: sel.minY - b.minY),
            NSRect(x: b.minX, y: sel.minY, width: sel.minX - b.minX, height: sel.height),
            NSRect(x: sel.maxX, y: sel.minY, width: b.maxX - sel.maxX, height: sel.height),
        ]
        for r in outside where r.width > 0 && r.height > 0 { r.fill(using: .sourceOver) }

        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(rect: sel).addClip()
        for a in annotations { a.draw() }
        current?.draw()
        NSGraphicsContext.restoreGraphicsState()

        // Borda da seleção
        let border = NSBezierPath(rect: sel.insetBy(dx: -0.5, dy: -0.5))
        border.lineWidth = 1
        NSColor.white.withAlphaComponent(0.9).setStroke()
        border.stroke()

        var showHandles = true
        var showSize = false
        switch drag {
        case .selecting: showHandles = false; showSize = true
        case .resizing: showSize = true
        case .drawing: showHandles = false
        default: break
        }

        if showHandles {
            for h in OverlayView.handles {
                let p = handlePoint(h.0, h.1, in: sel)
                let r = NSRect(x: p.x - 4, y: p.y - 4, width: 8, height: 8)
                let path = NSBezierPath(ovalIn: r)
                NSColor.white.setFill()
                path.fill()
                path.lineWidth = 1
                NSColor(white: 0, alpha: 0.45).setStroke()
                path.stroke()
            }
        }

        if showSize {
            let w = Int((sel.width * pixelScale).rounded())
            let h = Int((sel.height * pixelScale).rounded())
            var p = NSPoint(x: sel.minX, y: sel.maxY + 8)
            if p.y + 26 > bounds.maxY { p.y = sel.maxY - 32 }
            drawPill("\(w) × \(h)", at: p, centered: false)
        }
    }

    private func drawPill(_ text: String, at point: NSPoint, centered: Bool) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 12, weight: .medium),
            .foregroundColor: NSColor.white,
        ]
        let size = (text as NSString).size(withAttributes: attrs)
        let w = size.width + 20, h = size.height + 8
        let x = centered ? point.x - w / 2 : point.x
        let r = NSRect(x: x, y: point.y, width: w, height: h)
        NSColor(white: 0, alpha: 0.7).setFill()
        NSBezierPath(roundedRect: r, xRadius: h / 2, yRadius: h / 2).fill()
        (text as NSString).draw(at: NSPoint(x: r.minX + 10, y: r.minY + 4), withAttributes: attrs)
    }

    // MARK: Alças de redimensionamento

    private static let handles: [(Int, Int)] = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]

    private func handlePoint(_ xe: Int, _ ye: Int, in r: NSRect) -> NSPoint {
        let x = xe < 0 ? r.minX : (xe > 0 ? r.maxX : r.midX)
        let y = ye < 0 ? r.minY : (ye > 0 ? r.maxY : r.midY)
        return NSPoint(x: x, y: y)
    }

    private func hitHandle(_ p: NSPoint, in r: NSRect) -> (Int, Int)? {
        for h in OverlayView.handles {
            let hp = handlePoint(h.0, h.1, in: r)
            if abs(hp.x - p.x) <= 7 && abs(hp.y - p.y) <= 7 { return h }
        }
        return nil
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .crosshair)
        guard let sel = selection else { return }
        let inside: NSCursor = isMoveTool ? .openHand : (tool == .text ? .iBeam : .crosshair)
        addCursorRect(sel, cursor: inside)
        for h in OverlayView.handles {
            let p = handlePoint(h.0, h.1, in: sel)
            let cursor: NSCursor
            if h.1 == 0 { cursor = .resizeLeftRight } else if h.0 == 0 { cursor = .resizeUpDown } else { cursor = .crosshair }
            addCursorRect(NSRect(x: p.x - 7, y: p.y - 7, width: 14, height: 14), cursor: cursor)
        }
        if !palette.isHidden { addCursorRect(palette.frame, cursor: .arrow) }
    }

    // MARK: Mouse

    private func clamp(_ p: NSPoint) -> NSPoint {
        return NSPoint(x: min(max(p.x, bounds.minX), bounds.maxX), y: min(max(p.y, bounds.minY), bounds.maxY))
    }

    override func mouseDown(with event: NSEvent) {
        if textField != nil {
            window?.makeFirstResponder(self)
            return
        }
        let p = clamp(convert(event.locationInWindow, from: nil))

        guard let sel = selection else {
            drag = .selecting(p)
            return
        }
        if let h = hitHandle(p, in: sel) {
            drag = .resizing(h.0, h.1, p, sel)
            palette.isHidden = true
            return
        }
        if sel.contains(p) {
            if isMoveTool {
                drag = .moving(p)
                NSCursor.closedHand.set()
                return
            }
            if tool == .text {
                beginText(at: p)
                return
            }
            current = Annotation(tool: tool, color: color, width: lineWidth, start: p)
            drag = .drawing
            return
        }
        // Fora da seleção: começa uma nova (se ainda não houver marcações).
        if annotations.isEmpty {
            selection = nil
            palette.isHidden = true
            drag = .selecting(p)
            needsDisplay = true
        }
    }

    override func mouseDragged(with event: NSEvent) {
        let p = clamp(convert(event.locationInWindow, from: nil))
        switch drag {
        case .selecting(let s):
            selection = NSRect(x: min(s.x, p.x), y: min(s.y, p.y), width: abs(p.x - s.x), height: abs(p.y - s.y))

        case .moving(let last):
            guard let sel = selection else { break }
            var dx = p.x - last.x, dy = p.y - last.y
            dx = min(max(dx, bounds.minX - sel.minX), bounds.maxX - sel.maxX)
            dy = min(max(dy, bounds.minY - sel.minY), bounds.maxY - sel.maxY)
            selection = sel.offsetBy(dx: dx, dy: dy)
            for a in annotations { shift(a, dx, dy) }
            drag = .moving(NSPoint(x: last.x + dx, y: last.y + dy))
            layoutPalette()

        case .resizing(let xe, let ye, let s, let orig):
            var minX = orig.minX, maxX = orig.maxX, minY = orig.minY, maxY = orig.maxY
            let dx = p.x - s.x, dy = p.y - s.y
            if xe < 0 { minX += dx } else if xe > 0 { maxX += dx }
            if ye < 0 { minY += dy } else if ye > 0 { maxY += dy }
            selection = NSRect(x: min(minX, maxX), y: min(minY, maxY),
                               width: abs(maxX - minX), height: abs(maxY - minY)).intersection(bounds)

        case .drawing:
            guard let c = current else { break }
            var q = p
            if event.modifierFlags.contains(.shift) { q = constrain(q, from: c.start) }
            c.end = q
            if c.tool == .pen { c.points.append(q) }

        case .none:
            break
        }
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        switch drag {
        case .selecting:
            if let s = selection, s.width >= 5, s.height >= 5 {
                layoutPalette()
            } else {
                selection = nil
            }
        case .drawing:
            if let c = current, c.isMeaningful { add(c) }
            current = nil
        case .moving:
            NSCursor.openHand.set()
        case .resizing:
            if let s = selection, s.width >= 5, s.height >= 5 {
                layoutPalette()
            } else {
                selection = nil
                palette.isHidden = true
            }
        case .none:
            break
        }
        drag = .none
        window?.invalidateCursorRects(for: self)
        needsDisplay = true
    }

    private func shift(_ a: Annotation, _ dx: CGFloat, _ dy: CGFloat) {
        a.start = NSPoint(x: a.start.x + dx, y: a.start.y + dy)
        a.end = NSPoint(x: a.end.x + dx, y: a.end.y + dy)
        a.points = a.points.map { NSPoint(x: $0.x + dx, y: $0.y + dy) }
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

    // MARK: Teclado e menus

    override func keyDown(with event: NSEvent) {
        let code = Int(event.keyCode)
        let mods = event.modifierFlags.intersection(Shortcut.relevantModifiers)
        if code == kVK_Escape {
            onCancel?()
            return
        }
        if (code == kVK_Return || code == kVK_ANSI_KeypadEnter), selection != nil {
            onConfirm?()
            return
        }
        if mods.isEmpty, selection != nil, let chars = event.charactersIgnoringModifiers?.lowercased() {
            if chars == "m" || chars == "v" {
                selectMoveTool()
                return
            }
            if let t = Tool.allCases.first(where: { $0.key == chars }) {
                selectTool(t)
                return
            }
        }
        super.keyDown(with: event)
    }

    @objc func copy(_ sender: Any?) {
        if selection != nil { onConfirm?() }
    }

    @objc func saveImage(_ sender: Any?) {
        if selection != nil { onSaveAs?() }
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

    private func beginText(at p: NSPoint) {
        let field = NSTextField(string: "")
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.isEditable = true
        field.isSelectable = true
        field.font = NSFont.systemFont(ofSize: Annotation.fontSize(forWidth: lineWidth), weight: .semibold)
        field.textColor = color
        field.placeholderString = "Digite o texto"
        field.delegate = self
        field.cell?.isScrollable = true
        field.cell?.wraps = false
        field.sizeToFit()
        let height = field.frame.height
        field.frame = NSRect(x: p.x - 2, y: p.y - height / 2, width: 160, height: height)
        addSubview(field, positioned: .below, relativeTo: palette)
        textField = field
        window?.makeFirstResponder(field)
    }

    func controlTextDidChange(_ obj: Notification) {
        guard let field = textField else { return }
        let origin = field.frame.origin
        field.sizeToFit()
        field.setFrameOrigin(origin)
        field.setFrameSize(NSSize(width: max(160, field.frame.width + 24), height: field.frame.height))
    }

    func controlTextDidEndEditing(_ obj: Notification) {
        DispatchQueue.main.async { [weak self] in self?.commitText() }
    }

    func commitText() {
        guard let field = textField else { return }
        textField = nil
        let text = field.stringValue
        let origin = NSPoint(x: field.frame.minX + 2, y: field.frame.minY)
        field.delegate = nil
        field.removeFromSuperview()
        if window?.firstResponder == nil || window?.firstResponder === window { window?.makeFirstResponder(self) }
        let a = Annotation(tool: .text, color: color, width: lineWidth, start: origin)
        a.text = text
        if a.isMeaningful { add(a) }
        needsDisplay = true
    }

    // MARK: Resultado

    /// Recorta a área selecionada (resolução Retina) com as marcações aplicadas.
    func render() -> NSBitmapImageRep? {
        commitText()
        guard let sel = selection?.integral.intersection(bounds), sel.width >= 1, sel.height >= 1 else { return nil }
        let pixelRect = CGRect(x: sel.minX * pixelScale,
                               y: (bounds.height - sel.maxY) * pixelScale,
                               width: sel.width * pixelScale,
                               height: sel.height * pixelScale).integral
        guard let cropped = screenshot.cropping(to: pixelRect),
              let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                         pixelsWide: cropped.width,
                                         pixelsHigh: cropped.height,
                                         bitsPerSample: 8, samplesPerPixel: 4,
                                         hasAlpha: true, isPlanar: false,
                                         colorSpaceName: .deviceRGB,
                                         bytesPerRow: 0, bitsPerPixel: 0) else { return nil }
        rep.size = sel.size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        NSImage(cgImage: cropped, size: sel.size).draw(in: NSRect(origin: .zero, size: sel.size))
        let t = NSAffineTransform()
        t.translateX(by: -sel.minX, yBy: -sel.minY)
        t.concat()
        for a in annotations { a.draw() }
        NSGraphicsContext.current?.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        return rep
    }

    // MARK: Demonstração (prints automáticos)

    func demo(selection sel: NSRect, annotations list: [Annotation], selecting: Bool) {
        selection = sel
        if selecting {
            drag = .selecting(sel.origin)
        } else {
            for a in list { add(a) }
            layoutPalette()
        }
        needsDisplay = true
    }
}
