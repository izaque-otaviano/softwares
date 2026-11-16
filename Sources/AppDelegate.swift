import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var captureMenuItem: NSMenuItem?
    private var preferences: PreferencesWindowController?
    private var editors: [EditorWindowController] = []
    private var isCapturing = false

    // MARK: Ciclo de vida

    func applicationDidFinishLaunching(_ notification: Notification) {
        Settings.registerDefaults()
        NSApp.setActivationPolicy(.accessory)
        setUpMainMenu()
        setUpStatusItem()

        HotKeyManager.shared.onPress = { [weak self] in self?.startCapture(nil) }
        HotKeyManager.shared.installHandler()
        applyShortcut()

        if let demo = ProcessInfo.processInfo.environment["RECORTE_DEMO"] {
            runDemo(demo)
            return
        }

        if !Settings.launchedBefore {
            Settings.launchedBefore = true
            showPreferences(nil)
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showPreferences(nil) }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    @discardableResult
    private func applyShortcut() -> Bool {
        let shortcut = Settings.shortcut
        let ok = HotKeyManager.shared.register(shortcut)
        if let item = captureMenuItem {
            item.keyEquivalent = shortcut.menuKeyEquivalent
            item.keyEquivalentModifierMask = shortcut.modifiers
            item.title = item.keyEquivalent.isEmpty
                ? "Capturar área (\(shortcut.displayString))"
                : "Capturar área"
        }
        return ok
    }

    /// Mostra o ícone no Dock enquanto houver janelas abertas, como um app normal.
    private func updateActivationPolicy() {
        let hasWindows = !editors.isEmpty || (preferences?.window?.isVisible ?? false)
        NSApp.setActivationPolicy(hasWindows ? .regular : .accessory)
    }

    // MARK: Menus

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.image = Icons.menuBar
        item.button?.toolTip = "Recorte"

        let menu = NSMenu()
        let capture = NSMenuItem(title: "Capturar área", action: #selector(startCapture(_:)), keyEquivalent: "")
        capture.target = self
        menu.addItem(capture)
        captureMenuItem = capture
        menu.addItem(NSMenuItem.separator())
        let prefs = NSMenuItem(title: "Preferências…", action: #selector(showPreferences(_:)), keyEquivalent: ",")
        prefs.target = self
        menu.addItem(prefs)
        let about = NSMenuItem(title: "Sobre o Recorte", action: #selector(showAbout(_:)), keyEquivalent: "")
        about.target = self
        menu.addItem(about)
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Sair do Recorte", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    /// Menu principal: necessário para ⌘C, ⌘V, ⌘Z etc. funcionarem nas janelas.
    private func setUpMainMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu(title: "Recorte")
        let about = NSMenuItem(title: "Sobre o Recorte", action: #selector(showAbout(_:)), keyEquivalent: "")
        about.target = self
        appMenu.addItem(about)
        appMenu.addItem(NSMenuItem.separator())
        let prefs = NSMenuItem(title: "Preferências…", action: #selector(showPreferences(_:)), keyEquivalent: ",")
        prefs.target = self
        appMenu.addItem(prefs)
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(NSMenuItem(title: "Ocultar Recorte", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h"))
        appMenu.addItem(NSMenuItem(title: "Sair do Recorte", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        appItem.submenu = appMenu
        main.addItem(appItem)

        let fileItem = NSMenuItem()
        let fileMenu = NSMenu(title: "Arquivo")
        let newCapture = NSMenuItem(title: "Nova Captura", action: #selector(startCapture(_:)), keyEquivalent: "n")
        newCapture.target = self
        fileMenu.addItem(newCapture)
        fileMenu.addItem(NSMenuItem(title: "Salvar…", action: #selector(EditorWindow.saveImage(_:)), keyEquivalent: "s"))
        fileMenu.addItem(NSMenuItem.separator())
        fileMenu.addItem(NSMenuItem(title: "Fechar", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w"))
        fileItem.submenu = fileMenu
        main.addItem(fileItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Editar")
        editMenu.addItem(NSMenuItem(title: "Desfazer", action: Selector(("undo:")), keyEquivalent: "z"))
        let redo = NSMenuItem(title: "Refazer", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redo)
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(NSMenuItem(title: "Recortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x"))
        editMenu.addItem(NSMenuItem(title: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c"))
        editMenu.addItem(NSMenuItem(title: "Colar", action: #selector(NSText.paste(_:)), keyEquivalent: "v"))
        editMenu.addItem(NSMenuItem(title: "Selecionar Tudo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a"))
        editItem.submenu = editMenu
        main.addItem(editItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Janela")
        windowMenu.addItem(NSMenuItem(title: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
        windowItem.submenu = windowMenu
        main.addItem(windowItem)
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }

    // MARK: Ações

    @objc func showAbout(_ sender: Any?) {
        NSApp.activate(ignoringOtherApps: true)
        NSApp.orderFrontStandardAboutPanel(nil)
    }

    @objc func showPreferences(_ sender: Any?) {
        if preferences == nil {
            let p = PreferencesWindowController()
            p.onShortcutChange = { [weak self] _ in
                return self?.applyShortcut() ?? false
            }
            p.onRecordingChange = { [weak self] recording in
                // Enquanto o usuário grava um atalho, o atual não deve disparar.
                if recording {
                    HotKeyManager.shared.unregister()
                } else {
                    self?.applyShortcut()
                }
            }
            p.onClose = { [weak self] in self?.updateActivationPolicy() }
            preferences = p
        }
        NSApp.setActivationPolicy(.regular)
        preferences?.show()
    }

    /// Usa o `screencapture` do próprio macOS para a seleção interativa da área
    /// (mesma experiência do ⇧⌘4: arraste para selecionar, Espaço para janela,
    /// Esc para cancelar) e depois abre o editor de marcações.
    @objc func startCapture(_ sender: Any?) {
        guard !isCapturing else { return }
        isCapturing = true

        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("recorte-\(UUID().uuidString).png")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = ["-i", "-t", "png", url.path]
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                self?.isCapturing = false
                self?.captureFinished(at: url)
            }
        }
        do {
            try process.run()
        } catch {
            isCapturing = false
            let alert = NSAlert(error: error)
            alert.runModal()
        }
    }

    private func captureFinished(at url: URL) {
        defer { try? FileManager.default.removeItem(at: url) }
        guard let data = try? Data(contentsOf: url), let image = NSImage(data: data) else {
            return // usuário cancelou (Esc)
        }
        let editor = EditorWindowController(image: image)
        editor.onClose = { [weak self] e in
            self?.editors.removeAll(where: { $0 === e })
            DispatchQueue.main.async { self?.updateActivationPolicy() }
        }
        editors.append(editor)
        NSApp.setActivationPolicy(.regular)
        editor.show()
    }

    // MARK: Demonstração (usada só para gerar prints automáticos no CI)

    private func runDemo(_ mode: String) {
        Settings.launchedBefore = true
        if mode == "prefs" {
            showPreferences(nil)
            return
        }
        guard let path = ProcessInfo.processInfo.environment["RECORTE_DEMO_IMAGE"],
              let image = NSImage(contentsOfFile: path) else { return }
        if let rep = image.representations.first {
            image.size = NSSize(width: CGFloat(rep.pixelsWide) / 2, height: CGFloat(rep.pixelsHigh) / 2)
        }
        let editor = EditorWindowController(image: image)
        let c = editor.canvas
        func make(_ tool: Tool, _ color: NSColor, _ w: CGFloat, _ a: CGPoint, _ b: CGPoint) -> Annotation {
            let x = Annotation(tool: tool, color: color, width: w, start: a)
            x.end = b
            return x
        }
        c.add(make(.highlight, .systemYellow, 4, CGPoint(x: 536, y: 340), CGPoint(x: 776, y: 435)))
        c.add(make(.ellipse, .systemRed, 4, CGPoint(x: 26, y: 350), CGPoint(x: 214, y: 408)))
        c.add(make(.rectangle, .systemBlue, 4, CGPoint(x: 30, y: 282), CGPoint(x: 185, y: 313)))
        c.add(make(.arrow, .systemRed, 4, CGPoint(x: 590, y: 215), CGPoint(x: 700, y: 262)))
        let t = Annotation(tool: .text, color: .systemRed, width: 4, start: CGPoint(x: 330, y: 196))
        t.text = "Recorde em dezembro!"
        c.add(t)
        editors.append(editor)
        NSApp.setActivationPolicy(.regular)
        editor.show()
    }
}
