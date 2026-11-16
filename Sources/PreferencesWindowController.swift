import Cocoa

final class PreferencesWindowController: NSWindowController, NSWindowDelegate {
    /// Chamado quando o usuário escolhe um novo atalho. Retorna `false` se não
    /// foi possível registrá-lo.
    var onShortcutChange: ((Shortcut) -> Bool)?
    var onRecordingChange: ((Bool) -> Void)?
    var onClose: (() -> Void)?

    private let recorder = ShortcutRecorderView(frame: .zero)
    private let textRecorder = ShortcutRecorderView(frame: .zero)
    private let warningLabel = NSTextField(labelWithString: "")
    private let folderLabel = NSTextField(labelWithString: "")
    private let saveCheckbox = NSButton(checkboxWithTitle: "Ao dar OK, salvar também uma cópia nesta pasta",
                                        target: nil, action: nil)

    convenience init() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 500, height: 340),
                              styleMask: [.titled, .closable, .miniaturizable, .fullSizeContentView],
                              backing: .buffered,
                              defer: false)
        window.title = "Preferências do Recorte"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false
        self.init(window: window)
        window.delegate = self
        build(in: window)
        window.center()
    }

    // MARK: Layout

    private func label(_ text: String, size: CGFloat = 13, weight: NSFont.Weight = .regular,
                       color: NSColor = .labelColor) -> NSTextField {
        let l = NSTextField(labelWithString: text)
        l.font = NSFont.systemFont(ofSize: size, weight: weight)
        l.textColor = color
        return l
    }

    private func wrapping(_ text: String, width: CGFloat, color: NSColor = .secondaryLabelColor) -> NSTextField {
        let l = NSTextField(wrappingLabelWithString: text)
        l.font = NSFont.systemFont(ofSize: 11)
        l.textColor = color
        l.preferredMaxLayoutWidth = width
        l.translatesAutoresizingMaskIntoConstraints = false
        l.widthAnchor.constraint(equalToConstant: width).isActive = true
        return l
    }

    private func build(in window: NSWindow) {
        // Material translúcido de fundo (Sidebar), que deixa a área de trabalho transparecer.
        let background = NSVisualEffectView()
        background.material = .sidebar
        background.blendingMode = .behindWindow
        background.state = .followsWindowActiveState
        window.contentView = background

        // Cabeçalho
        let icon = NSImageView(image: NSApp.applicationIconImage)
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 64).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 64).isActive = true
        let title = label("Recorte", size: 22, weight: .semibold)
        let subtitle = label("Capture qualquer parte da tela e destaque o que importa.",
                             size: 12, color: .secondaryLabelColor)
        let titles = NSStackView(views: [title, subtitle])
        titles.orientation = .vertical
        titles.alignment = .leading
        titles.spacing = 2
        let header = NSStackView(views: [icon, titles])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 14

        // Atalho
        recorder.shortcut = Settings.shortcut
        recorder.translatesAutoresizingMaskIntoConstraints = false
        recorder.widthAnchor.constraint(equalToConstant: 180).isActive = true
        recorder.heightAnchor.constraint(equalToConstant: 28).isActive = true
        recorder.onChange = { [weak self] s in self?.shortcutChanged(s) }
        recorder.onRecordingChange = { [weak self] r in self?.onRecordingChange?(r) }

        textRecorder.defaultShortcut = Shortcut.standardText
        textRecorder.shortcut = Settings.textShortcut
        textRecorder.translatesAutoresizingMaskIntoConstraints = false
        textRecorder.widthAnchor.constraint(equalToConstant: 180).isActive = true
        textRecorder.heightAnchor.constraint(equalToConstant: 28).isActive = true
        textRecorder.onChange = { [weak self] s in
            Settings.textShortcut = s
            self?.reportShortcutResult(self?.onShortcutChange?(s) ?? true)
        }
        textRecorder.onRecordingChange = { [weak self] r in self?.onRecordingChange?(r) }
        let textHint = wrapping("Selecione uma área e o texto dela vai direto para o “copiar”. ⌫ volta ao padrão ⇧⌘1.",
                                width: 250)

        let hint = wrapping("Clique no campo e pressione a nova combinação (use ⌘, ⌥ ou ⌃). "
                            + "Esc cancela, ⌫ volta ao padrão ⇧⌘2.", width: 250)
        warningLabel.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        warningLabel.textColor = .systemRed
        warningLabel.isHidden = true
        let hintStack = NSStackView(views: [hint, warningLabel])
        hintStack.orientation = .vertical
        hintStack.alignment = .leading
        hintStack.spacing = 4

        // Pasta
        folderLabel.lineBreakMode = .byTruncatingMiddle
        folderLabel.translatesAutoresizingMaskIntoConstraints = false
        folderLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 160).isActive = true
        folderLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        updateFolderLabel()
        let choose = NSButton(title: "Alterar…", target: self, action: #selector(chooseFolder(_:)))
        choose.bezelStyle = .rounded
        let folderRow = NSStackView(views: [folderLabel, choose])
        folderRow.orientation = .horizontal
        folderRow.spacing = 8

        saveCheckbox.target = self
        saveCheckbox.action = #selector(toggleSave(_:))
        saveCheckbox.state = Settings.saveOnDone ? .on : .off

        let grid = NSGridView(views: [
            [label("Atalho de captura:"), recorder],
            [NSGridCell.emptyContentView, hintStack],
            [label("Copiar texto da tela:"), textRecorder],
            [NSGridCell.emptyContentView, textHint],
            [label("Salvar capturas em:"), folderRow],
            [NSGridCell.emptyContentView, saveCheckbox],
        ])
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.rowSpacing = 10
        grid.columnSpacing = 12
        grid.yPlacement = .center
        grid.column(at: 0).xPlacement = .trailing
        grid.row(at: 2).topPadding = 8
        grid.row(at: 4).topPadding = 10

        let card = CardView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(grid)
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            grid.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18),
            grid.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            grid.leadingAnchor.constraint(greaterThanOrEqualTo: card.leadingAnchor, constant: 16),
        ])

        let footer = wrapping("Ao apertar o atalho, arraste para selecionar a área, marque e dê OK (ou Enter): "
                              + "a imagem vai para a área de transferência, pronta para colar com ⌘V. "
                              + "Clique sem arrastar para capturar a janela sob o mouse; C copia a cor sob a lupa. "
                              + "Teclas: M selecionar/mover (⌫ apaga) · A seta · R retângulo · O círculo · H destacar · "
                              + "P caneta · T texto · N números · B pixelar · E extrair texto (⇧E copia direto) · "
                              + "F fixar na tela · ⇧ formas perfeitas · Esc cancela.", width: 452)

        let root = NSStackView(views: [header, card, footer])
        root.orientation = .vertical
        root.alignment = .leading
        root.spacing = 18
        root.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(root)

        NSLayoutConstraint.activate([
            root.topAnchor.constraint(equalTo: background.topAnchor, constant: 40),
            root.leadingAnchor.constraint(equalTo: background.leadingAnchor, constant: 24),
            root.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -24),
            root.bottomAnchor.constraint(equalTo: background.bottomAnchor, constant: -22),
            root.widthAnchor.constraint(equalToConstant: 452),
            card.widthAnchor.constraint(equalTo: root.widthAnchor),
        ])

        background.layoutSubtreeIfNeeded()
        window.setContentSize(background.fittingSize)
    }

    private func updateFolderLabel() {
        let path = Settings.saveFolder.path
        folderLabel.stringValue = FileManager.default.displayName(atPath: path)
        folderLabel.toolTip = (path as NSString).abbreviatingWithTildeInPath
    }

    // MARK: Ações

    func show() {
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }

    private func shortcutChanged(_ shortcut: Shortcut) {
        Settings.shortcut = shortcut
        reportShortcutResult(onShortcutChange?(shortcut) ?? true)
    }

    private func reportShortcutResult(_ ok: Bool) {
        warningLabel.stringValue = ok ? "" : "Não foi possível usar este atalho: outro app já o utiliza."
        warningLabel.isHidden = ok
    }

    @objc private func chooseFolder(_ sender: Any?) {
        guard let window = window else { return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.directoryURL = Settings.saveFolder
        panel.prompt = "Escolher"
        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            Settings.saveFolder = url
            self?.updateFolderLabel()
        }
    }

    @objc private func toggleSave(_ sender: NSButton) {
        Settings.saveOnDone = (sender.state == .on)
    }

    func windowWillClose(_ notification: Notification) {
        window?.makeFirstResponder(nil)
        DispatchQueue.main.async { [weak self] in self?.onClose?() }
    }
}
