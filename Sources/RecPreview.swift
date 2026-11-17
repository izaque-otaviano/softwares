import Cocoa
import AVKit
import AVFoundation

/// Prévia ao terminar: reproduzir, mostrar no Finder, cortar início e fim, marcadores.
final class RecPreviewWindowController: NSWindowController, NSWindowDelegate, NSTableViewDataSource, NSTableViewDelegate {
    private static var open: [RecPreviewWindowController] = []

    let url: URL
    private let playerView = AVPlayerView()
    private let player: AVPlayer
    private var markers: [RecMarker]
    private var markersChanged = false
    private let table = NSTableView()
    private let playButton = NSButton(title: "Reproduzir", target: nil, action: nil)
    private let infoLabel = NSTextField(labelWithString: "")
    private var timeObserver: Any?

    static func show(_ url: URL) {
        if let existing = open.first(where: { $0.url == url }) {
            existing.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }
        let c = RecPreviewWindowController(url: url)
        open.append(c)
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        c.window?.makeKeyAndOrderFront(nil)
    }

    private init(url: URL) {
        self.url = url
        player = AVPlayer(url: url)
        markers = RecLibrary.markers(for: url)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 980, height: 600),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
        window.title = url.deletingPathExtension().lastPathComponent
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 720, height: 420)
        super.init(window: window)
        window.delegate = self
        build(in: window)
        window.center()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    private func build(in window: NSWindow) {
        let bg = NSVisualEffectView()
        bg.material = .underWindowBackground
        bg.blendingMode = .behindWindow
        bg.state = .followsWindowActiveState
        window.contentView = bg

        playerView.player = player
        playerView.controlsStyle = .inline
        playerView.showsFullScreenToggleButton = true
        playerView.translatesAutoresizingMaskIntoConstraints = false

        playButton.bezelStyle = .rounded
        playButton.target = self
        playButton.action = #selector(togglePlay)
        playButton.keyEquivalent = " "
        let finder = NSButton(title: "Mostrar no Finder", target: self, action: #selector(showInFinder))
        finder.bezelStyle = .rounded
        let trim = NSButton(title: "Cortar início e fim…", target: self, action: #selector(beginTrim))
        trim.bezelStyle = .rounded
        infoLabel.textColor = .secondaryLabelColor
        infoLabel.font = NSFont.systemFont(ofSize: 11)
        infoLabel.lineBreakMode = .byTruncatingMiddle
        let desk = NSButton(title: "Enviar ao Desk", target: self, action: #selector(sendToDesk))
        desk.bezelStyle = .rounded
        let buttons = NSStackView(views: [playButton, finder, trim, desk, NSView(), infoLabel])
        buttons.orientation = .horizontal
        buttons.spacing = 8
        buttons.translatesAutoresizingMaskIntoConstraints = false

        // Marcadores
        let title = NSTextField(labelWithString: "Marcadores")
        title.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        let hint = NSTextField(wrappingLabelWithString: "Clique para ir ao trecho. Clique duas vezes no nome para renomear.")
        hint.font = NSFont.systemFont(ofSize: 11)
        hint.textColor = .secondaryLabelColor
        let timeCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("tempo"))
        timeCol.title = "Tempo"
        timeCol.width = 64
        let nameCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("nome"))
        nameCol.title = "Nome"
        nameCol.width = 170
        table.addTableColumn(timeCol)
        table.addTableColumn(nameCol)
        table.dataSource = self
        table.delegate = self
        table.usesAlternatingRowBackgroundColors = true
        table.target = self
        table.action = #selector(markerClicked)
        let scroll = NSScrollView()
        scroll.documentView = table
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        let empty = NSTextField(wrappingLabelWithString: markers.isEmpty
            ? "Nenhum marcador nesta gravação. Use o atalho “Adicionar marcador” enquanto grava." : "")
        empty.font = NSFont.systemFont(ofSize: 11)
        empty.textColor = .secondaryLabelColor
        let side = NSStackView(views: [title, hint, scroll, empty])
        side.orientation = .vertical
        side.alignment = .leading
        side.spacing = 6
        side.translatesAutoresizingMaskIntoConstraints = false

        bg.addSubview(playerView)
        bg.addSubview(buttons)
        bg.addSubview(side)
        let guide = window.contentLayoutGuide as? NSLayoutGuide
        NSLayoutConstraint.activate([
            playerView.topAnchor.constraint(equalTo: guide?.topAnchor ?? bg.topAnchor, constant: 8),
            playerView.leadingAnchor.constraint(equalTo: bg.leadingAnchor, constant: 16),
            playerView.trailingAnchor.constraint(equalTo: side.leadingAnchor, constant: -16),
            playerView.bottomAnchor.constraint(equalTo: buttons.topAnchor, constant: -12),
            buttons.leadingAnchor.constraint(equalTo: playerView.leadingAnchor),
            buttons.trailingAnchor.constraint(equalTo: playerView.trailingAnchor),
            buttons.bottomAnchor.constraint(equalTo: bg.bottomAnchor, constant: -16),
            side.topAnchor.constraint(equalTo: playerView.topAnchor),
            side.trailingAnchor.constraint(equalTo: bg.trailingAnchor, constant: -16),
            side.bottomAnchor.constraint(equalTo: bg.bottomAnchor, constant: -16),
            side.widthAnchor.constraint(equalToConstant: 250),
            scroll.widthAnchor.constraint(equalTo: side.widthAnchor),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 200),
            hint.widthAnchor.constraint(equalTo: side.widthAnchor),
            empty.widthAnchor.constraint(equalTo: side.widthAnchor),
        ])
        updateInfo()
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 4), queue: .main) {
            [weak self] _ in
            guard let self = self else { return }
            self.playButton.title = self.player.rate > 0 ? "Pausar" : "Reproduzir"
        }
    }

    private func updateInfo() {
        let asset = AVURLAsset(url: url)
        let d = CMTimeGetSeconds(asset.duration)
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).flatMap { $0 } ?? 0
        let mb = String(format: "%.1f", Double(size) / 1_000_000).replacingOccurrences(of: ".", with: ",")
        var dims = ""
        if let v = asset.tracks(withMediaType: .video).first {
            dims = "\(Int(v.naturalSize.width))×\(Int(v.naturalSize.height)) · "
        }
        infoLabel.stringValue = "\(dims)\(Recorder.format(d)) · \(mb) MB"
    }

    // MARK: Ações

    @objc private func togglePlay() {
        if player.rate > 0 { player.pause() } else { player.play() }
    }

    @objc private func sendToDesk() {
        let hud = ProgressHUD(title: "Enviando ao Convertize Desk…")
        hud.show()
        DeskClient.shared.sendVideo(url, progress: { p in hud.progress = p }) { error in
            hud.close()
            if let error = error {
                let a = NSAlert()
                a.messageText = "Não foi possível enviar ao Desk"
                a.informativeText = error.localizedDescription
                a.runModal()
            } else {
                Toast.show("Enviado ao Desk", subtitle: self.url.lastPathComponent)
            }
        }
    }

    @objc private func showInFinder() {
        NSWorkspace.shared.activateFileViewerSelecting([url])
    }

    @objc private func markerClicked() {
        let row = table.clickedRow
        guard row >= 0, row < markers.count else { return }
        player.seek(to: CMTime(seconds: markers[row].time, preferredTimescale: 600),
                    toleranceBefore: .zero, toleranceAfter: .zero)
    }

    /// Corte com a régua de corte do próprio macOS. O original é preservado.
    @objc private func beginTrim() {
        guard playerView.canBeginTrimming else { return }
        player.pause()
        playerView.beginTrimming { [weak self] result in
            guard let self = self, result == .okButton, let item = self.player.currentItem else { return }
            let duration = item.duration
            var start = item.reversePlaybackEndTime
            var end = item.forwardPlaybackEndTime
            if !start.isValid { start = .zero }
            if !end.isValid { end = duration }
            // Volta a mostrar o vídeo inteiro (o original não é alterado).
            item.reversePlaybackEndTime = .invalid
            item.forwardPlaybackEndTime = .invalid
            self.exportTrim(range: CMTimeRange(start: start, end: end))
        }
    }

    private func exportTrim(range: CMTimeRange) {
        let start = CMTimeGetSeconds(range.start), end = CMTimeGetSeconds(range.end)
        // Marcadores dentro do trecho mantido, com o tempo ajustado.
        let kept = markers.filter { $0.time >= start && $0.time < end }
            .map { RecMarker(time: $0.time - start, name: $0.name) }
        let base = url.deletingPathExtension().lastPathComponent + " (corte)"
        let output = RecSessionStore.uniqueURL(in: url.deletingLastPathComponent(), base: base, ext: "mp4")
        let temp = output.deletingLastPathComponent().appendingPathComponent(".\(base).parcial.mp4")
        try? FileManager.default.removeItem(at: temp)
        let hud = ProgressHUD(title: "Exportando o corte…")
        hud.show()
        let muxer = Muxer()
        hud.onCancel = { muxer.cancel() }
        muxer.export(segments: [Muxer.Segment(url: url, range: range, audioKinds: [.system])], audio: .passthrough,
                     markers: kept, output: temp, progress: { p in DispatchQueue.main.async { hud.progress = p } }) {
            error in
            hud.close()
            if let error = error {
                try? FileManager.default.removeItem(at: temp)
                NSAlert(error: error).runModal()
                return
            }
            guard Muxer.isPlayable(temp), (try? FileManager.default.moveItem(at: temp, to: output)) != nil else {
                try? FileManager.default.removeItem(at: temp)
                let a = NSAlert()
                a.messageText = "Não foi possível exportar o corte."
                a.runModal()
                return
            }
            RecLibrary.add(url: output, duration: end - start, markers: kept)
            Toast.show("Corte salvo", subtitle: output.lastPathComponent, duration: 2)
            RecPreviewWindowController.show(output)
        }
    }

    // MARK: Tabela

    func numberOfRows(in tableView: NSTableView) -> Int {
        return markers.count
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let id = tableColumn?.identifier.rawValue ?? ""
        let field = NSTextField(string: id == "tempo" ? Recorder.format(markers[row].time) : markers[row].name)
        field.isBordered = false
        field.drawsBackground = false
        field.isEditable = id == "nome"
        field.tag = row
        field.target = self
        field.action = #selector(renamed(_:))
        if id == "tempo" { field.font = NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular) }
        return field
    }

    @objc private func renamed(_ sender: NSTextField) {
        let row = sender.tag
        guard row >= 0, row < markers.count else { return }
        let name = sender.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name != markers[row].name else { return }
        markers[row].name = name
        markersChanged = true
        RecLibrary.setMarkers(markers, for: url)
    }

    // MARK: Fechar

    func windowWillClose(_ notification: Notification) {
        player.pause()
        if let o = timeObserver { player.removeTimeObserver(o) }
        RecPreviewWindowController.open.removeAll { $0 === self }
        if markersChanged { RecPreviewWindowController.rewriteChapters(url: url, markers: markers) }
        if RecPreviewWindowController.open.isEmpty {
            DispatchQueue.main.async { (NSApp.delegate as? AppDelegate)?.refreshActivationPolicy() }
        }
    }

    /// Grava os nomes novos dos marcadores nos capítulos do arquivo (cópia sem recompressão).
    static func rewriteChapters(url: URL, markers: [RecMarker]) {
        let temp = url.deletingLastPathComponent().appendingPathComponent(".\(UUID().uuidString).parcial.mp4")
        let muxer = Muxer()
        let asset = AVURLAsset(url: url)
        let range = CMTimeRange(start: .zero, duration: asset.duration)
        muxer.export(segments: [Muxer.Segment(url: url, range: range, audioKinds: [.system])], audio: .passthrough,
                     markers: markers, output: temp, progress: { _ in }) { error in
            guard error == nil, Muxer.isPlayable(temp) else {
                try? FileManager.default.removeItem(at: temp)
                return
            }
            _ = try? FileManager.default.replaceItemAt(url, withItemAt: temp)
            Toast.show("Marcadores salvos no vídeo", subtitle: url.lastPathComponent)
        }
    }
}
