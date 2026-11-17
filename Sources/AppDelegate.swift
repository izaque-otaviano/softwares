import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    var statusItem: NSStatusItem?
    private var captureMenuItem: NSMenuItem?
    private var textMenuItem: NSMenuItem?
    private var recentMenu: NSMenu?
    private var countdownTimer: Timer?
    var preferences: PreferencesWindowController?
    var overlay: CaptureOverlay?
    var recordingMenuTimer: Timer?
    var statusTitleTimer: Timer?
    var statusMenu: NSMenu?
    var recordingRecentMenu: NSMenu?
    var profileMenu: NSMenu?
    var meterRows: [MeterMenuRow] = []

    // MARK: Ciclo de vida

    func applicationDidFinishLaunching(_ notification: Notification) {
        Settings.registerDefaults()
        NSApp.setActivationPolicy(.accessory)
        setUpMainMenu()
        setUpStatusItem()

        HotKeyManager.shared.onPress = { [weak self] action in
            switch action {
            case .capture: self?.startCapture(nil)
            case .copyText: self?.startTextCapture(nil)
            default: self?.handleRecordingHotKey(action)
            }
        }
        HotKeyManager.shared.installHandler()
        applyShortcut()

        setUpRecording()
        if let test = ProcessInfo.processInfo.environment["RECORTE_TEST"] {
            runRecordingTest(test)
            return
        }

        if let demo = ProcessInfo.processInfo.environment["RECORTE_DEMO"] {
            runDemo(demo)
            return
        }

        if !Settings.launchedBefore {
            Settings.launchedBefore = true
            showPreferences(nil)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.checkIncompleteRecordings() }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { showPreferences(nil) }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    /// Registra os dois atalhos globais e atualiza o menu. Retorna `false` se algum falhou.
    @discardableResult
    func applyShortcut() -> Bool {
        let capture = Settings.shortcut
        let text = Settings.textShortcut
        let ok1 = HotKeyManager.shared.register(capture, for: .capture)
        let ok2 = HotKeyManager.shared.register(text, for: .copyText)
        show(capture, in: captureMenuItem, title: "Capturar área")
        show(text, in: textMenuItem, title: "Copiar texto da tela")
        let ok3 = applyRecordingShortcuts()
        return ok1 && ok2 && ok3
    }

    func show(_ shortcut: Shortcut, in item: NSMenuItem?, title: String) {
        guard let item = item else { return }
        item.keyEquivalent = shortcut.menuKeyEquivalent
        item.keyEquivalentModifierMask = shortcut.modifiers
        item.title = item.keyEquivalent.isEmpty ? "\(title) (\(shortcut.displayString))" : title
    }

    /// Mostra o ícone no Dock enquanto houver janelas abertas, como um app normal.
    private func updateActivationPolicy() {
        refreshActivationPolicy()
    }

    func refreshActivationPolicy() {
        let hasWindows = (preferences?.window?.isVisible ?? false)
            || NSApp.windows.contains { $0.isVisible && $0.windowController is RecPreviewWindowController }
        NSApp.setActivationPolicy(hasWindows ? .regular : .accessory)
    }

    // MARK: Menus

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let url = Bundle.main.url(forResource: "MenuBarIcon", withExtension: "png"),
           let image = NSImage(contentsOf: url) {
            image.size = NSSize(width: 18, height: 18)
            image.isTemplate = true
            item.button?.image = image
        } else {
            item.button?.image = Icons.menuBar
        }
        item.button?.toolTip = "Recorte"

        let menu = NSMenu()
        let capture = NSMenuItem(title: "Capturar área", action: #selector(startCapture(_:)), keyEquivalent: "")
        capture.target = self
        menu.addItem(capture)
        captureMenuItem = capture
        let text = NSMenuItem(title: "Copiar texto da tela", action: #selector(startTextCapture(_:)), keyEquivalent: "")
        text.target = self
        menu.addItem(text)
        textMenuItem = text
        for seconds in [3, 5] {
            let delayed = NSMenuItem(title: "Capturar em \(seconds) segundos",
                                     action: #selector(startDelayedCapture(_:)), keyEquivalent: "")
            delayed.target = self
            delayed.tag = seconds
            menu.addItem(delayed)
        }
        menu.addItem(NSMenuItem.separator())
        // Gravação de tela (itens montados em menuNeedsUpdate)
        let recordingAnchor = NSMenuItem.separator()
        recordingAnchor.tag = RecordingMenu.anchorTag
        menu.addItem(recordingAnchor)
        let recentItem = NSMenuItem(title: "Capturas recentes", action: nil, keyEquivalent: "")
        let recent = NSMenu(title: "Recentes")
        recent.delegate = self
        recentItem.submenu = recent
        recentMenu = recent
        menu.addItem(recentItem)
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
        menu.delegate = self
        statusMenu = menu
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
                    HotKeyManager.shared.unregisterAll()
                } else {
                    self?.applyShortcut()
                }
            }
            p.onClose = { [weak self] in self?.updateActivationPolicy() }
            p.onRecordingShortcutsChange = { [weak self] in self?.applyShortcut() ?? false }
            preferences = p
        }
        NSApp.setActivationPolicy(.regular)
        preferences?.show()
    }

    /// Congela a tela onde está o mouse e abre a seleção de área.
    @objc func startCapture(_ sender: Any?) {
        guard overlay == nil, ensureScreenAccess() else { return }
        let mouse = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main
        else { return }
        // Pequena espera para o menu da barra (se usado) sumir antes da "foto".
        let delay: TimeInterval = sender is NSMenuItem ? 0.25 : 0
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.openOverlay(on: screen, demoImage: nil)
        }
    }

    /// No macOS 10.15+ o app precisa da permissão "Gravação de Tela". Sem ela o sistema
    /// entrega só o papel de parede (sem as janelas), e a captura, o desfoque e o
    /// reconhecimento de texto saem errados sem nenhum erro. A permissão vale para uma
    /// versão específica do app: depois de atualizar, é preciso concedê-la de novo.
    private func ensureScreenAccess() -> Bool {
        if ProcessInfo.processInfo.environment["RECORTE_DEMO"] != nil { return true }
        guard #available(macOS 10.15, *) else { return true }
        if CGPreflightScreenCaptureAccess() { return true }
        CGRequestScreenCaptureAccess() // faz o Recorte aparecer na lista dos Ajustes

        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "O Recorte precisa de permissão para ver a tela"
        alert.informativeText = [
            "Sem a permissão de Gravação de Tela, o macOS entrega só o papel de parede: "
                + "o print, o desfoque e o reconhecimento de texto saem errados.",
            "",
            "1. Abra Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela.",
            "2. Se o Recorte já estiver na lista, remova-o com o botão “−” (a permissão antiga "
                + "não vale para esta versão) e adicione de novo com “+”.",
            "3. Deixe a chave ligada, encerre o Recorte e abra-o novamente.",
            "",
            "Isso precisa ser refeito sempre que você instalar uma versão nova.",
        ].joined(separator: "\n")
        alert.addButton(withTitle: "Abrir Ajustes")
        alert.addButton(withTitle: "Encerrar o Recorte")
        alert.addButton(withTitle: "Agora não")
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
                NSWorkspace.shared.open(url)
            }
        case .alertSecondButtonReturn:
            NSApp.terminate(nil)
        default:
            break
        }
        return false
    }

    private func screenUnderMouse() -> NSScreen? {
        let mouse = NSEvent.mouseLocation
        return NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main
    }

    /// Seleciona uma área e copia o texto dela direto (OCR, sem painel).
    @objc func startTextCapture(_ sender: Any?) {
        guard overlay == nil, ensureScreenAccess(), let screen = screenUnderMouse() else { return }
        let delay: TimeInterval = sender is NSMenuItem ? 0.25 : 0
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.openOverlay(on: screen, mode: .textOnly, demoImage: nil)
        }
    }

    /// Captura com atraso (para pegar menus abertos, efeitos de "passar o mouse" etc.).
    @objc func startDelayedCapture(_ sender: NSMenuItem) {
        guard overlay == nil, countdownTimer == nil, ensureScreenAccess() else { return }
        var remaining = max(1, sender.tag)
        Toast.show("Capturando em \(remaining)…", subtitle: "Prepare a tela", duration: 0.6)
        countdownTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            remaining -= 1
            if remaining > 0 {
                Toast.show("Capturando em \(remaining)…", subtitle: "Prepare a tela", duration: 0.6)
                return
            }
            timer.invalidate()
            self?.countdownTimer = nil
            guard let self = self, let screen = self.screenUnderMouse() else { return }
            // Mostra a tela "congelada", para o menu/efeito continuar aparecendo.
            self.openOverlay(on: screen, frozen: true, demoImage: nil)
        }
    }

    @discardableResult
    private func openOverlay(on screen: NSScreen, mode: OverlayView.Mode = .normal, frozen: Bool = false,
                             demoImage: NSImage?) -> CaptureOverlay? {
        guard overlay == nil else { return nil }
        guard let o = CaptureOverlay(screen: screen, mode: mode, frozen: frozen, demoImage: demoImage) else {
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
        o.onQuickText = { outcome in
            switch outcome {
            case .text(let text) where !text.isEmpty:
                let pb = NSPasteboard.general
                pb.clearContents()
                pb.setString(text, forType: .string)
                NSSound(named: NSSound.Name("Pop"))?.play()
                let preview = text.replacingOccurrences(of: "\n", with: " ")
                Toast.show("Texto copiado", subtitle: preview.count > 60 ? String(preview.prefix(60)) + "…" : preview,
                           duration: 2.2)
            case .text:
                NSSound.beep()
                Toast.show("Nenhum texto encontrado", subtitle: "Tente selecionar uma área maior")
            case .failure(let message):
                NSSound.beep()
                Toast.show("Não foi possível reconhecer", subtitle: message, duration: 3)
            }
        }
        o.onColorCopied = { hex in
            let pb = NSPasteboard.general
            pb.clearContents()
            pb.setString(hex, forType: .string)
            NSSound(named: NSSound.Name("Pop"))?.play()
            Toast.show("Cor copiada", subtitle: hex)
        }
        let frontApp = NSWorkspace.shared.frontmostApplication.flatMap { app -> String? in
            app.processIdentifier == ProcessInfo.processInfo.processIdentifier ? nil : app.localizedName
        }
        o.onSendDesk = { rep in
            if let png = rep.representation(using: .png, properties: [:]) { History.add(png) }
            Toast.show("Enviando ao Desk…", subtitle: DeskClient.uploadURL?.host ?? "", duration: 1.5)
            DeskClient.shared.sendImage(rep, sourceApp: frontApp) { error in
                if let error = error {
                    NSSound.beep()
                    Toast.show("Não foi enviado ao Desk", subtitle: error.localizedDescription, duration: 4)
                } else {
                    NSSound(named: NSSound.Name("Pop"))?.play()
                    Toast.show("Enviado ao Desk", subtitle: DeskClient.title(kind: "Print", detail: frontApp))
                }
            }
        }
        o.onPin = { rep, frame in
            if let png = rep.representation(using: .png, properties: [:]) { History.add(png) }
            PinWindow.show(rep, at: frame)
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
        History.add(png)

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
                History.add(png)
                Toast.show("Salvo", subtitle: url.lastPathComponent)
            } catch {
                NSAlert(error: error).runModal()
            }
        }
    }

    // MARK: Recentes

    func menuNeedsUpdate(_ menu: NSMenu) {
        if updateRecordingMenus(menu) { return }
        guard menu === recentMenu else { return }
        menu.removeAllItems()
        let entries = History.entries()
        if entries.isEmpty {
            let empty = NSMenuItem(title: "Nenhuma captura ainda", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
            return
        }
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = Calendar.current.isDateInToday(entries[0].date) ? "HH:mm" : "dd/MM HH:mm"
        for e in entries {
            let size = NSImage(contentsOf: e.url).map { img -> String in
                let px = img.representations.first.map { "\($0.pixelsWide) × \($0.pixelsHigh)" }
                return px ?? ""
            } ?? ""
            let today = Calendar.current.isDateInToday(e.date)
            f.dateFormat = today ? "'Hoje,' HH:mm" : "dd/MM, HH:mm"
            let item = NSMenuItem(title: "\(f.string(from: e.date))   \(size)", action: #selector(copyRecent(_:)),
                                  keyEquivalent: "")
            item.target = self
            item.representedObject = e.url
            item.image = History.thumbnail(for: e.url)
            item.toolTip = "Clique para copiar de novo"
            menu.addItem(item)
        }
        menu.addItem(NSMenuItem.separator())
        let show = NSMenuItem(title: "Mostrar no Finder", action: #selector(showRecentFolder(_:)), keyEquivalent: "")
        show.target = self
        menu.addItem(show)
        let clear = NSMenuItem(title: "Limpar histórico", action: #selector(clearRecent(_:)), keyEquivalent: "")
        clear.target = self
        menu.addItem(clear)
    }

    @objc private func copyRecent(_ sender: NSMenuItem) {
        guard let url = sender.representedObject as? URL, History.copyToClipboard(url) else { NSSound.beep(); return }
        Toast.show("Copiado", subtitle: "Pronto para colar (⌘V)")
    }

    @objc private func showRecentFolder(_ sender: Any?) {
        NSWorkspace.shared.activateFileViewerSelecting(History.entries().map { $0.url })
    }

    @objc private func clearRecent(_ sender: Any?) {
        History.clear()
    }

    // MARK: Demonstração (usada só para gerar prints automáticos no CI)

    private func runDemo(_ mode: String) {
        Settings.launchedBefore = true
        switch mode {
        case "prefs":
            showPreferences(nil)
            return
        case "prefsrec":
            showPreferences(nil)
            preferences?.showTab(1)
            return
        case "preview":
            if let path = ProcessInfo.processInfo.environment["RECORTE_DEMO_VIDEO"] {
                RecPreviewWindowController.show(URL(fileURLWithPath: path))
            }
            return
        case "toast":
            Toast.show("Copiado", subtitle: "Cópia salva em Mesa", duration: 60)
            return
        default:
            break
        }
        // "live"/"pick": sobre a tela real (sem imagem de fundo simulada).
        let live = mode == "live" || mode == "pick"
        let path = ProcessInfo.processInfo.environment["RECORTE_DEMO_IMAGE"] ?? ""
        let image = live ? nil : NSImage(contentsOfFile: path)
        guard live || image != nil, let screen = NSScreen.main,
              let o = openOverlay(on: screen, mode: mode == "quicktext" ? .textOnly : .normal, demoImage: image)
        else { return }
        let f = screen.frame
        func r(_ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat) -> NSRect {
            return NSRect(x: f.width * x0, y: f.height * y0, width: f.width * (x1 - x0), height: f.height * (y1 - y0))
        }
        func make(_ tool: Tool, _ color: NSColor, _ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat) -> Annotation {
            let a = Annotation(tool: tool, color: color, width: 4, start: CGPoint(x: f.width * x0, y: f.height * y0))
            a.end = CGPoint(x: f.width * x1, y: f.height * y1)
            return a
        }
        let textSel = r(0.07, 0.3, 0.69, 0.84)
        switch mode {
        case "start":
            o.view.demoHover(at: NSPoint(x: f.width * 0.5, y: f.height * 0.45))
        case "pick":
            o.view.demoHover(at: NSPoint(x: f.width * 0.45, y: f.height * 0.5))
        case "ocr":
            o.view.demo(selection: textSel, annotations: [], selecting: false, ocr: true)
        case "quicktext":
            o.view.demo(selection: textSel, annotations: [], selecting: false)
        case "select":
            o.view.demo(selection: r(0.08, 0.2, 0.68, 0.75), annotations: [], selecting: true)
        case "tools":
            var list: [Annotation] = [
                make(.blur, .systemRed, 0.04, 0.71, 0.27, 0.8),
                make(.rectangle, .systemBlue, 0.035, 0.555, 0.235, 0.62),
                make(.arrow, .systemRed, 0.62, 0.42, 0.85, 0.52),
            ]
            for (i, point) in [(0.38, 0.81), (0.70, 0.81), (0.91, 0.58)].enumerated() {
                let n = Annotation(tool: .number, color: .systemRed, width: 4,
                                   start: CGPoint(x: f.width * CGFloat(point.0), y: f.height * CGFloat(point.1)))
                n.number = i + 1
                list.append(n)
            }
            o.view.demo(selection: r(0.02, 0.04, 0.98, 0.93), annotations: list, selecting: false)
            o.view.demoSelect(list[1])
        case "pin":
            o.view.demo(selection: r(0.02, 0.6, 0.68, 0.9), annotations: [
                make(.arrow, .systemRed, 0.5, 0.65, 0.4, 0.73),
            ], selecting: false)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { o.view.onPin?() }
        default:
            let sel = r(0.08, 0.2, 0.68, 0.75)
            let text = Annotation(tool: .text, color: .systemRed, width: 4,
                                  start: CGPoint(x: sel.minX + sel.width * 0.3, y: sel.minY + sel.height * 0.62))
            text.text = "Olhe aqui!"
            func rel(_ tool: Tool, _ color: NSColor, _ x0: CGFloat, _ y0: CGFloat, _ x1: CGFloat, _ y1: CGFloat) -> Annotation {
                let a = Annotation(tool: tool, color: color, width: 4,
                                   start: CGPoint(x: sel.minX + sel.width * x0, y: sel.minY + sel.height * y0))
                a.end = CGPoint(x: sel.minX + sel.width * x1, y: sel.minY + sel.height * y1)
                return a
            }
            o.view.demo(selection: sel, annotations: [
                rel(.ellipse, .systemRed, 0.05, 0.55, 0.4, 0.8),
                rel(.highlight, .systemYellow, 0.55, 0.2, 0.95, 0.45),
                rel(.arrow, .systemRed, 0.5, 0.65, 0.65, 0.5),
                text,
            ], selecting: false)
        }
    }
}
