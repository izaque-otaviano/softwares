import Cocoa

/// Janela do editor. Repassa as ações de menu (⌘C, ⌘S) para o controlador.
final class EditorWindow: NSWindow {
    weak var editor: EditorWindowController?

    @objc func copy(_ sender: Any?) { editor?.copyImage(nil) }
    @objc func saveImage(_ sender: Any?) { editor?.saveAs(nil) }
}

private extension NSToolbarItem.Identifier {
    static let recorteSave = NSToolbarItem.Identifier("recorte.save")
    static let recorteCopy = NSToolbarItem.Identifier("recorte.copy")
    static let recorteDone = NSToolbarItem.Identifier("recorte.done")
}

final class EditorWindowController: NSWindowController, NSWindowDelegate, NSToolbarDelegate {
    static let colors: [(NSColor, String)] = [
        (.systemRed, "Vermelho"),
        (.systemYellow, "Amarelo"),
        (.systemGreen, "Verde"),
        (.systemBlue, "Azul"),
        (.black, "Preto"),
        (.white, "Branco"),
    ]
    static let widths: [(CGFloat, String)] = [(2, "Fino"), (4, "Médio"), (8, "Grosso")]

    let canvas: CanvasView
    var onClose: ((EditorWindowController) -> Void)?

    private var toolButtons: [IconButton] = []
    private var colorButtons: [ColorButton] = []
    private var widthButtons: [WidthButton] = []
    private weak var copyButton: NSButton?

    init(image: NSImage) {
        canvas = CanvasView(image: image)

        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let chrome = NSSize(width: 48, height: 76 + 16 + 52)
        let fit = min(1,
                      (visible.width * 0.85 - chrome.width) / max(image.size.width, 1),
                      (visible.height * 0.85 - chrome.height) / max(image.size.height, 1))
        let contentSize = NSSize(width: max(660, image.size.width * fit + chrome.width),
                                 height: max(420, image.size.height * fit + chrome.height))

        let window = EditorWindow(contentRect: NSRect(origin: .zero, size: contentSize),
                                  styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                                  backing: .buffered,
                                  defer: false)
        window.title = "Recorte"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 660, height: 420)
        window.collectionBehavior = [.moveToActiveSpace]

        super.init(window: window)
        window.editor = self
        window.delegate = self
        buildContent(in: window)
        buildToolbar(in: window)
        restoreLastChoices()
        window.center()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    // MARK: Layout

    private func buildContent(in window: NSWindow) {
        // Material de fundo translúcido (Under Window Background).
        let background = NSVisualEffectView()
        background.material = .underWindowBackground
        background.blendingMode = .behindWindow
        background.state = .followsWindowActiveState
        window.contentView = background

        canvas.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(canvas)

        let palette = makePalette()
        palette.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(palette)

        var constraints = [
            canvas.leadingAnchor.constraint(equalTo: background.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: background.trailingAnchor),
            canvas.bottomAnchor.constraint(equalTo: background.bottomAnchor),
            palette.centerXAnchor.constraint(equalTo: background.centerXAnchor),
            palette.bottomAnchor.constraint(equalTo: background.bottomAnchor, constant: -18),
        ]
        if let guide = window.contentLayoutGuide as? NSLayoutGuide {
            constraints.append(canvas.topAnchor.constraint(equalTo: guide.topAnchor))
        } else {
            constraints.append(canvas.topAnchor.constraint(equalTo: background.topAnchor, constant: 52))
        }
        NSLayoutConstraint.activate(constraints)

        canvas.onToolChange = { [weak self] tool in self?.toolChanged(tool) }
        window.initialFirstResponder = canvas
    }

    /// Paleta flutuante com material translúcido (Popover), como as barras do macOS.
    private func makePalette() -> NSView {
        let effect = NSVisualEffectView()
        effect.material = .popover
        effect.blendingMode = .withinWindow
        effect.state = .active
        effect.maskImage = Icons.roundedMask(radius: 12)

        var items: [NSView] = []

        for tool in Tool.allCases {
            let b = IconButton(image: tool.icon, tip: tool.title)
            b.onClick = { [weak self] in self?.canvas.tool = tool }
            toolButtons.append(b)
            items.append(b)
        }
        items.append(makeSeparator())

        for (i, entry) in EditorWindowController.colors.enumerated() {
            let b = ColorButton(color: entry.0, tip: entry.1)
            b.onClick = { [weak self] in self?.selectColor(i) }
            colorButtons.append(b)
            items.append(b)
        }
        items.append(makeSeparator())

        for (i, entry) in EditorWindowController.widths.enumerated() {
            let b = WidthButton(width: entry.0, tip: "Espessura: \(entry.1)")
            b.onClick = { [weak self] in self?.selectWidth(i) }
            widthButtons.append(b)
            items.append(b)
        }
        items.append(makeSeparator())

        let undo = IconButton(image: Icons.undo, tip: "Desfazer (⌘Z)")
        undo.onClick = { [weak self] in self?.window?.undoManager?.undo() }
        let redo = IconButton(image: Icons.redo, tip: "Refazer (⇧⌘Z)")
        redo.onClick = { [weak self] in self?.window?.undoManager?.redo() }
        items.append(undo)
        items.append(redo)

        let stack = NSStackView(views: items)
        stack.orientation = .horizontal
        stack.spacing = 2
        stack.alignment = .centerY
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.setCustomSpacing(8, after: toolButtons.last!)
        stack.setCustomSpacing(8, after: colorButtons.last!)
        stack.setCustomSpacing(8, after: widthButtons.last!)
        effect.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: effect.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: effect.trailingAnchor, constant: -8),
            stack.topAnchor.constraint(equalTo: effect.topAnchor, constant: 5),
            stack.bottomAnchor.constraint(equalTo: effect.bottomAnchor, constant: -5),
        ])
        return effect
    }

    private func buildToolbar(in window: NSWindow) {
        let toolbar = NSToolbar(identifier: "RecorteEditorToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        toolbar.showsBaselineSeparator = false
        window.toolbar = toolbar
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        return [.flexibleSpace, .recorteSave, .recorteCopy, .recorteDone]
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        return [.flexibleSpace, .recorteSave, .recorteCopy, .recorteDone]
    }

    func toolbar(_ toolbar: NSToolbar,
                 itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier,
                 willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let button: NSButton
        switch itemIdentifier {
        case .recorteSave:
            button = NSButton(title: "Salvar…", target: self, action: #selector(saveAs(_:)))
            button.toolTip = "Salvar como arquivo PNG (⌘S)"
        case .recorteCopy:
            button = NSButton(title: "Copiar", target: self, action: #selector(copyImage(_:)))
            button.toolTip = "Copiar para a área de transferência (⌘C)"
            copyButton = button
        case .recorteDone:
            button = NSButton(title: "Concluído", target: self, action: #selector(done(_:)))
            button.toolTip = "Copiar, salvar na pasta escolhida e fechar"
            button.font = NSFont.systemFont(ofSize: NSFont.systemFontSize, weight: .semibold)
        default:
            return nil
        }
        button.bezelStyle = .texturedRounded
        button.sizeToFit()
        let item = NSToolbarItem(itemIdentifier: itemIdentifier)
        item.label = button.title
        item.view = button
        let size = NSSize(width: max(76, button.frame.width + 8), height: button.frame.height)
        item.minSize = size
        item.maxSize = size
        return item
    }

    // MARK: Seleções

    private func restoreLastChoices() {
        selectColor(Settings.lastColorIndex)
        selectWidth(Settings.lastWidthIndex)
        canvas.tool = Settings.lastTool
        toolChanged(canvas.tool)
    }

    private func toolChanged(_ tool: Tool) {
        for (i, b) in toolButtons.enumerated() { b.isSelected = (i == tool.rawValue) }
        Settings.lastTool = tool
    }

    private func selectColor(_ index: Int) {
        let i = min(max(index, 0), EditorWindowController.colors.count - 1)
        canvas.color = EditorWindowController.colors[i].0
        for (j, b) in colorButtons.enumerated() { b.isSelected = (i == j) }
        Settings.lastColorIndex = i
    }

    private func selectWidth(_ index: Int) {
        let i = min(max(index, 0), EditorWindowController.widths.count - 1)
        canvas.lineWidth = EditorWindowController.widths[i].0
        for (j, b) in widthButtons.enumerated() { b.isSelected = (i == j) }
        Settings.lastWidthIndex = i
    }

    // MARK: Ações

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        window?.makeFirstResponder(canvas)
    }

    private func pngData() -> Data? {
        return canvas.renderBitmap()?.representation(using: .png, properties: [:])
    }

    @discardableResult
    private func writeToPasteboard() -> Bool {
        guard let rep = canvas.renderBitmap(),
              let png = rep.representation(using: .png, properties: [:]) else { return false }
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setData(png, forType: .png)
        if let tiff = rep.tiffRepresentation { pb.setData(tiff, forType: .tiff) }
        return true
    }

    @objc func copyImage(_ sender: Any?) {
        guard writeToPasteboard() else { NSSound.beep(); return }
        guard let button = copyButton else { return }
        button.title = "Copiado ✓"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak button] in
            button?.title = "Copiar"
        }
    }

    @objc func saveAs(_ sender: Any?) {
        guard let window = window else { return }
        canvas.commitText()
        let panel = NSSavePanel()
        panel.allowedFileTypes = ["png"]
        panel.canCreateDirectories = true
        panel.directoryURL = Settings.saveFolder
        panel.nameFieldStringValue = Settings.newFileName()
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url, let self = self else { return }
            guard let data = self.pngData() else { NSSound.beep(); return }
            do {
                try data.write(to: url)
            } catch {
                NSAlert(error: error).beginSheetModal(for: window, completionHandler: nil)
            }
        }
    }

    @objc func done(_ sender: Any?) {
        guard writeToPasteboard() else { NSSound.beep(); return }
        if Settings.saveOnDone, let data = pngData() {
            let folder = Settings.saveFolder
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
            let url = folder.appendingPathComponent(Settings.newFileName())
            do {
                try data.write(to: url)
            } catch {
                if let window = window {
                    NSAlert(error: error).beginSheetModal(for: window, completionHandler: nil)
                }
                return
            }
        }
        NSSound(named: NSSound.Name("Pop"))?.play()
        window?.close()
    }

    func windowWillClose(_ notification: Notification) {
        canvas.commitText()
        onClose?(self)
    }
}
