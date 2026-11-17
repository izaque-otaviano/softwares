import Cocoa

final class PreferencesWindowController: NSWindowController, NSWindowDelegate {
    /// Chamado quando o usuário escolhe um novo atalho. Retorna `false` se não
    /// foi possível registrá-lo.
    var onShortcutChange: ((Shortcut) -> Bool)?
    var onRecordingChange: ((Bool) -> Void)?
    var onClose: (() -> Void)?

    private let recorder = ShortcutRecorderView(frame: .zero)
    private let textRecorder = ShortcutRecorderView(frame: .zero)
    private let recView = RecPrefsView()
    private let recScroll = NSScrollView()
    private var capturePane: [NSView] = []
    private let deskView = DeskPrefsView()
    private let tabs = NSSegmentedControl(labels: ["Captura", "Gravação de tela", "Convertize Desk"], trackingMode: .selectOne,
                                          target: nil, action: nil)
    /// Atalhos de gravação mudaram (o app registra de novo).
    var onRecordingShortcutsChange: (() -> Bool)? {
        get { return recView.onShortcutsChanged }
        set { recView.onShortcutsChanged = newValue }
    }
    private let warningLabel = NSTextField(labelWithString: "")
    private let folderLabel = NSTextField(labelWithString: "")
    private let saveCheckbox = NSButton(checkboxWithTitle: "Salvar uma cópia aqui ao dar OK",
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
            if let other = RecSettings.conflict(for: s, except: "Copiar texto da tela") {
                self?.textRecorder.shortcut = Settings.textShortcut
                self?.warningLabel.stringValue = "\(s.displayString) já é usado em “\(other)”."
                self?.warningLabel.isHidden = false
                return
            }
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
                              + "P caneta · T texto · N números · B desfocar · E extrair texto (⇧E copia direto) · "
                              + "F fixar na tela · ⇧ formas perfeitas · Esc cancela.", width: 452)

        // Aba de gravação, com rolagem.
        tabs.selectedSegment = 0
        tabs.target = self
        tabs.action = #selector(tabChanged)
        recView.onRecordingShortcut = { [weak self] r in self?.onRecordingChange?(r) }
        recView.translatesAutoresizingMaskIntoConstraints = false
        let doc = FlippedView()
        doc.translatesAutoresizingMaskIntoConstraints = false
        doc.addSubview(recView)
        recScroll.documentView = doc
        recScroll.drawsBackground = false
        recScroll.hasVerticalScroller = true
        recScroll.autohidesScrollers = true
        recScroll.translatesAutoresizingMaskIntoConstraints = false
        recScroll.isHidden = true
        let visibleHeight = min(640, (NSScreen.main?.visibleFrame.height ?? 800) - 220)
        NSLayoutConstraint.activate([
            recView.topAnchor.constraint(equalTo: doc.topAnchor),
            recView.leadingAnchor.constraint(equalTo: doc.leadingAnchor),
            recView.trailingAnchor.constraint(equalTo: doc.trailingAnchor),
            recView.bottomAnchor.constraint(equalTo: doc.bottomAnchor),
            doc.topAnchor.constraint(equalTo: recScroll.contentView.topAnchor),
            doc.leadingAnchor.constraint(equalTo: recScroll.contentView.leadingAnchor),
            doc.widthAnchor.constraint(equalTo: recScroll.contentView.widthAnchor),
            recScroll.heightAnchor.constraint(equalToConstant: visibleHeight),
        ])
        capturePane = [card, footer]

        deskView.translatesAutoresizingMaskIntoConstraints = false
        deskView.isHidden = true
        let root = NSStackView(views: [header, tabs, card, footer, recScroll, deskView])
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
            recScroll.widthAnchor.constraint(equalTo: root.widthAnchor),
            deskView.widthAnchor.constraint(equalTo: root.widthAnchor),
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

    @objc private func tabChanged() {
        showTab(tabs.selectedSegment)
    }

    /// 0 = Captura, 1 = Gravação de tela.
    func showTab(_ index: Int) {
        guard let window = window, let content = window.contentView else { return }
        tabs.selectedSegment = index
        let recording = index == 1
        for v in capturePane { v.isHidden = index != 0 }
        recScroll.isHidden = !recording
        deskView.isHidden = index != 2
        if index == 2 { deskView.refresh() }
        if recording { recView.activate() } else { recView.deactivate() }
        content.layoutSubtreeIfNeeded()
        let size = content.fittingSize
        let top = window.frame.maxY
        var frame = window.frameRect(forContentRect: NSRect(origin: .zero, size: size))
        frame.origin = NSPoint(x: window.frame.minX, y: top - frame.height)
        window.setFrame(frame, display: true, animate: window.isVisible)
    }

    private func shortcutChanged(_ shortcut: Shortcut) {
        if let other = RecSettings.conflict(for: shortcut, except: "Capturar área") {
            recorder.shortcut = Settings.shortcut
            warningLabel.stringValue = "\(shortcut.displayString) já é usado em “\(other)”."
            warningLabel.isHidden = false
            return
        }
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
        recView.deactivate()
        window?.makeFirstResponder(nil)
        DispatchQueue.main.async { [weak self] in self?.onClose?() }
    }
}

/// Visão com origem no topo (para o conteúdo rolável começar de cima).
final class FlippedView: NSView {
    override var isFlipped: Bool { return true }
}
