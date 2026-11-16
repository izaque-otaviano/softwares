import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem?
    private var captureMenuItem: NSMenuItem?
    private var preferences: PreferencesWindowController?
    private var overlay: CaptureOverlay?

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
        let hasWindows = preferences?.window?.isVisible ?? false
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
        fileMenu.addItem(NSMenuItem(title: "Salvar…", action: #selector(OverlayView.saveImage(_:)), keyEquivalent: "s"))
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

    /// Congela a tela onde está o mouse e abre a seleção de área.
    @objc func startCapture(_ sender: Any?) {
        guard overlay == nil else { return }
        let mouse = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main
        else { return }
        // Pequena espera para o menu da barra (se usado) sumir antes da "foto".
        let delay: TimeInterval = sender is NSMenuItem ? 0.25 : 0
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.openOverlay(on: screen, demoImage: nil)
        }
    }

    @discardableResult
    private func openOverlay(on screen: NSScreen, demoImage: NSImage?) -> CaptureOverlay? {
        guard overlay == nil else { return nil }
        guard let o = CaptureOverlay(screen: screen, demoImage: demoImage) else {
            NSSound.beep()
            return nil
        }
        o.onFinish = { [weak self] in self?.overlay = nil }
        o.onConfirm = { [weak self] rep in self?.deliver(rep) }
        o.onSaveAs = { [weak self] rep in self?.saveAs(rep) }
        o.onTextCopied = { text in
            let pb = NSPasteboard.general
            pb.clearContents()
            pb.setString(text, forType: .string)
            NSSound(named: NSSound.Name("Pop"))?.play()
            Toast.show("Texto copiado", subtitle: "Pronto para colar (⌘V)")
        }
        overlay = o
        o.show()
        return o
    }

    /// Copia para a área de transferência e salva uma cópia na pasta escolhida.
    private func deliver(_ rep: NSBitmapImageRep) {
        guard let png = rep.representation(using: .png, properties: [:]) else { NSSound.beep(); return }
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setData(png, forType: .png)
        if let tiff = rep.tiffRepresentation { pb.setData(tiff, forType: .tiff) }

        var subtitle = "Pronto para colar (⌘V)"
        if Settings.saveOnDone {
            let folder = Settings.saveFolder
            let url = folder.appendingPathComponent(Settings.newFileName())
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
                try png.write(to: url)
                subtitle = "Cópia salva em \(FileManager.default.displayName(atPath: folder.path))"
            } catch {
                subtitle = "Não foi possível salvar na pasta escolhida"
            }
        }
        NSSound(named: NSSound.Name("Pop"))?.play()
        Toast.show("Copiado", subtitle: subtitle)
    }

    private func saveAs(_ rep: NSBitmapImageRep) {
        guard let png = rep.representation(using: .png, properties: [:]) else { NSSound.beep(); return }
        NSApp.activate(ignoringOtherApps: true)
        let panel = NSSavePanel()
        panel.allowedFileTypes = ["png"]
        panel.canCreateDirectories = true
        panel.directoryURL = Settings.saveFolder
        panel.nameFieldStringValue = Settings.newFileName()
        panel.level = .modalPanel
        if panel.runModal() == .OK, let url = panel.url {
            do {
                try png.write(to: url)
                Toast.show("Salvo", subtitle: url.lastPathComponent)
            } catch {
                NSAlert(error: error).runModal()
            }
        }
    }

    // MARK: Demonstração (usada só para gerar prints automáticos no CI)

    private func runDemo(_ mode: String) {
        Settings.launchedBefore = true
        switch mode {
        case "prefs":
            showPreferences(nil)
        case "toast":
            Toast.show("Copiado", subtitle: "Cópia salva em Mesa", duration: 60)
        default:
            guard let path = ProcessInfo.processInfo.environment["RECORTE_DEMO_IMAGE"],
                  let image = NSImage(contentsOfFile: path),
                  let screen = NSScreen.main,
                  let o = openOverlay(on: screen, demoImage: image) else { return }
            let f = screen.frame
            // Seleção em volta do "painel" de exemplo (coordenadas relativas à tela).
            let sel = NSRect(x: f.width * 0.08, y: f.height * 0.2, width: f.width * 0.6, height: f.height * 0.55)
            if mode == "ocr" {
                // Área sobre o bloco de texto da imagem de exemplo.
                let textSel = NSRect(x: f.width * 0.07, y: f.height * 0.3, width: f.width * 0.62, height: f.height * 0.54)
                o.view.demo(selection: textSel, annotations: [], selecting: false, ocr: true)
                return
            }
            if mode == "select" {
                o.view.demo(selection: sel, annotations: [], selecting: true)
                return
            }
            func make(_ tool: Tool, _ color: NSColor, _ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat) -> Annotation {
                let a = Annotation(tool: tool, color: color, width: 4,
                                   start: CGPoint(x: sel.minX + sel.width * x0, y: sel.minY + sel.height * y0))
                a.end = CGPoint(x: sel.minX + sel.width * x1, y: sel.minY + sel.height * y1)
                return a
            }
            let text = Annotation(tool: .text, color: .systemRed, width: 4,
                                  start: CGPoint(x: sel.minX + sel.width * 0.3, y: sel.minY + sel.height * 0.62))
            text.text = "Olhe aqui!"
            o.view.demo(selection: sel, annotations: [
                make(.ellipse, .systemRed, 0.05, 0.55, 0.4, 0.8),
                make(.highlight, .systemYellow, 0.55, 0.2, 0.95, 0.45),
                make(.arrow, .systemRed, 0.5, 0.65, 0.65, 0.5),
                text,
            ], selecting: false)
        }
    }
}
