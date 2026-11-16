import Cocoa

/// Captura "fixada" na tela: fica flutuando por cima das outras janelas.
/// Arraste para mover, role para dar zoom, duplo clique ou Esc para fechar,
/// botão direito para copiar/salvar.
final class PinWindow: NSWindow {
    private static var open: [PinWindow] = []

    let rep: NSBitmapImageRep
    private let baseSize: NSSize
    private var zoom: CGFloat = 1

    static func show(_ rep: NSBitmapImageRep, at frame: NSRect) {
        let pin = PinWindow(rep: rep, frame: frame)
        open.append(pin)
        NSApp.activate(ignoringOtherApps: true)
        pin.makeKeyAndOrderFront(nil)
    }

    private init(rep: NSBitmapImageRep, frame: NSRect) {
        self.rep = rep
        self.baseSize = frame.size
        super.init(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        level = .floating
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        let image = NSImage(size: rep.size)
        image.addRepresentation(rep)
        let view = PinView(image: image)
        view.owner = self
        contentView = view
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var canBecomeKey: Bool { return true }

    override func close() {
        super.close()
        PinWindow.open.removeAll(where: { $0 === self })
    }

    func setZoom(_ z: CGFloat) {
        let newZoom = min(max(z, 0.25), 4)
        guard newZoom != zoom else { return }
        zoom = newZoom
        let size = NSSize(width: (baseSize.width * zoom).rounded(), height: (baseSize.height * zoom).rounded())
        let center = NSPoint(x: frame.midX, y: frame.midY)
        setFrame(NSRect(x: center.x - size.width / 2, y: center.y - size.height / 2,
                        width: size.width, height: size.height), display: true)
    }

    @objc func copy(_ sender: Any?) {
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setData(png, forType: .png)
        if let tiff = rep.tiffRepresentation { pb.setData(tiff, forType: .tiff) }
        Toast.show("Copiado", subtitle: "Pronto para colar (⌘V)")
    }

    @objc func saveImage(_ sender: Any?) {
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        let panel = NSSavePanel()
        panel.allowedFileTypes = ["png"]
        panel.canCreateDirectories = true
        panel.directoryURL = Settings.saveFolder
        panel.nameFieldStringValue = Settings.newFileName()
        panel.level = .modalPanel
        if panel.runModal() == .OK, let url = panel.url {
            try? png.write(to: url)
        }
    }

    @objc func closePin(_ sender: Any?) {
        close()
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == 53 { // Esc
            close()
        } else {
            super.keyDown(with: event)
        }
    }
}

private final class PinView: NSView {
    weak var owner: PinWindow?
    let image: NSImage

    init(image: NSImage) {
        self.image = image
        super.init(frame: .zero)
        toolTip = "Arraste para mover · role para zoom · duplo clique ou Esc para fechar"
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { return true }

    override func draw(_ dirtyRect: NSRect) {
        NSGraphicsContext.current?.imageInterpolation = .high
        image.draw(in: bounds)
        let border = NSBezierPath(rect: bounds.insetBy(dx: 0.5, dy: 0.5))
        border.lineWidth = 1
        NSColor.controlAccentColor.withAlphaComponent(0.8).setStroke()
        border.stroke()
    }

    override func mouseDown(with event: NSEvent) {
        if event.clickCount == 2 {
            owner?.close()
            return
        }
        window?.performDrag(with: event)
    }

    override func scrollWheel(with event: NSEvent) {
        guard let owner = owner else { return }
        let delta = event.scrollingDeltaY * (event.hasPreciseScrollingDeltas ? 0.01 : 0.1)
        owner.setZoom(owner.frame.width / max(image.size.width, 1) + delta)
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = NSMenu()
        let items: [(String, Selector)] = [
            ("Copiar", #selector(PinWindow.copy(_:))),
            ("Salvar como…", #selector(PinWindow.saveImage(_:))),
            ("Fechar", #selector(PinWindow.closePin(_:))),
        ]
        for (title, action) in items {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = owner
            menu.addItem(item)
        }
        return menu
    }
}
