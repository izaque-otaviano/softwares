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
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 620),
                              styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                              backing: .buffered, defer: false)
        window.title = url.deletingPathExtension().lastPathComponent
        window.titlebarAppearsTransparent = true
        window.isReleasedWhenClosed = false
        window.minSize = NSSize(width: 820, height: 460)
        super.init(window: window)
        window.delegate = self
        build(in: window)
        window.setContentSize(NSSize(width: 1000, height: 620))
        window.center()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    private let detailsGrid = NSGridView(numberOfColumns: 2, rows: 0)
    private let countLabel = NSTextField(labelWithString: "")
    private let emptyState = NSStackView()
    private let listScroll = NSScrollView()
    private let visibility = NSSegmentedControl()

    private static func symbol(_ name: String, _ fallback: NSImage?) -> NSImage? {
        if #available(macOS 11.0, *) {
            return NSImage(systemSymbolName: name, accessibilityDescription: nil)?
                .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 13, weight: .medium))
        }
        return fallback
    }

    private func actionButton(_ title: String, symbol: String, fallback: NSImage?, action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded
        if #available(macOS 11.0, *) { b.controlSize = .large }
        if let image = RecPreviewWindowController.symbol(symbol, fallback) {
            b.image = image
            b.imagePosition = .imageLeading
        }
        return b
    }

    /// Visual nos materiais do macOS: conteúdo sobre o fundo da janela e uma barra lateral
    /// translúcida (inspector) com marcadores e detalhes, de cima a baixo.
    private func build(in window: NSWindow) {
        let root = NSView()
        window.contentView = root

        let content = NSVisualEffectView()
        content.material = .windowBackground
        content.blendingMode = .behindWindow
        content.state = .followsWindowActiveState
        content.translatesAutoresizingMaskIntoConstraints = false

        let side = NSVisualEffectView()
        side.material = .sidebar
        side.blendingMode = .behindWindow
        side.state = .followsWindowActiveState
        side.translatesAutoresizingMaskIntoConstraints = false
        let rule = NSBox()
        rule.boxType = .separator
        rule.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(content)
        root.addSubview(side)
        root.addSubview(rule)

        // Vídeo com cantos arredondados, sem moldura preta em volta.
        playerView.player = player
        playerView.controlsStyle = .inline
        playerView.showsFullScreenToggleButton = true
        playerView.translatesAutoresizingMaskIntoConstraints = false
        playerView.wantsLayer = true
        playerView.layer?.cornerRadius = 10
        playerView.layer?.masksToBounds = true
        playerView.layer?.backgroundColor = NSColor.black.cgColor
        let frame = NSView()
        frame.wantsLayer = true
        frame.translatesAutoresizingMaskIntoConstraints = false
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.22)
        shadow.shadowBlurRadius = 12
        shadow.shadowOffset = NSSize(width: 0, height: -3)
        frame.shadow = shadow
        frame.addSubview(playerView)
        content.addSubview(frame)

        // Ações: as de arquivo à esquerda, o envio ao Desk (a ação principal) à direita.
        playButton.title = "Reproduzir"
        playButton.bezelStyle = .rounded
        if #available(macOS 11.0, *) { playButton.controlSize = .large }
        playButton.image = RecPreviewWindowController.symbol("play.fill", RecIcons.play)
        playButton.imagePosition = .imageLeading
        playButton.target = self
        playButton.action = #selector(togglePlay)
        playButton.keyEquivalent = " "
        playButton.toolTip = "Reproduzir ou pausar (espaço)"
        let finder = actionButton("Mostrar no Finder", symbol: "folder", fallback: nil, action: #selector(showInFinder))
        let trim = actionButton("Cortar…", symbol: "scissors", fallback: nil, action: #selector(beginTrim))
        trim.toolTip = "Cortar o início e o fim. O original é mantido."

        visibility.segmentCount = 2
        visibility.trackingMode = .selectOne
        visibility.setLabel("Privado", forSegment: 0)
        visibility.setLabel("Público", forSegment: 1)
        visibility.setImage(RecPreviewWindowController.symbol("lock.fill", Icons.lockClosed), forSegment: 0)
        visibility.setImage(RecPreviewWindowController.symbol("globe", Icons.lockOpen), forSegment: 1)
        if #available(macOS 10.13, *) {
            visibility.setToolTip("Só a equipe Convertize abre o link", forSegment: 0)
            visibility.setToolTip("Qualquer pessoa com o link abre", forSegment: 1)
        }
        if #available(macOS 11.0, *) { visibility.controlSize = .large }
        visibility.selectedSegment = DeskClient.isPublic ? 1 : 0
        visibility.target = self
        visibility.action = #selector(visibilityChanged)
        let desk = actionButton("Enviar ao Desk", symbol: "arrow.up.circle.fill", fallback: Icons.upload, action: #selector(sendToDesk))
        desk.bezelColor = .controlAccentColor
        desk.font = NSFont.systemFont(ofSize: NSFont.systemFontSize, weight: .semibold)
        desk.contentTintColor = .white

        let spacer = NSView()
        spacer.setContentHuggingPriority(.init(1), for: .horizontal)
        let bar = NSStackView(views: [playButton, finder, trim, spacer, visibility, desk])
        bar.orientation = .horizontal
        bar.spacing = 8
        bar.setCustomSpacing(12, after: visibility)
        bar.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(bar)

        // Barra lateral: marcadores.
        let heading = NSTextField(labelWithString: "Marcadores")
        heading.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        countLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        countLabel.textColor = .secondaryLabelColor
        let headRow = NSStackView(views: [heading, NSView(), countLabel])
        headRow.orientation = .horizontal

        let col = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("marcador"))
        col.resizingMask = .autoresizingMask
        table.addTableColumn(col)
        table.headerView = nil
        table.rowHeight = 30
        table.intercellSpacing = NSSize(width: 0, height: 2)
        table.backgroundColor = .clear
        table.selectionHighlightStyle = .regular
        table.columnAutoresizingStyle = .uniformColumnAutoresizingStyle
        table.dataSource = self
        table.delegate = self
        table.target = self
        table.action = #selector(markerClicked)
        if #available(macOS 11.0, *) { table.style = .inset }
        listScroll.documentView = table
        listScroll.drawsBackground = false
        listScroll.hasVerticalScroller = true
        listScroll.autohidesScrollers = true
        listScroll.borderType = .noBorder
        listScroll.translatesAutoresizingMaskIntoConstraints = false

        // Sem marcadores: um convite a usar o atalho, em vez de uma tabela vazia.
        let emptyIcon = NSImageView()
        emptyIcon.image = RecPreviewWindowController.symbol("bookmark", RecIcons.marker)
        if #available(macOS 11.0, *) {
            emptyIcon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 24, weight: .light)
        }
        emptyIcon.contentTintColor = .tertiaryLabelColor
        let emptyTitle = NSTextField(labelWithString: "Nenhum marcador")
        emptyTitle.font = NSFont.systemFont(ofSize: 12, weight: .medium)
        emptyTitle.textColor = .secondaryLabelColor
        let emptyText = NSTextField(wrappingLabelWithString:
            "Enquanto grava, use o atalho “Adicionar marcador” para marcar um trecho e voltar a ele aqui.")
        emptyText.font = NSFont.systemFont(ofSize: 11)
        emptyText.textColor = .tertiaryLabelColor
        emptyText.alignment = .center
        emptyText.preferredMaxLayoutWidth = 190
        emptyState.setViews([emptyIcon, emptyTitle, emptyText], in: .center)
        emptyState.orientation = .vertical
        emptyState.alignment = .centerX
        emptyState.spacing = 6
        emptyState.translatesAutoresizingMaskIntoConstraints = false

        let hint = NSTextField(wrappingLabelWithString: "Clique para ir ao trecho. Clique duas vezes no nome para renomear.")
        hint.font = NSFont.systemFont(ofSize: 11)
        hint.textColor = .tertiaryLabelColor
        hint.isHidden = markers.isEmpty
        hint.translatesAutoresizingMaskIntoConstraints = false

        // Detalhes do arquivo, em linhas de rótulo e valor.
        let detailsHeading = NSTextField(labelWithString: "Detalhes")
        detailsHeading.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        detailsHeading.translatesAutoresizingMaskIntoConstraints = false
        detailsGrid.rowSpacing = 5
        detailsGrid.columnSpacing = 10
        detailsGrid.translatesAutoresizingMaskIntoConstraints = false
        let detailsRule = NSBox()
        detailsRule.boxType = .separator
        detailsRule.translatesAutoresizingMaskIntoConstraints = false

        headRow.translatesAutoresizingMaskIntoConstraints = false
        for v in [headRow, listScroll, emptyState, hint, detailsRule, detailsHeading, detailsGrid] as [NSView] {
            side.addSubview(v)
        }

        let guide = window.contentLayoutGuide as? NSLayoutGuide
        let top = guide?.topAnchor ?? root.topAnchor
        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: root.topAnchor),
            content.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            content.trailingAnchor.constraint(equalTo: side.leadingAnchor),
            side.topAnchor.constraint(equalTo: root.topAnchor),
            side.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            side.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            side.widthAnchor.constraint(equalToConstant: 260),
            rule.topAnchor.constraint(equalTo: root.topAnchor),
            rule.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            rule.trailingAnchor.constraint(equalTo: side.leadingAnchor),
            rule.widthAnchor.constraint(equalToConstant: 1),

            frame.topAnchor.constraint(equalTo: top, constant: 4),
            frame.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            frame.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),
            frame.bottomAnchor.constraint(equalTo: bar.topAnchor, constant: -16),
            playerView.topAnchor.constraint(equalTo: frame.topAnchor),
            playerView.bottomAnchor.constraint(equalTo: frame.bottomAnchor),
            playerView.leadingAnchor.constraint(equalTo: frame.leadingAnchor),
            playerView.trailingAnchor.constraint(equalTo: frame.trailingAnchor),
            frame.heightAnchor.constraint(greaterThanOrEqualToConstant: 340),
            listScroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 150),
            bar.leadingAnchor.constraint(equalTo: frame.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: frame.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -18),

            headRow.topAnchor.constraint(equalTo: top, constant: 8),
            headRow.leadingAnchor.constraint(equalTo: side.leadingAnchor, constant: 18),
            headRow.trailingAnchor.constraint(equalTo: side.trailingAnchor, constant: -18),
            listScroll.topAnchor.constraint(equalTo: headRow.bottomAnchor, constant: 8),
            listScroll.leadingAnchor.constraint(equalTo: side.leadingAnchor, constant: 6),
            listScroll.trailingAnchor.constraint(equalTo: side.trailingAnchor, constant: -6),
            listScroll.bottomAnchor.constraint(equalTo: hint.topAnchor, constant: -8),
            emptyState.centerXAnchor.constraint(equalTo: listScroll.centerXAnchor),
            emptyState.centerYAnchor.constraint(equalTo: listScroll.centerYAnchor, constant: -10),
            emptyState.widthAnchor.constraint(equalToConstant: 200),
            emptyText.widthAnchor.constraint(equalToConstant: 190),
            hint.leadingAnchor.constraint(equalTo: headRow.leadingAnchor),
            hint.trailingAnchor.constraint(equalTo: headRow.trailingAnchor),
            hint.bottomAnchor.constraint(equalTo: detailsRule.topAnchor, constant: -14),
            detailsRule.leadingAnchor.constraint(equalTo: headRow.leadingAnchor),
            detailsRule.trailingAnchor.constraint(equalTo: headRow.trailingAnchor),
            detailsRule.bottomAnchor.constraint(equalTo: detailsHeading.topAnchor, constant: -14),
            detailsHeading.leadingAnchor.constraint(equalTo: headRow.leadingAnchor),
            detailsHeading.bottomAnchor.constraint(equalTo: detailsGrid.topAnchor, constant: -8),
            detailsGrid.leadingAnchor.constraint(equalTo: headRow.leadingAnchor),
            detailsGrid.trailingAnchor.constraint(lessThanOrEqualTo: headRow.trailingAnchor),
            detailsGrid.bottomAnchor.constraint(equalTo: side.bottomAnchor, constant: -22),
        ])
        if markers.isEmpty { hint.heightAnchor.constraint(equalToConstant: 0).isActive = true }
        updateInfo()
        reloadMarkers()
        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 4), queue: .main) {
            [weak self] _ in
            guard let self = self else { return }
            let playing = self.player.rate > 0
            let title = playing ? "Pausar" : "Reproduzir"
            if self.playButton.title != title {
                self.playButton.title = title
                self.playButton.image = RecPreviewWindowController.symbol(playing ? "pause.fill" : "play.fill",
                                                                         playing ? RecIcons.pause : RecIcons.play)
            }
        }
    }

    private func reloadMarkers() {
        table.reloadData()
        countLabel.stringValue = markers.isEmpty ? "" : "\(markers.count)"
        emptyState.isHidden = !markers.isEmpty
        listScroll.isHidden = markers.isEmpty
    }

    private func updateInfo() {
        let asset = AVURLAsset(url: url)
        let d = CMTimeGetSeconds(asset.duration)
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).flatMap { $0 } ?? 0
        let mb = String(format: "%.1f", Double(size) / 1_000_000).replacingOccurrences(of: ".", with: ",")
        var rows: [(String, String)] = []
        if let v = asset.tracks(withMediaType: .video).first {
            rows.append(("Resolução", "\(Int(v.naturalSize.width)) × \(Int(v.naturalSize.height))"))
        }
        rows.append(("Duração", Recorder.format(d)))
        rows.append(("Tamanho", "\(mb) MB"))
        rows.append(("Formato", url.pathExtension.uppercased()))
        let created = (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? nil
        if let created = created {
            let f = DateFormatter()
            f.dateFormat = "dd/MM/yyyy, HH:mm"
            rows.append(("Gravado em", f.string(from: created)))
        }
        while detailsGrid.numberOfRows > 0 { detailsGrid.removeRow(at: 0) }
        for (name, value) in rows {
            let l = NSTextField(labelWithString: name)
            l.font = NSFont.systemFont(ofSize: 11)
            l.textColor = .secondaryLabelColor
            let v = NSTextField(labelWithString: value)
            v.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular)
            v.lineBreakMode = .byTruncatingMiddle
            detailsGrid.addRow(with: [l, v])
        }
        infoLabel.stringValue = rows.map { $0.1 }.joined(separator: ", ")
        if #available(macOS 11.0, *) { window?.subtitle = "\(Recorder.format(d)) de gravação" }
    }

    @objc private func visibilityChanged() {
        DeskClient.isPublic = visibility.selectedSegment == 1
    }

    // MARK: Ações

    @objc private func togglePlay() {
        if player.rate > 0 { player.pause() } else { player.play() }
    }

    @objc private func sendToDesk() {
        let hud = ProgressHUD(title: DeskClient.isPublic ? "Enviando ao Desk com link público…" : "Enviando ao Desk com link privado…")
        hud.show()
        DeskClient.shared.sendVideo(url, progress: { p in hud.progress = p }) { error in
            hud.close()
            if let error = error {
                let a = NSAlert()
                a.messageText = "Não foi possível enviar ao Desk"
                a.informativeText = error.localizedDescription
                a.runModal()
            } else {
                Toast.show(DeskClient.shared.lastLink != nil ? "Enviado ao Desk · link copiado" : "Enviado ao Desk",
                           subtitle: DeskClient.isPublic ? "Link público" : "Link privado (só a equipe)")
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
        let cell = NSTableCellView()
        let time = NSTextField(labelWithString: Recorder.format(markers[row].time))
        time.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        time.textColor = .controlAccentColor
        time.translatesAutoresizingMaskIntoConstraints = false
        let name = NSTextField(string: markers[row].name)
        name.isBordered = false
        name.drawsBackground = false
        name.isEditable = true
        name.font = NSFont.systemFont(ofSize: 12)
        name.lineBreakMode = .byTruncatingTail
        name.tag = row
        name.target = self
        name.action = #selector(renamed(_:))
        name.translatesAutoresizingMaskIntoConstraints = false
        cell.addSubview(time)
        cell.addSubview(name)
        cell.textField = name
        NSLayoutConstraint.activate([
            time.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 6),
            time.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            time.widthAnchor.constraint(equalToConstant: 46),
            name.leadingAnchor.constraint(equalTo: time.trailingAnchor, constant: 6),
            name.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -6),
            name.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        return cell
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
