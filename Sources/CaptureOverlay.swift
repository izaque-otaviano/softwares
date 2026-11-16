import Cocoa
import Carbon
import ImageIO

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
    /// Chamado ao copiar o texto reconhecido (OCR).
    var onTextCopied: ((String) -> Void)?
    /// Cópia rápida de texto: resultado do OCR, sem painel.
    var onQuickText: ((OCR.Outcome) -> Void)?
    /// Conta-gotas: cor em HEX copiada.
    var onColorCopied: ((String) -> Void)?
    /// Fixar na tela: imagem final e onde ela estava (coordenadas globais).
    var onPin: ((NSBitmapImageRep, NSRect) -> Void)?
    /// Sempre chamado quando a sobreposição fecha.
    var onFinish: (() -> Void)?

    /// - Parameters:
    ///   - mode: `.textOnly` = seleciona a área e copia o texto direto (OCR rápido).
    ///   - frozen: mostra a "foto" da tela em vez da tela ao vivo (captura com atraso).
    ///   - demoImage: usado só nos prints automáticos (substitui a tela real).
    init?(screen: NSScreen, mode: OverlayView.Mode = .normal, frozen: Bool = false, demoImage: NSImage? = nil) {
        let windows = CaptureOverlay.windowRects(on: screen)
        guard let shot = CaptureOverlay.captureScreen(screen, demoImage: demoImage) else { return nil }

        window = OverlayWindow(contentRect: screen.frame, styleMask: [.borderless],
                               backing: .buffered, defer: false)
        window.setFrame(screen.frame, display: false)
        window.level = .screenSaver
        // Janela transparente: a tela real continua visível por baixo.
        window.backgroundColor = .clear
        window.isOpaque = false
        window.ignoresMouseEvents = false
        window.hasShadow = false
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.acceptsMouseMovedEvents = true

        let backdrop = demoImage ?? (frozen ? NSImage(cgImage: shot, size: screen.frame.size) : nil)
        view = OverlayView(frame: NSRect(origin: .zero, size: screen.frame.size), screenshot: shot,
                           backdrop: backdrop, mode: mode, windowRects: windows)
        window.contentView = view
        super.init()

        view.onCancel = { [weak self] in self?.finish() }
        view.onConfirm = { [weak self] in
            guard let self = self else { return }
            let rep = self.view.render()
            self.finish()
            if let rep = rep { self.onConfirm?(rep) }
        }
        view.onTextCopied = { [weak self] text in
            guard let self = self else { return }
            self.finish()
            self.onTextCopied?(text)
        }
        view.onQuickText = { [weak self] outcome in
            guard let self = self else { return }
            self.finish()
            self.onQuickText?(outcome)
        }
        view.onColorCopied = { [weak self] hex in
            guard let self = self else { return }
            self.finish()
            self.onColorCopied?(hex)
        }
        let screenOrigin = screen.frame.origin
        view.onPin = { [weak self] in
            guard let self = self, let sel = self.view.selection else { return }
            let rep = self.view.render()
            self.finish()
            if let rep = rep { self.onPin?(rep, sel.offsetBy(dx: screenOrigin.x, dy: screenOrigin.y)) }
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
        view.updateHover(window.mouseLocationOutsideOfEventStream)
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
        if let image = CGDisplayCreateImage(displayID), !isBlack(image) {
            return image
        }
        // Plano B: o utilitário do próprio macOS.
        return captureWithTool(screen) ?? CGDisplayCreateImage(displayID)
    }

    /// Janelas visíveis (de trás para frente na lista = da frente para trás na tela),
    /// em coordenadas da tela indicada. Usado para "clicar numa janela".
    private static func windowRects(on screen: NSScreen) -> [NSRect] {
        guard let info = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements],
                                                    kCGNullWindowID) as? [[String: Any]] else { return [] }
        let primaryHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
        let myPID = Int(ProcessInfo.processInfo.processIdentifier)
        let local = NSRect(origin: .zero, size: screen.frame.size)
        var rects: [NSRect] = []
        for w in info {
            guard (w[kCGWindowLayer as String] as? Int) == 0,
                  (w[kCGWindowOwnerPID as String] as? Int) != myPID,
                  let dict = w[kCGWindowBounds as String] as? NSDictionary,
                  let r = CGRect(dictionaryRepresentation: dict as CFDictionary),
                  r.width >= 40, r.height >= 40 else { continue }
            if let alpha = w[kCGWindowAlpha as String] as? Double, alpha <= 0.01 { continue }
            let global = NSRect(x: r.minX, y: primaryHeight - r.maxY, width: r.width, height: r.height)
            let rect = global.offsetBy(dx: -screen.frame.minX, dy: -screen.frame.minY).intersection(local)
            if rect.width >= 40 && rect.height >= 40 { rects.append(rect) }
        }
        return rects
    }

    /// Captura a tela com /usr/sbin/screencapture (silencioso, sem som).
    private static func captureWithTool(_ screen: NSScreen) -> CGImage? {
        let primaryHeight = NSScreen.screens.first?.frame.height ?? screen.frame.height
        let f = screen.frame
        let rect = "\(Int(f.minX)),\(Int(primaryHeight - f.maxY)),\(Int(f.width)),\(Int(f.height))"
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("recorte-tela-\(UUID().uuidString).png")
        defer { try? FileManager.default.removeItem(at: url) }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-x", "-t", "png", "-R", rect, url.path]
        do {
            try process.run()
        } catch {
            return nil
        }
        process.waitUntilExit()
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    /// Verifica se a imagem saiu toda preta (falha silenciosa de captura).
    private static func isBlack(_ image: CGImage) -> Bool {
        let side = 16
        guard let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
        guard let data = ctx.data else { return false }
        let pixels = data.bindMemory(to: UInt8.self, capacity: ctx.bytesPerRow * side)
        for row in 0..<side {
            for col in 0..<side where pixels[row * ctx.bytesPerRow + col] > 10 {
                return false
            }
        }
        return true
    }
}

/// Tela congelada + seleção + marcações + barra de ferramentas.
final class OverlayView: NSView, NSTextFieldDelegate {
    enum Mode {
        case normal
        /// Copiar texto direto: seleciona a área, reconhece e copia.
        case textOnly
    }

    private enum Drag {
        case none
        case selecting(NSPoint)
        case moving(NSPoint)
        case movingAnnotation(Annotation, NSPoint, NSPoint)
        case resizing(Int, Int, NSPoint, NSRect)
        case drawing
    }

    let mode: Mode
    private let windowRects: [NSRect]
    /// Janela (ou tela inteira) sob o mouse antes de selecionar.
    private var hoveredRect: NSRect?
    private var selectedAnnotation: Annotation? { didSet { needsDisplay = true } }
    private var isRecognizing = false
    var onQuickText: ((OCR.Outcome) -> Void)?
    var onColorCopied: ((String) -> Void)?
    var onPin: (() -> Void)?

    /// Versão pixelada da tela inteira (para a ferramenta "pixelar").
    private lazy var pixelated: NSImage? = {
        let block = max(1, 12 * pixelScale)
        let w = max(1, Int(CGFloat(screenshot.width) / block))
        let h = max(1, Int(CGFloat(screenshot.height) / block))
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(screenshot, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let small = ctx.makeImage() else { return nil }
        return NSImage(cgImage: small, size: bounds.size)
    }()

    let screenshot: CGImage
    /// Só nos prints automáticos: imagem desenhada no lugar da tela real.
    private let backdrop: NSImage?
    var mouse: NSPoint?
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

    private let palette = SolidEffectView()
    private var textPanel: TextPanelView?
    var onTextCopied: ((String) -> Void)?
    private var moveButton: IconButton!
    private var toolButtons: [IconButton] = []
    private var colorButtons: [ColorButton] = []
    private var widthButtons: [WidthButton] = []

    init(frame: NSRect, screenshot: CGImage, backdrop: NSImage? = nil,
         mode: Mode = .normal, windowRects: [NSRect] = []) {
        self.screenshot = screenshot
        self.backdrop = backdrop
        self.mode = mode
        self.windowRects = windowRects
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
    override var isOpaque: Bool { return false }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        for area in trackingAreas where area.owner === self { removeTrackingArea(area) }
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseMoved, .activeAlways, .inVisibleRect],
                                       owner: self, userInfo: nil))
    }

    override func mouseMoved(with event: NSEvent) {
        updateHover(convert(event.locationInWindow, from: nil))
    }

    func updateHover(_ p: NSPoint) {
        mouse = p
        if selection == nil {
            hoveredRect = windowRects.first(where: { $0.contains(p) }) ?? bounds
            needsDisplay = true
        }
    }

    // MARK: Barra de ferramentas

    private func buildPalette() {
        palette.material = .hudWindow
        palette.blendingMode = .behindWindow
        palette.state = .active
        palette.appearance = NSAppearance(named: .darkAqua)
        palette.maskImage = Icons.roundedMask(radius: 12)
        palette.isHidden = true

        var items: [NSView] = []

        moveButton = IconButton(image: Icons.move, tip: "Selecionar e mover marcações ou a área (M) · ⌫ apaga")
        moveButton.onClick = { [weak self] in self?.selectMoveTool() }
        items.append(moveButton)
        for tool in Tool.allCases {
            let b = IconButton(image: tool.icon, tip: tool.title)
            b.onClick = { [weak self] in self?.selectTool(tool) }
            toolButtons.append(b)
            items.append(b)
        }
        let ocr = IconButton(image: Icons.ocr, tip: "Extrair texto da área (E)")
        ocr.onClick = { [weak self] in self?.extractText() }
        items.append(ocr)
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
        let pin = IconButton(image: Icons.pin, tip: "Fixar na tela (F)")
        pin.onClick = { [weak self] in self?.onPin?() }
        let copy = IconButton(image: Icons.copy, tip: "Copiar (⌘C)")
        copy.onClick = { [weak self] in self?.onConfirm?() }
        let cancel = IconButton(image: Icons.close, tip: "Cancelar (Esc)")
        cancel.onClick = { [weak self] in self?.onCancel?() }
        let ok = AccentButton(title: "OK", tip: "Copiar e salvar (Enter)")
        ok.onClick = { [weak self] in self?.onConfirm?() }
        items.append(contentsOf: [save, pin, copy, cancel, ok] as [NSView])

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
        // Área livre (sem o painel de texto, se estiver aberto).
        var minX = bounds.minX + 8, maxX = bounds.maxX - 8
        if let panel = textPanel {
            if panel.frame.midX > bounds.midX { maxX = panel.frame.minX - 8 } else { minX = panel.frame.maxX + 8 }
        }
        var x = sel.midX - size.width / 2
        x = max(min(x, maxX - size.width), minX)
        var y = sel.minY - size.height - 10
        if y < bounds.minY + 8 { y = sel.maxY + 10 }
        if y + size.height > bounds.maxY - 8 { y = sel.minY + 10 }
        palette.frame = NSRect(x: x.rounded(), y: y.rounded(), width: size.width, height: size.height)
        palette.isHidden = false
        window?.invalidateCursorRects(for: self)
    }

    private func selectMoveTool() {
        commitText()
        selectedAnnotation = nil
        isMoveTool = true
        moveButton.isSelected = true
        for b in toolButtons { b.isSelected = false }
        window?.invalidateCursorRects(for: self)
    }

    private func selectTool(_ t: Tool) {
        commitText()
        selectedAnnotation = nil
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
        // Quase transparente: a tela real aparece, mas os cliques ficam com o app.
        NSColor(white: 0, alpha: 0.01).setFill()
        bounds.fill(using: .copy)
        if let backdrop = backdrop {
            backdrop.draw(in: bounds)
        }

        guard let sel = selection else {
            if let h = hoveredRect, h != bounds {
                // Destaca a janela sob o mouse (um clique a captura inteira).
                NSColor.controlAccentColor.withAlphaComponent(0.12).setFill()
                h.fill(using: .sourceOver)
                let border = NSBezierPath(rect: h.insetBy(dx: 1.5, dy: 1.5))
                border.lineWidth = 3
                NSColor.controlAccentColor.withAlphaComponent(0.9).setStroke()
                border.stroke()
            }
            drawCrosshair()
            let hint = mode == .textOnly
                ? "Selecione a área com texto para copiar  ·  Esc para cancelar"
                : "Arraste para selecionar  ·  Clique numa janela para capturá-la  ·  C copia a cor  ·  Esc cancela"
            drawPill(hint, at: NSPoint(x: bounds.midX, y: bounds.maxY - 60), centered: true)
            if let m = mouse { drawLoupe(at: m) }
            return
        }

        // Escurece levemente tudo fora da seleção.
        NSColor(white: 0, alpha: 0.3).setFill()
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

        // Moldura da marcação selecionada
        if let a = selectedAnnotation {
            let frame = NSBezierPath(rect: a.bounds.insetBy(dx: -6, dy: -6))
            frame.lineWidth = 1.5
            frame.setLineDash([5, 3], count: 2, phase: 0)
            NSColor.white.setStroke()
            frame.stroke()
            frame.setLineDash([5, 3], count: 2, phase: 5)
            NSColor.controlAccentColor.setStroke()
            frame.stroke()
        }

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
            if let m = mouse { drawLoupe(at: m) }
        }

        if isRecognizing {
            drawPill("Reconhecendo texto…", at: NSPoint(x: sel.midX, y: sel.midY - 12), centered: true)
        }
    }

    // MARK: Lupa e conta-gotas

    /// Lupa com os pixels em volta do mouse, posição e cor.
    private func drawLoupe(at m: NSPoint) {
        let cells = 15
        let zoom: CGFloat = 8
        let size = CGFloat(cells) * zoom
        let labelHeight: CGFloat = 26
        var x = m.x + 24
        var y = m.y - 24 - size - labelHeight
        if x + size > bounds.maxX - 8 { x = m.x - 24 - size }
        if y < bounds.minY + 8 { y = m.y + 24 }
        let box = NSRect(x: x, y: y + labelHeight, width: size, height: size)

        let px = (m.x * pixelScale).rounded(.down)
        let py = ((bounds.height - m.y) * pixelScale).rounded(.down)
        let half = CGFloat(cells / 2)
        let crop = CGRect(x: px - half, y: py - half, width: CGFloat(cells), height: CGFloat(cells))

        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.4)
        shadow.shadowBlurRadius = 8
        shadow.shadowOffset = NSSize(width: 0, height: -2)
        shadow.set()
        NSColor.black.setFill()
        NSBezierPath(roundedRect: box, xRadius: 10, yRadius: 10).fill()
        NSGraphicsContext.restoreGraphicsState()

        NSGraphicsContext.saveGraphicsState()
        NSBezierPath(roundedRect: box, xRadius: 10, yRadius: 10).addClip()
        if let img = screenshot.cropping(to: crop) {
            NSGraphicsContext.current?.imageInterpolation = .none
            NSImage(cgImage: img, size: NSSize(width: img.width, height: img.height)).draw(in: box)
        }
        let center = NSRect(x: box.minX + half * zoom, y: box.minY + half * zoom, width: zoom, height: zoom)
        let cross = NSBezierPath()
        cross.move(to: NSPoint(x: box.minX, y: center.midY)); cross.line(to: NSPoint(x: center.minX, y: center.midY))
        cross.move(to: NSPoint(x: center.maxX, y: center.midY)); cross.line(to: NSPoint(x: box.maxX, y: center.midY))
        cross.move(to: NSPoint(x: center.midX, y: box.minY)); cross.line(to: NSPoint(x: center.midX, y: center.minY))
        cross.move(to: NSPoint(x: center.midX, y: center.maxY)); cross.line(to: NSPoint(x: center.midX, y: box.maxY))
        cross.lineWidth = 1
        NSColor.controlAccentColor.withAlphaComponent(0.6).setStroke()
        cross.stroke()
        let cell = NSBezierPath(rect: center)
        cell.lineWidth = 1.5
        NSColor.white.setStroke()
        cell.stroke()
        NSGraphicsContext.restoreGraphicsState()

        let ring = NSBezierPath(roundedRect: box.insetBy(dx: 0.5, dy: 0.5), xRadius: 10, yRadius: 10)
        ring.lineWidth = 1.5
        NSColor(white: 1, alpha: 0.85).setStroke()
        ring.stroke()

        let hex = colorHex(at: m) ?? "—"
        drawPill("\(Int(px)), \(Int(py))   \(hex)", at: NSPoint(x: box.minX, y: y), centered: false)
    }

    /// Cor (sRGB, em HEX) do pixel sob o ponto indicado.
    private func colorHex(at m: NSPoint) -> String? {
        let px = Int(m.x * pixelScale), py = Int((bounds.height - m.y) * pixelScale)
        guard px >= 0, py >= 0, px < screenshot.width, py < screenshot.height,
              let one = screenshot.cropping(to: CGRect(x: px, y: py, width: 1, height: 1)),
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                  space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.draw(one, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        guard let raw = ctx.data else { return nil }
        let bytes = raw.bindMemory(to: UInt8.self, capacity: 4)
        return String(format: "#%02X%02X%02X", bytes[0], bytes[1], bytes[2])
    }

    /// Linhas-guia que seguem o mouse antes de selecionar.
    private func drawCrosshair() {
        guard let m = mouse else { return }
        let x = m.x.rounded() + 0.5, y = m.y.rounded() + 0.5
        let path = NSBezierPath()
        path.move(to: NSPoint(x: bounds.minX, y: y)); path.line(to: NSPoint(x: bounds.maxX, y: y))
        path.move(to: NSPoint(x: x, y: bounds.minY)); path.line(to: NSPoint(x: x, y: bounds.maxY))
        path.lineWidth = 3
        NSColor(white: 0, alpha: 0.25).setStroke()
        path.stroke()
        path.lineWidth = 1
        NSColor(white: 1, alpha: 0.85).setStroke()
        path.stroke()
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
        if let panel = textPanel { addCursorRect(panel.frame, cursor: .arrow) }
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
        if isRecognizing { return }
        if let h = hitHandle(p, in: sel) {
            drag = .resizing(h.0, h.1, p, sel)
            palette.isHidden = true
            return
        }
        if sel.contains(p) {
            if isMoveTool {
                if let a = annotations.reversed().first(where: { $0.hitTest(p) }) {
                    selectedAnnotation = a
                    drag = .movingAnnotation(a, p, p)
                } else {
                    selectedAnnotation = nil
                    drag = .moving(p)
                }
                NSCursor.closedHand.set()
                return
            }
            if tool == .text {
                beginText(at: p)
                return
            }
            if tool == .number {
                let a = Annotation(tool: .number, color: color, width: lineWidth, start: p)
                a.number = (annotations.filter { $0.tool == .number }.map { $0.number }.max() ?? 0) + 1
                add(a)
                return
            }
            let a = Annotation(tool: tool, color: color, width: lineWidth, start: p)
            if tool == .pixelate {
                a.pixelSource = pixelated
                a.sourceFrame = bounds
            }
            current = a
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
        mouse = p
        switch drag {
        case .movingAnnotation(let a, let start, let last):
            a.move(by: p.x - last.x, p.y - last.y)
            drag = .movingAnnotation(a, start, p)

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
                selectionCompleted()
            } else if let h = hoveredRect {
                // Clique sem arrastar: captura a janela sob o mouse (ou a tela toda).
                selection = h
                selectionCompleted()
            } else {
                selection = nil
            }
        case .movingAnnotation(let a, let start, let last):
            let dx = last.x - start.x, dy = last.y - start.y
            if dx != 0 || dy != 0 { registerMove(a, dx, dy) }
            NSCursor.openHand.set()
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

    private func selectionCompleted() {
        hoveredRect = nil
        if mode == .textOnly {
            quickCopyText()
        } else {
            layoutPalette()
        }
    }

    private func registerMove(_ a: Annotation, _ dx: CGFloat, _ dy: CGFloat) {
        undoManager?.registerUndo(withTarget: self) { target in
            a.move(by: -dx, -dy)
            target.registerMove(a, -dx, -dy)
            target.needsDisplay = true
        }
        undoManager?.setActionName("Mover")
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
            if textPanel != nil {
                closeTextPanel()
                return
            }
            onCancel?()
            return
        }
        if isRecognizing { return }
        let chars = event.charactersIgnoringModifiers?.lowercased() ?? ""
        if selection == nil {
            // Antes de selecionar: C copia a cor sob o mouse.
            if mods.isEmpty, chars == "c", mode == .normal, let m = mouse, let hex = colorHex(at: m) {
                onColorCopied?(hex)
            }
            return
        }
        if (code == kVK_Return || code == kVK_ANSI_KeypadEnter) {
            onConfirm?()
            return
        }
        if (code == kVK_Delete || code == kVK_ForwardDelete), let a = selectedAnnotation {
            selectedAnnotation = nil
            remove(a)
            return
        }
        if mods == [.shift], chars == "e" {
            quickCopyText()
            return
        }
        if mods.isEmpty {
            if chars == "e" {
                extractText()
                return
            }
            if chars == "f" {
                onPin?()
                return
            }
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
        if selectedAnnotation === a { selectedAnnotation = nil }
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
        guard let sel = selection?.integral.intersection(bounds), sel.width >= 1, sel.height >= 1,
              let cropped = croppedScreenshot(sel),
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

    private func croppedScreenshot(_ sel: NSRect) -> CGImage? {
        let pixelRect = CGRect(x: sel.minX * pixelScale,
                               y: (bounds.height - sel.maxY) * pixelScale,
                               width: sel.width * pixelScale,
                               height: sel.height * pixelScale).integral
        return screenshot.cropping(to: pixelRect)
    }

    // MARK: Extrair texto (OCR)

    func extractText() {
        commitText()
        guard let sel = selection?.integral.intersection(bounds), sel.width >= 4, sel.height >= 4,
              let image = croppedScreenshot(sel) else { NSSound.beep(); return }

        let panel = textPanel ?? makeTextPanel()
        layoutTextPanel(panel)
        panel.showLoading()
        OCR.recognize(image) { [weak self, weak panel] outcome in
            guard let self = self, let panel = panel, panel === self.textPanel else { return }
            panel.show(outcome)
            if ProcessInfo.processInfo.environment["RECORTE_DEMO"] != nil, case .text(let t) = outcome {
                print("OCR resultado:\n\(t)")
            }
        }
    }

    /// Reconhece o texto da área e copia direto, sem abrir o painel.
    func quickCopyText() {
        commitText()
        guard let sel = selection?.integral.intersection(bounds), sel.width >= 4, sel.height >= 4,
              let image = croppedScreenshot(sel) else { NSSound.beep(); return }
        palette.isHidden = true
        isRecognizing = true
        needsDisplay = true
        OCR.recognize(image) { [weak self] outcome in
            guard let self = self else { return }
            self.isRecognizing = false
            self.onQuickText?(outcome)
        }
    }

    private func makeTextPanel() -> TextPanelView {
        let panel = TextPanelView()
        panel.onClose = { [weak self] in self?.closeTextPanel() }
        panel.onCopy = { [weak self] text in self?.onTextCopied?(text) }
        addSubview(panel)
        textPanel = panel
        return panel
    }

    private func closeTextPanel() {
        textPanel?.removeFromSuperview()
        textPanel = nil
        layoutPalette()
        window?.makeFirstResponder(self)
        window?.invalidateCursorRects(for: self)
    }

    /// Painel na lateral oposta à seleção, ocupando a altura da tela.
    private func layoutTextPanel(_ panel: TextPanelView) {
        let width: CGFloat = min(380, bounds.width * 0.4)
        let margin: CGFloat = 16
        let onRight = (selection?.midX ?? 0) < bounds.midX
        let x = onRight ? bounds.maxX - width - margin : bounds.minX + margin
        let height = min(bounds.height - margin * 2, 720)
        var frame = NSRect(x: x, y: (bounds.midY - height / 2).rounded(), width: width, height: height)
        panel.frame = frame
        layoutPalette()
        // Em telas pequenas a barra pode não caber ao lado do painel: o painel encolhe.
        let bar = palette.frame
        if !palette.isHidden && bar.intersects(frame) {
            if bar.midY < bounds.midY {
                frame.size.height = frame.maxY - (bar.maxY + 10)
                frame.origin.y = bar.maxY + 10
            } else {
                frame.size.height = (bar.minY - 10) - frame.minY
            }
            if frame.height >= 200 { panel.frame = frame }
        }
        window?.invalidateCursorRects(for: self)
    }

    // MARK: Demonstração (prints automáticos)

    /// Demonstração: destaca a janela sob um ponto (lupa e "clique na janela").
    func demoHover(at p: NSPoint) {
        updateHover(p)
    }

    /// Demonstração: deixa uma marcação selecionada.
    func demoSelect(_ a: Annotation) {
        selectMoveTool()
        selectedAnnotation = a
    }

    func demo(selection sel: NSRect, annotations list: [Annotation], selecting: Bool, ocr: Bool = false) {
        selection = sel
        if selecting {
            drag = .selecting(sel.origin)
        } else {
            for a in list {
                if a.tool == .pixelate {
                    a.pixelSource = pixelated
                    a.sourceFrame = bounds
                }
                add(a)
            }
            if mode == .textOnly {
                quickCopyText()
                return
            }
            layoutPalette()
            if ocr { extractText() }
        }
        needsDisplay = true
    }
}
