import Cocoa
import AVFoundation

/// Aba "Gravação" das Preferências: perfis, área, áudio (com medidores e teste),
/// qualidade, pasta, opções visuais e atalhos.
final class RecPrefsView: NSView {
    /// Atalhos mudaram (o app registra de novo). Retorna false se algum falhou.
    var onShortcutsChanged: (() -> Bool)?
    var onRecordingShortcut: ((Bool) -> Void)?

    private var profile = RecSettings.current
    private let monitor = AudioMonitor()
    private var meterTimer: Timer?
    private var testing = false

    private let profilePopup = NSPopUpButton()
    private let areaPopup = NSPopUpButton()
    private let screenPopup = NSPopUpButton()
    private let systemCheck = NSButton(checkboxWithTitle: "Som do Mac", target: nil, action: nil)
    private let systemMeter = LevelMeterView()
    private let systemSlider = NSSlider(value: 1, minValue: 0, maxValue: 1.5, target: nil, action: nil)
    private let systemStatus = NSTextField(wrappingLabelWithString: "")
    private let micCheck = NSButton(checkboxWithTitle: "Microfone", target: nil, action: nil)
    private let micPopup = NSPopUpButton()
    private let micMeter = LevelMeterView()
    private let micSlider = NSSlider(value: 1, minValue: 0, maxValue: 1.5, target: nil, action: nil)
    private let testButton = NSButton(title: "Testar áudio (5 s)", target: nil, action: nil)
    private let testStatus = NSTextField(labelWithString: "")
    private let videoPopup = NSPopUpButton()
    private let effectiveLabel = NSTextField(labelWithString: "")
    private let audioPopup = NSPopUpButton()
    private let folderLabel = NSTextField(labelWithString: "")
    private let folderWarning = NSTextField(labelWithString: "")
    private let countdownCheck = NSButton(checkboxWithTitle: "Contagem regressiva de 3 segundos (Esc cancela)", target: nil, action: nil)
    private let clicksCheck = NSButton(checkboxWithTitle: "Destacar cliques no vídeo", target: nil, action: nil)
    private let webcamCheck = NSButton(checkboxWithTitle: "Sobrepor webcam", target: nil, action: nil)
    private let cameraPopup = NSPopUpButton()
    private let positionPopup = NSPopUpButton()
    private let sizePopup = NSPopUpButton()
    private var recorders: [RecShortcut: ShortcutRecorderView] = [:]
    private let shortcutWarning = NSTextField(wrappingLabelWithString: "")

    init() {
        super.init(frame: .zero)
        build()
        load()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    // MARK: Layout

    private func label(_ text: String) -> NSTextField {
        let l = NSTextField(labelWithString: text)
        l.alignment = .right
        return l
    }

    private func small(_ field: NSTextField, width: CGFloat = 250) {
        field.font = NSFont.systemFont(ofSize: 11)
        field.textColor = .secondaryLabelColor
        field.preferredMaxLayoutWidth = width
    }

    private func section(_ title: String) -> NSTextField {
        let l = NSTextField(labelWithString: title)
        l.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        l.textColor = .secondaryLabelColor
        return l
    }

    private func row(_ views: [NSView], spacing: CGFloat = 8) -> NSStackView {
        let s = NSStackView(views: views)
        s.orientation = .horizontal
        s.spacing = spacing
        s.alignment = .centerY
        return s
    }

    private func build() {
        for name in RecProfile.names { profilePopup.addItem(withTitle: name) }
        profilePopup.target = self
        profilePopup.action = #selector(profileChosen)
        let reset = NSButton(title: "Restaurar padrão", target: self, action: #selector(resetProfile))
        reset.bezelStyle = .rounded
        reset.controlSize = .small

        for m in RecAreaMode.allCases { areaPopup.addItem(withTitle: m.title) }
        areaPopup.target = self
        areaPopup.action = #selector(changed)
        screenPopup.target = self
        screenPopup.action = #selector(changed)

        for c in [systemCheck, micCheck, countdownCheck, clicksCheck, webcamCheck] {
            c.target = self
            c.action = #selector(changed)
        }
        for s in [systemSlider, micSlider] {
            s.target = self
            s.action = #selector(changed)
            s.controlSize = .small
            s.translatesAutoresizingMaskIntoConstraints = false
            s.widthAnchor.constraint(equalToConstant: 90).isActive = true
            s.toolTip = "Volume na gravação"
        }
        for m in [systemMeter, micMeter] {
            m.translatesAutoresizingMaskIntoConstraints = false
            m.widthAnchor.constraint(equalToConstant: 110).isActive = true
            m.heightAnchor.constraint(equalToConstant: 8).isActive = true
        }
        small(systemStatus)
        micPopup.target = self
        micPopup.action = #selector(changed)
        micPopup.controlSize = .small
        testButton.bezelStyle = .rounded
        testButton.target = self
        testButton.action = #selector(runTest)
        small(testStatus)
        let howTo = NSButton(title: "Como configurar…", target: self, action: #selector(showAudioHelp))
        howTo.bezelStyle = .rounded
        howTo.controlSize = .small

        for q in RecVideoQuality.allCases { videoPopup.addItem(withTitle: q.title) }
        for q in RecAudioQuality.allCases { audioPopup.addItem(withTitle: q.title) }
        for p in [videoPopup, audioPopup, cameraPopup, positionPopup, sizePopup] {
            p.target = self
            p.action = #selector(changed)
        }
        small(effectiveLabel)
        for p in WebcamPosition.allCases { positionPopup.addItem(withTitle: p.title) }
        for s in WebcamSize.allCases { sizePopup.addItem(withTitle: s.title) }
        cameraPopup.controlSize = .small
        positionPopup.controlSize = .small
        sizePopup.controlSize = .small

        folderLabel.lineBreakMode = .byTruncatingMiddle
        folderLabel.translatesAutoresizingMaskIntoConstraints = false
        folderLabel.widthAnchor.constraint(lessThanOrEqualToConstant: 170).isActive = true
        let choose = NSButton(title: "Alterar…", target: self, action: #selector(chooseFolder))
        choose.bezelStyle = .rounded
        small(folderWarning)
        folderWarning.textColor = .systemRed

        var rows: [[NSView]] = [
            [label("Perfil:"), row([profilePopup, reset])],
            [NSGridCell.emptyContentView, section("ÁREA")],
            [label("Gravar:"), areaPopup],
            [label("Tela:"), screenPopup],
            [NSGridCell.emptyContentView, section("ÁUDIO")],
            [systemCheck, row([systemMeter, systemSlider, howTo])],
            [NSGridCell.emptyContentView, systemStatus],
            [micCheck, row([micMeter, micSlider])],
            [NSGridCell.emptyContentView, micPopup],
            [NSGridCell.emptyContentView, row([testButton, testStatus])],
            [NSGridCell.emptyContentView, section("QUALIDADE")],
            [label("Vídeo:"), videoPopup],
            [NSGridCell.emptyContentView, effectiveLabel],
            [label("Áudio:"), audioPopup],
            [label("Salvar em:"), row([folderLabel, choose])],
            [NSGridCell.emptyContentView, folderWarning],
            [NSGridCell.emptyContentView, section("OPÇÕES")],
            [NSGridCell.emptyContentView, countdownCheck],
            [NSGridCell.emptyContentView, clicksCheck],
            [NSGridCell.emptyContentView, webcamCheck],
            [label("Câmera:"), row([cameraPopup])],
            [label("Webcam:"), row([positionPopup, sizePopup])],
            [NSGridCell.emptyContentView, section("ATALHOS")],
        ]
        for s in RecShortcut.allCases {
            let r = ShortcutRecorderView(frame: .zero)
            r.defaultShortcut = s.standard
            r.translatesAutoresizingMaskIntoConstraints = false
            r.widthAnchor.constraint(equalToConstant: 160).isActive = true
            r.heightAnchor.constraint(equalToConstant: 26).isActive = true
            r.onChange = { [weak self, weak r] value in self?.shortcutChanged(s, value, recorder: r) }
            r.onRecordingChange = { [weak self] rec in self?.onRecordingShortcut?(rec) }
            recorders[s] = r
            rows.append([label(s.title), r])
        }
        small(shortcutWarning)
        shortcutWarning.textColor = .systemRed
        rows.append([NSGridCell.emptyContentView, shortcutWarning])

        let grid = NSGridView(views: rows)
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.rowSpacing = 8
        grid.columnSpacing = 10
        grid.yPlacement = .center
        grid.column(at: 0).xPlacement = .trailing
        for (i, r) in rows.enumerated() where (r.last as? NSTextField).map({ $0.font?.pointSize == 12 && $0.textColor == .secondaryLabelColor }) ?? false {
            grid.row(at: i).topPadding = 10
        }
        let card = CardView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(grid)
        addSubview(card)
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            grid.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
            grid.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            grid.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -12),
            card.topAnchor.constraint(equalTo: topAnchor),
            card.leadingAnchor.constraint(equalTo: leadingAnchor),
            card.trailingAnchor.constraint(equalTo: trailingAnchor),
            card.bottomAnchor.constraint(equalTo: bottomAnchor),
            systemStatus.widthAnchor.constraint(equalToConstant: 270),
        ])
    }

    // MARK: Dados

    private func load() {
        profile = RecSettings.current
        profilePopup.selectItem(withTitle: profile.name)
        areaPopup.selectItem(at: RecAreaMode.allCases.firstIndex(of: profile.areaMode) ?? 0)

        screenPopup.removeAllItems()
        screenPopup.addItem(withTitle: "Tela onde está o mouse")
        screenPopup.lastItem?.representedObject = nil
        for s in NSScreen.screens {
            screenPopup.addItem(withTitle: s.recorteName)
            screenPopup.lastItem?.representedObject = NSNumber(value: s.displayID)
        }
        if let id = profile.displayID, let i = screenPopup.itemArray.firstIndex(where: { ($0.representedObject as? NSNumber)?.uint32Value == id }) {
            screenPopup.selectItem(at: i)
        } else {
            screenPopup.selectItem(at: 0)
        }

        systemCheck.state = profile.systemAudio ? .on : .off
        systemSlider.floatValue = profile.systemVolume
        micCheck.state = profile.microphone ? .on : .off
        micSlider.floatValue = profile.micVolume
        micPopup.removeAllItems()
        let mics = AudioDevices.microphones()
        micPopup.addItem(withTitle: "Padrão do sistema")
        for m in mics {
            micPopup.addItem(withTitle: m.localizedName)
            micPopup.lastItem?.representedObject = m.uniqueID
        }
        if let uid = profile.micDeviceUID, let i = micPopup.itemArray.firstIndex(where: { ($0.representedObject as? String) == uid }) {
            micPopup.selectItem(at: i)
        } else {
            micPopup.selectItem(at: 0)
        }
        videoPopup.selectItem(at: RecVideoQuality.allCases.firstIndex(of: profile.videoQuality) ?? 1)
        audioPopup.selectItem(at: RecAudioQuality.allCases.firstIndex(of: profile.audioQuality) ?? 1)
        countdownCheck.state = profile.countdown ? .on : .off
        clicksCheck.state = profile.clickHighlight ? .on : .off
        webcamCheck.state = profile.webcam ? .on : .off
        cameraPopup.removeAllItems()
        let cams = WebcamSource.cameras()
        if cams.isEmpty { cameraPopup.addItem(withTitle: "Nenhuma câmera encontrada") }
        for c in cams {
            cameraPopup.addItem(withTitle: c.localizedName)
            cameraPopup.lastItem?.representedObject = c.uniqueID
        }
        if let uid = profile.cameraUID, let i = cameraPopup.itemArray.firstIndex(where: { ($0.representedObject as? String) == uid }) {
            cameraPopup.selectItem(at: i)
        }
        positionPopup.selectItem(at: WebcamPosition.allCases.firstIndex(of: profile.webcamPosition) ?? 0)
        sizePopup.selectItem(at: WebcamSize.allCases.firstIndex(of: profile.webcamSize) ?? 1)
        for (s, r) in recorders { r.shortcut = RecSettings.shortcut(s) }
        refreshDerived()
    }

    private func refreshDerived() {
        micPopup.isEnabled = profile.microphone
        micSlider.isEnabled = profile.microphone
        systemSlider.isEnabled = profile.systemAudio
        cameraPopup.isEnabled = profile.webcam && !WebcamSource.cameras().isEmpty
        positionPopup.isEnabled = profile.webcam
        sizePopup.isEnabled = profile.webcam
        screenPopup.isEnabled = profile.areaMode == .fullScreen

        // Som do Mac: como será capturado nesta versão do macOS.
        if CaptureSources.systemAudioViaSCK {
            systemStatus.stringValue = "Capturado direto pelo macOS (ScreenCaptureKit). Você continua ouvindo normalmente."
            systemStatus.textColor = .secondaryLabelColor
        } else if AudioDevices.blackHole() == nil {
            systemStatus.stringValue = "Requer o BlackHole 2ch (gratuito). Clique em “Como configurar…”."
            systemStatus.textColor = .systemOrange
        } else {
            switch AudioDevices.systemAudioRoute() {
            case .multiOutput:
                systemStatus.stringValue = "Pelo BlackHole 2ch, com Saída Múltipla ativa: tudo certo."
                systemStatus.textColor = .secondaryLabelColor
            case .blackHoleOnly:
                systemStatus.stringValue = "A saída é só o BlackHole: grava, mas você não ouve. Use uma Saída Múltipla."
                systemStatus.textColor = .systemOrange
            case .notRouted(let current):
                systemStatus.stringValue = "A saída atual (“\(current)”) não passa pelo BlackHole: o som do Mac ficaria mudo."
                systemStatus.textColor = .systemOrange
            }
        }

        // Valores efetivos de vídeo para a área atual.
        let screen = profile.displayID.flatMap { id in NSScreen.screens.first { $0.displayID == id } } ?? NSScreen.main
        var pixels = CGSize(width: 1920, height: 1080)
        var source = "tela"
        if profile.areaMode == .lastArea, let last = RecSettings.lastArea, let s = last.validScreen() {
            pixels = CGSize(width: last.width * s.backingScaleFactor, height: last.height * s.backingScaleFactor)
            source = "última área"
        } else if let s = screen {
            pixels = CGSize(width: s.frame.width * s.backingScaleFactor, height: s.frame.height * s.backingScaleFactor)
            source = profile.areaMode == .select ? "tela inteira (máximo)" : "tela"
        }
        let fmt = RecVideoFormat(capturePixels: pixels, quality: profile.videoQuality)
        effectiveLabel.stringValue = "Efetivo (\(source)): \(fmt.summary) · H.264 · MP4"

        let folder = profile.outputFolderURL
        folderLabel.stringValue = FileManager.default.displayName(atPath: folder.path)
        folderLabel.toolTip = (folder.path as NSString).abbreviatingWithTildeInPath
        folderWarning.stringValue = RecSessionStore.isWritableFolder(folder) ? "" : "Esta pasta não aceita gravação."
    }

    private func save() {
        RecSettings.save(profile)
        refreshDerived()
        restartMonitor()
    }

    // MARK: Ações

    @objc private func profileChosen() {
        RecSettings.currentProfileName = profilePopup.titleOfSelectedItem ?? "Reunião"
        load()
        restartMonitor()
    }

    @objc private func resetProfile() {
        RecSettings.resetProfile(profile.name)
        load()
        restartMonitor()
    }

    @objc private func changed() {
        profile.areaMode = RecAreaMode.allCases[max(0, areaPopup.indexOfSelectedItem)]
        profile.displayID = (screenPopup.selectedItem?.representedObject as? NSNumber)?.uint32Value
        profile.systemAudio = systemCheck.state == .on
        profile.systemVolume = systemSlider.floatValue
        profile.microphone = micCheck.state == .on
        profile.micVolume = micSlider.floatValue
        profile.micDeviceUID = micPopup.selectedItem?.representedObject as? String
        profile.videoQuality = RecVideoQuality.allCases[max(0, videoPopup.indexOfSelectedItem)]
        profile.audioQuality = RecAudioQuality.allCases[max(0, audioPopup.indexOfSelectedItem)]
        profile.countdown = countdownCheck.state == .on
        profile.clickHighlight = clicksCheck.state == .on
        profile.webcam = webcamCheck.state == .on
        profile.cameraUID = cameraPopup.selectedItem?.representedObject as? String
        profile.webcamPosition = WebcamPosition.allCases[max(0, positionPopup.indexOfSelectedItem)]
        profile.webcamSize = WebcamSize.allCases[max(0, sizePopup.indexOfSelectedItem)]
        save()
    }

    @objc private func chooseFolder() {
        guard let window = window else { return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.directoryURL = profile.outputFolderURL
        panel.prompt = "Escolher"
        panel.beginSheetModal(for: window) { [weak self] response in
            guard let self = self, response == .OK, let url = panel.url else { return }
            if !RecSessionStore.isWritableFolder(url) {
                let a = NSAlert()
                a.messageText = "Esta pasta não aceita gravação"
                a.informativeText = "Escolha outra pasta ou verifique as permissões."
                a.runModal()
                return
            }
            self.profile.outputFolder = url.path
            self.save()
        }
    }

    @objc private func showAudioHelp() {
        let a = NSAlert()
        if CaptureSources.systemAudioViaSCK {
            a.messageText = "Som do Mac"
            a.informativeText = "Nesta versão do macOS o som do Mac é capturado diretamente, sem configuração. "
                + "Só é preciso a permissão de Gravação de Tela."
            a.runModal()
            return
        }
        a.messageText = "Gravar o som do Mac (macOS 10.14 a 12)"
        a.informativeText = AudioDevices.setupInstructions
        a.addButton(withTitle: "Abrir Configuração de Áudio e MIDI")
        a.addButton(withTitle: "Baixar BlackHole")
        a.addButton(withTitle: "Fechar")
        switch a.runModal() {
        case .alertFirstButtonReturn: AudioDevices.openAudioMIDISetup()
        case .alertSecondButtonReturn: NSWorkspace.shared.open(AudioDevices.blackHoleURL)
        default: break
        }
    }

    @objc private func runTest() {
        guard !testing else { return }
        if profile.microphone && AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
            AVCaptureDevice.requestAccess(for: .audio) { _ in DispatchQueue.main.async { self.runTest() } }
            return
        }
        testing = true
        testButton.isEnabled = false
        monitor.runTest(profile: profile, status: { [weak self] text in
            self?.testStatus.stringValue = text
        }, done: { [weak self] in
            self?.testing = false
            self?.testButton.isEnabled = true
            self?.restartMonitor()
        })
    }

    private func shortcutChanged(_ s: RecShortcut, _ value: Shortcut, recorder: ShortcutRecorderView?) {
        if let other = RecSettings.conflict(for: value, except: String(s.title.dropLast())) {
            shortcutWarning.stringValue = "\(value.displayString) já é usado em “\(other)”. Escolha outra combinação."
            recorder?.shortcut = RecSettings.shortcut(s)
            return
        }
        RecSettings.setShortcut(value, for: s)
        let ok = onShortcutsChanged?() ?? true
        shortcutWarning.stringValue = ok ? "" : "Algum atalho não pôde ser registrado: outro app já o utiliza."
    }

    // MARK: Medidores

    func activate() {
        load()
        restartMonitor()
        meterTimer?.invalidate()
        meterTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let busy = Recorder.shared.isBusy
            self.systemMeter.value = busy ? Recorder.shared.level(.system) : self.monitor.level(.system)
            self.micMeter.value = busy ? Recorder.shared.level(.mic) : self.monitor.level(.mic)
        }
        RunLoop.main.add(meterTimer!, forMode: .common)
    }

    func deactivate() {
        meterTimer?.invalidate()
        meterTimer = nil
        if !testing { monitor.stop() }
    }

    private func restartMonitor() {
        guard meterTimer != nil, !testing, !Recorder.shared.isBusy else { return }
        monitor.start(profile: profile)
    }
}
