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
    private let captureScroll = NSScrollView()
    private let paneTitle = NSTextField(labelWithString: "")
    private let paneSubtitle = NSTextField(labelWithString: "")
    private var sidebar: PrefsSidebar?
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
        NSLayoutConstraint.activate([
            recView.topAnchor.constraint(equalTo: doc.topAnchor),
            recView.leadingAnchor.constraint(equalTo: doc.leadingAnchor),
            recView.trailingAnchor.constraint(equalTo: doc.trailingAnchor),
            recView.bottomAnchor.constraint(equalTo: doc.bottomAnchor),
            doc.topAnchor.constraint(equalTo: recScroll.contentView.topAnchor),
            doc.leadingAnchor.constraint(equalTo: recScroll.contentView.leadingAnchor),
            doc.widthAnchor.constraint(equalTo: recScroll.contentView.widthAnchor),
        ])
        capturePane = [card, footer]

        deskView.translatesAutoresizingMaskIntoConstraints = false
        deskView.isHidden = true
        // Layout no estilo dos Ajustes do Sistema: barra lateral + conteúdo.
        _ = header
        tabs.isHidden = true
        let sidebar = PrefsSidebar(items: [
            ("Captura", RecTheme.symbol("viewfinder", fallback: Icons.menuBar), NSColor.systemBlue),
            ("Gravação de tela", RecTheme.symbol("record.circle", fallback: RecIcons.stop), RecTheme.record),
            ("Convertize Desk", RecTheme.symbol("paperplane", fallback: Icons.upload),
             NSColor(calibratedRed: 0x1B / 255, green: 0x20 / 255, blue: 0x30 / 255, alpha: 1)),
        ])
        sidebar.onSelect = { [weak self] i in self?.showTab(i) }
        self.sidebar = sidebar
        sidebar.translatesAutoresizingMaskIntoConstraints = false

        paneTitle.font = NSFont.systemFont(ofSize: 17, weight: .semibold)
        paneSubtitle.font = NSFont.systemFont(ofSize: 12)
        paneSubtitle.textColor = .secondaryLabelColor

        // Conteúdo de "Captura" com rolagem, como as outras seções.
        let captureStack = NSStackView(views: [card, footer])
        captureStack.orientation = .vertical
        captureStack.alignment = .leading
        captureStack.spacing = 16
        captureStack.translatesAutoresizingMaskIntoConstraints = false
        let captureDoc = FlippedView()
        captureDoc.translatesAutoresizingMaskIntoConstraints = false
        captureDoc.addSubview(captureStack)
        captureScroll.documentView = captureDoc
        captureScroll.drawsBackground = false
        captureScroll.hasVerticalScroller = true
        captureScroll.autohidesScrollers = true
        captureScroll.translatesAutoresizingMaskIntoConstraints = false
        capturePane = [captureScroll]

        let content = NSView()
        content.translatesAutoresizingMaskIntoConstraints = false
        content.wantsLayer = true
        for v in [paneTitle, paneSubtitle, captureScroll, recScroll, deskView] as [NSView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(v)
        }
        let contentBG = NSVisualEffectView()
        contentBG.material = .windowBackground
        contentBG.blendingMode = .behindWindow
        contentBG.state = .followsWindowActiveState
        contentBG.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(sidebar)
        background.addSubview(contentBG)
        background.addSubview(content)

        let paneWidth: CGFloat = 452
        NSLayoutConstraint.activate([
            sidebar.topAnchor.constraint(equalTo: background.topAnchor),
            sidebar.bottomAnchor.constraint(equalTo: background.bottomAnchor),
            sidebar.leadingAnchor.constraint(equalTo: background.leadingAnchor),
            sidebar.widthAnchor.constraint(equalToConstant: 190),
            contentBG.topAnchor.constraint(equalTo: background.topAnchor),
            contentBG.bottomAnchor.constraint(equalTo: background.bottomAnchor),
            contentBG.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor),
            contentBG.trailingAnchor.constraint(equalTo: background.trailingAnchor),
            content.topAnchor.constraint(equalTo: background.topAnchor, constant: 38),
            content.bottomAnchor.constraint(equalTo: background.bottomAnchor, constant: -20),
            content.leadingAnchor.constraint(equalTo: sidebar.trailingAnchor, constant: 24),
            content.trailingAnchor.constraint(equalTo: background.trailingAnchor, constant: -20),
            content.widthAnchor.constraint(equalToConstant: paneWidth),
            background.heightAnchor.constraint(equalToConstant: 560),
            paneTitle.topAnchor.constraint(equalTo: content.topAnchor),
            paneTitle.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            paneSubtitle.topAnchor.constraint(equalTo: paneTitle.bottomAnchor, constant: 2),
            paneSubtitle.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            paneSubtitle.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor),
            captureStack.topAnchor.constraint(equalTo: captureDoc.topAnchor),
            captureStack.leadingAnchor.constraint(equalTo: captureDoc.leadingAnchor),
            captureStack.trailingAnchor.constraint(equalTo: captureDoc.trailingAnchor),
            captureStack.bottomAnchor.constraint(equalTo: captureDoc.bottomAnchor),
            captureDoc.topAnchor.constraint(equalTo: captureScroll.contentView.topAnchor),
            captureDoc.leadingAnchor.constraint(equalTo: captureScroll.contentView.leadingAnchor),
            captureDoc.widthAnchor.constraint(equalTo: captureScroll.contentView.widthAnchor),
            card.widthAnchor.constraint(equalTo: captureStack.widthAnchor),
        ])
        for v in [captureScroll, recScroll, deskView] as [NSView] {
            NSLayoutConstraint.activate([
                v.topAnchor.constraint(equalTo: paneSubtitle.bottomAnchor, constant: 16),
                v.leadingAnchor.constraint(equalTo: content.leadingAnchor),
                v.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            ])
        }
        captureScroll.bottomAnchor.constraint(equalTo: content.bottomAnchor).isActive = true
        recScroll.bottomAnchor.constraint(equalTo: content.bottomAnchor).isActive = true
        deskView.bottomAnchor.constraint(equalTo: content.bottomAnchor).isActive = true
        // A altura fixa antiga da rolagem dá lugar à altura da janela.
        for c in recScroll.constraints where c.firstAttribute == .height { c.isActive = false }

        background.layoutSubtreeIfNeeded()
        window.setContentSize(NSSize(width: 190 + 24 + paneWidth + 20, height: 560))
        showTab(0)
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
        tabs.selectedSegment = index
        sidebar?.select(index)
        let titles = [
            ("Captura", "Atalhos, pasta das capturas e como usar as ferramentas de marcação."),
            ("Gravação de tela", "Perfis, área, áudio, qualidade, webcam e atalhos do gravador."),
            ("Convertize Desk", "Conta da equipe, endereço do Desk e formato dos arquivos enviados."),
        ]
        paneTitle.stringValue = titles[index].0
        paneSubtitle.stringValue = titles[index].1
        captureScroll.isHidden = index != 0
        recScroll.isHidden = index != 1
        deskView.isHidden = index != 2
        if index == 1 { recView.activate() } else { recView.deactivate() }
        if index == 2 { deskView.refresh() }
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

/// Barra lateral das Preferências (estilo Ajustes do Sistema): ícone do app e seções
/// com ícones em quadradinhos coloridos.
final class PrefsSidebar: NSVisualEffectView {
    var onSelect: ((Int) -> Void)?
    private var rows: [SidebarRow] = []

    init(items: [(String, NSImage, NSColor)]) {
        super.init(frame: .zero)
        material = .sidebar
        blendingMode = .behindWindow
        state = .followsWindowActiveState

        let icon = NSImageView(image: NSApp.applicationIconImage)
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 36).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 36).isActive = true
        let name = NSTextField(labelWithString: "Recorte")
        name.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        let version = NSTextField(labelWithString: "Versão " + ((Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"))
        version.font = NSFont.systemFont(ofSize: 11)
        version.textColor = .secondaryLabelColor
        let names = NSStackView(views: [name, version])
        names.orientation = .vertical
        names.alignment = .leading
        names.spacing = 0
        let head = NSStackView(views: [icon, names])
        head.orientation = .horizontal
        head.spacing = 10

        var views: [NSView] = [head]
        for (i, item) in items.enumerated() {
            let row = SidebarRow(title: item.0, image: item.1, color: item.2)
            row.onClick = { [weak self] in
                self?.select(i)
                self?.onSelect?(i)
            }
            rows.append(row)
            views.append(row)
        }
        let stack = NSStackView(views: views)
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 2
        stack.setCustomSpacing(22, after: head)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: topAnchor, constant: 46),
            stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 12),
            stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -12),
        ])
        for r in rows { r.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    func select(_ index: Int) {
        for (i, r) in rows.enumerated() { r.isSelected = i == index }
    }
}

private final class SidebarRow: NSView {
    var onClick: (() -> Void)?
    var isSelected = false { didSet { needsDisplay = true } }
    private let title: String
    private let image: NSImage
    private let color: NSColor

    init(title: String, image: NSImage, color: NSColor) {
        self.title = title
        self.image = image
        self.color = color
        super.init(frame: .zero)
        translatesAutoresizingMaskIntoConstraints = false
        heightAnchor.constraint(equalToConstant: 28).isActive = true
        setAccessibilityRole(.button)
        setAccessibilityLabel(title)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override func mouseDown(with event: NSEvent) { onClick?() }

    override func draw(_ dirtyRect: NSRect) {
        if isSelected {
            NSColor.controlAccentColor.withAlphaComponent(0.85).setFill()
            NSBezierPath(roundedRect: bounds, xRadius: 7, yRadius: 7).fill()
        }
        let tile = NSRect(x: 8, y: bounds.midY - 10, width: 20, height: 20)
        color.setFill()
        NSBezierPath(roundedRect: tile, xRadius: 6, yRadius: 6).fill()
        Icons.drawTinted(image, in: tile.insetBy(dx: 3.5, dy: 3.5), color: .white)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 13, weight: isSelected ? .medium : .regular),
            .foregroundColor: isSelected ? NSColor.white : NSColor.labelColor,
        ]
        let size = (title as NSString).size(withAttributes: attrs)
        (title as NSString).draw(at: NSPoint(x: tile.maxX + 10, y: bounds.midY - size.height / 2), withAttributes: attrs)
    }
}
