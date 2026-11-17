import Cocoa
import AVFoundation

enum RecordingMenu {
    static let anchorTag = 7000
    static let itemTag = 7001
}

/// Linha do menu da barra com o nome da fonte e o medidor de nível.
final class MeterMenuRow: NSView {
    let kind: AudioKind
    let meter = LevelMeterView()

    init(kind: AudioKind) {
        self.kind = kind
        super.init(frame: NSRect(x: 0, y: 0, width: 250, height: 22))
        let label = NSTextField(labelWithString: kind.title)
        label.font = NSFont.menuFont(ofSize: 12)
        label.textColor = .secondaryLabelColor
        label.frame = NSRect(x: 20, y: 3, width: 90, height: 16)
        meter.frame = NSRect(x: 110, y: 7, width: 120, height: 8)
        addSubview(label)
        addSubview(meter)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }
}

extension AppDelegate {
    // MARK: Configuração

    func setUpRecording() {
        Recorder.shared.onChange = { [weak self] in self?.recordingStateChanged() }
        Recorder.shared.onFinished = { url in RecPreviewWindowController.show(url) }
    }

    func applyRecordingShortcuts() -> Bool {
        var ok = true
        for s in RecShortcut.allCases {
            if !HotKeyManager.shared.register(RecSettings.shortcut(s), for: s.hotKeyAction) { ok = false }
        }
        return ok
    }

    func handleRecordingHotKey(_ action: HotKeyManager.Action) {
        let r = Recorder.shared
        switch action {
        case .recordToggle: toggleRecording(nil)
        case .recordLastArea: if r.isBusy { r.stop() } else { recordLastArea(nil) }
        case .recordPause: r.togglePause()
        case .recordMarker: r.addMarker()
        case .recordWebcam: r.toggleWebcam()
        default: break
        }
    }

    private func mouseScreen() -> NSScreen? {
        let mouse = NSEvent.mouseLocation
        return NSScreen.screens.first(where: { NSMouseInRect(mouse, $0.frame, false) }) ?? NSScreen.main
    }

    // MARK: Ações

    /// Inicia (pelo modo de área do perfil atual) ou para a gravação.
    @objc func toggleRecording(_ sender: Any?) {
        let r = Recorder.shared
        if r.state == .recording || r.state == .paused || r.state == .countdown {
            r.stop()
            return
        }
        guard r.state == .idle, overlay == nil else { return }
        let profile = RecSettings.current
        let delay: TimeInterval = sender is NSMenuItem ? 0.25 : 0
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self = self else { return }
            switch profile.areaMode {
            case .fullScreen:
                let chosen = profile.displayID.flatMap { id in NSScreen.screens.first { $0.displayID == id } }
                guard let screen = chosen ?? self.mouseScreen() else { return }
                if profile.displayID != nil && chosen == nil {
                    Toast.show("A tela escolhida no perfil não está conectada", subtitle: "Gravando a tela atual.")
                }
                r.start(screen: screen, rect: NSRect(origin: .zero, size: screen.frame.size), profile: profile)
            case .lastArea:
                self.recordLastArea(nil)
            case .select:
                self.selectRecordingArea()
            }
        }
    }

    @objc func recordLastArea(_ sender: Any?) {
        guard Recorder.shared.state == .idle else { return }
        if let last = RecSettings.lastArea, let screen = last.validScreen() {
            Recorder.shared.start(screen: screen, rect: last.rect)
        } else {
            Toast.show("Selecione a área a gravar",
                       subtitle: RecSettings.lastArea == nil ? "Ainda não há uma última área."
                                                             : "A última área não está mais disponível.",
                       duration: 2.5)
            selectRecordingArea()
        }
    }

    /// Reaproveita o seletor de área das capturas.
    func selectRecordingArea() {
        guard overlay == nil, let screen = mouseScreen() else { return }
        guard let o = CaptureOverlay(screen: screen, mode: .recordArea) else {
            NSSound.beep()
            return
        }
        o.onFinish = { [weak self] in self?.overlay = nil }
        o.onAreaChosen = { screen, rect in
            DispatchQueue.main.async { Recorder.shared.start(screen: screen, rect: rect) }
        }
        overlay = o
        o.show()
    }

    @objc func pauseOrResumeRecording(_ sender: Any?) { Recorder.shared.togglePause() }
    @objc func addRecordingMarker(_ sender: Any?) { Recorder.shared.addMarker() }
    @objc func toggleRecordingWebcam(_ sender: Any?) { Recorder.shared.toggleWebcam() }
    @objc func stopRecording(_ sender: Any?) { Recorder.shared.stop() }

    @objc func chooseRecordingProfile(_ sender: NSMenuItem) {
        RecSettings.currentProfileName = sender.title
        Toast.show("Perfil de gravação: \(sender.title)", subtitle: RecSettings.current.areaMode.title)
    }

    @objc func showRecordingPreferences(_ sender: Any?) {
        showPreferences(nil)
        preferences?.showTab(1)
    }

    @objc func openRecording(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        RecPreviewWindowController.show(URL(fileURLWithPath: path))
    }

    @objc func showRecordingsFolder(_ sender: Any?) {
        let folder = RecSettings.current.outputFolderURL
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        NSWorkspace.shared.open(folder)
    }

    @objc func recoverIncomplete(_ sender: Any?) {
        checkIncompleteRecordings(force: true)
    }

    // MARK: Recuperação

    func checkIncompleteRecordings(force: Bool = false) {
        guard !Recorder.shared.isBusy else { return }
        let pending = RecSessionStore.incomplete(excluding: nil)
        guard !pending.isEmpty else {
            if force { Toast.show("Nenhuma gravação incompleta", subtitle: "Está tudo salvo.") }
            return
        }
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "dd/MM 'às' HH:mm"
        for store in pending {
            NSApp.activate(ignoringOtherApps: true)
            let a = NSAlert()
            a.messageText = "Gravação incompleta encontrada"
            let seconds = store.totalRecorded
            let amount = seconds > 0 ? " (cerca de \(Recorder.format(seconds)) gravados)" : ""
            a.informativeText = "A gravação de \(f.string(from: store.manifest.createdAt))\(amount) não foi finalizada. "
                + "Deseja recuperar o que foi gravado?"
            a.addButton(withTitle: "Recuperar")
            a.addButton(withTitle: "Descartar")
            a.addButton(withTitle: "Depois")
            switch a.runModal() {
            case .alertFirstButtonReturn:
                Recorder.shared.recover(store) { url in
                    if let url = url { RecPreviewWindowController.show(url) }
                }
                return // uma de cada vez
            case .alertSecondButtonReturn:
                let confirm = NSAlert()
                confirm.messageText = "Descartar esta gravação?"
                confirm.informativeText = "Os trechos gravados serão apagados definitivamente."
                confirm.addButton(withTitle: "Descartar")
                confirm.addButton(withTitle: "Cancelar")
                if confirm.runModal() == .alertFirstButtonReturn { store.remove() }
            default:
                return
            }
        }
    }

    // MARK: Barra de menus

    func recordingStateChanged() {
        let r = Recorder.shared
        statusTitleTimer?.invalidate()
        statusTitleTimer = nil
        if r.isBusy {
            updateStatusTitle()
            let t = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.updateStatusTitle() }
            RunLoop.main.add(t, forMode: .common)
            statusTitleTimer = t
        } else {
            statusItem?.button?.attributedTitle = NSAttributedString(string: "")
            statusItem?.button?.title = ""
        }
    }

    private func updateStatusTitle() {
        let r = Recorder.shared
        let text: String
        var color = NSColor.systemRed
        switch r.state {
        case .countdown: text = " ● …"
        case .recording: text = " ● \(Recorder.format(r.elapsed))"
        case .paused: text = " ❚❚ \(Recorder.format(r.elapsed))"; color = .systemOrange
        case .finishing: text = " Salvando…"; color = .secondaryLabelColor
        case .idle: text = ""
        }
        statusItem?.button?.imagePosition = .imageLeft
        statusItem?.button?.attributedTitle = NSAttributedString(string: text, attributes: [
            .foregroundColor: color,
            .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold),
        ])
    }

    /// Monta os itens de gravação do menu da barra. Retorna true se o menu era de gravação.
    func updateRecordingMenus(_ menu: NSMenu) -> Bool {
        if menu === statusMenu {
            rebuildRecordingSection(menu)
            return true
        }
        if menu === profileMenu {
            menu.removeAllItems()
            for name in RecProfile.names {
                let item = NSMenuItem(title: name, action: #selector(chooseRecordingProfile(_:)), keyEquivalent: "")
                item.target = self
                item.state = name == RecSettings.currentProfileName ? .on : .off
                menu.addItem(item)
            }
            menu.addItem(NSMenuItem.separator())
            let edit = NSMenuItem(title: "Editar perfis…", action: #selector(showRecordingPreferences(_:)), keyEquivalent: "")
            edit.target = self
            menu.addItem(edit)
            return true
        }
        if menu === recordingRecentMenu {
            menu.removeAllItems()
            let items = RecLibrary.items()
            if items.isEmpty {
                let empty = NSMenuItem(title: "Nenhuma gravação ainda", action: nil, keyEquivalent: "")
                empty.isEnabled = false
                menu.addItem(empty)
            }
            let f = DateFormatter()
            f.locale = Locale(identifier: "pt_BR")
            f.dateFormat = "dd/MM HH:mm"
            for item in items.prefix(10) {
                let name = URL(fileURLWithPath: item.path).deletingPathExtension().lastPathComponent
                let m = NSMenuItem(title: "\(f.string(from: item.date))  ·  \(Recorder.format(item.duration))  ·  \(name)",
                                   action: #selector(openRecording(_:)), keyEquivalent: "")
                m.target = self
                m.representedObject = item.path
                menu.addItem(m)
            }
            menu.addItem(NSMenuItem.separator())
            let folder = NSMenuItem(title: "Abrir pasta das gravações", action: #selector(showRecordingsFolder(_:)),
                                    keyEquivalent: "")
            folder.target = self
            menu.addItem(folder)
            return true
        }
        return false
    }

    private func rebuildRecordingSection(_ menu: NSMenu) {
        for item in menu.items where item.tag == RecordingMenu.itemTag { menu.removeItem(item) }
        guard let anchor = menu.items.firstIndex(where: { $0.tag == RecordingMenu.anchorTag }) else { return }
        var index = anchor + 1
        func add(_ item: NSMenuItem) {
            item.tag = RecordingMenu.itemTag
            menu.insertItem(item, at: index)
            index += 1
        }
        func action(_ title: String, _ selector: Selector, _ shortcut: RecShortcut?) -> NSMenuItem {
            let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
            item.target = self
            if let s = shortcut { show(RecSettings.shortcut(s), in: item, title: title) }
            return item
        }
        let r = Recorder.shared
        meterRows = []
        if r.isBusy {
            let header = NSMenuItem(title: recordingHeader(), action: nil, keyEquivalent: "")
            header.isEnabled = false
            add(header)
            if r.state == .recording || r.state == .paused {
                for kind in [AudioKind.system, .mic] where (kind == .system ? r.hasSystemAudio : r.hasMicrophone) {
                    let row = NSMenuItem()
                    let view = MeterMenuRow(kind: kind)
                    row.view = view
                    meterRows.append(view)
                    add(row)
                }
                add(action(r.state == .paused ? "Retomar" : "Pausar", #selector(pauseOrResumeRecording(_:)), .pause))
                add(action("Adicionar marcador", #selector(addRecordingMarker(_:)), .marker))
                if r.webcamActive {
                    add(action(r.webcamVisible ? "Ocultar webcam" : "Mostrar webcam",
                               #selector(toggleRecordingWebcam(_:)), .webcam))
                }
                add(action("Parar e salvar", #selector(stopRecording(_:)), .toggle))
            } else if r.state == .countdown {
                add(action("Cancelar contagem", #selector(stopRecording(_:)), nil))
            }
            let sep = NSMenuItem.separator()
            add(sep)
            startMenuTimer()
            return
        }
        add(action("Gravar tela — \(RecSettings.currentProfileName)", #selector(toggleRecording(_:)), .toggle))
        add(action("Gravar última área", #selector(recordLastArea(_:)), .lastArea))
        let profileItem = NSMenuItem(title: "Perfil de gravação", action: nil, keyEquivalent: "")
        let pm = profileMenu ?? NSMenu(title: "Perfil de gravação")
        pm.delegate = self
        profileMenu = pm
        profileItem.submenu = pm
        add(profileItem)
        let recentItem = NSMenuItem(title: "Gravações recentes", action: nil, keyEquivalent: "")
        let rm = recordingRecentMenu ?? NSMenu(title: "Gravações recentes")
        rm.delegate = self
        recordingRecentMenu = rm
        recentItem.submenu = rm
        add(recentItem)
        let pending = RecSessionStore.incomplete(excluding: nil).count
        if pending > 0 {
            add(action("Recuperar gravação incompleta (\(pending))…", #selector(recoverIncomplete(_:)), nil))
        }
        add(action("Preferências de gravação…", #selector(showRecordingPreferences(_:)), nil))
        add(NSMenuItem.separator())
    }

    private func recordingHeader() -> String {
        let r = Recorder.shared
        switch r.state {
        case .recording: return "● Gravando — \(Recorder.format(r.elapsed))"
        case .paused: return "❚❚ Pausado — \(Recorder.format(r.elapsed))"
        case .countdown: return "Contagem regressiva…"
        case .finishing: return "Finalizando o vídeo…"
        case .idle: return ""
        }
    }

    private func startMenuTimer() {
        recordingMenuTimer?.invalidate()
        let t = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let menu = self.statusMenu else { return }
            let r = Recorder.shared
            for row in self.meterRows { row.meter.value = r.level(row.kind) }
            if let header = menu.items.first(where: { $0.tag == RecordingMenu.itemTag }) {
                header.title = self.recordingHeader()
            }
        }
        RunLoop.main.add(t, forMode: .common)
        recordingMenuTimer = t
    }

    func menuDidClose(_ menu: NSMenu) {
        if menu === statusMenu {
            recordingMenuTimer?.invalidate()
            recordingMenuTimer = nil
        }
    }
}
