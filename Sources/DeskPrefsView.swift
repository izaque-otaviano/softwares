import Cocoa

/// Aba "Convertize Desk" das Preferências: login, endereço e formato dos arquivos.
final class DeskPrefsView: NSView, NSTextFieldDelegate {
    private let status = NSTextField(wrappingLabelWithString: "")
    private let loginButton = NSButton(title: "Entrar com a Convertize", target: nil, action: nil)
    private let address = NSTextField(string: "")
    private let path = NSTextField(string: "")
    private let urlPreview = NSTextField(labelWithString: "")
    private let imagePopup = NSPopUpButton()
    private let videoPopup = NSPopUpButton()

    init() {
        super.init(frame: .zero)
        build()
        refresh()
        DeskClient.shared.onChange = { [weak self] in self?.refresh() }
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    private func label(_ text: String) -> NSTextField {
        let l = NSTextField(labelWithString: text)
        l.alignment = .right
        return l
    }

    private func hint(_ text: String) -> NSTextField {
        let l = NSTextField(wrappingLabelWithString: text)
        l.font = NSFont.systemFont(ofSize: 11)
        l.textColor = .secondaryLabelColor
        l.preferredMaxLayoutWidth = 270
        l.translatesAutoresizingMaskIntoConstraints = false
        l.widthAnchor.constraint(equalToConstant: 270).isActive = true
        return l
    }

    private func build() {
        status.font = NSFont.systemFont(ofSize: 12)
        status.preferredMaxLayoutWidth = 270
        loginButton.bezelStyle = .rounded
        loginButton.target = self
        loginButton.action = #selector(loginPressed)
        for f in [address, path] {
            f.delegate = self
            f.translatesAutoresizingMaskIntoConstraints = false
            f.widthAnchor.constraint(equalToConstant: 260).isActive = true
        }
        address.placeholderString = "ex.: 192.168.0.20:8000"
        path.placeholderString = "/api/capturas/"
        address.stringValue = DeskClient.serverAddress
        path.stringValue = DeskClient.uploadPath
        urlPreview.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .regular)
        urlPreview.textColor = .secondaryLabelColor
        urlPreview.lineBreakMode = .byTruncatingMiddle
        imagePopup.addItems(withTitles: ["PNG — sem perda", "JPEG — arquivo menor"])
        videoPopup.addItems(withTitles: ["MP4", "MOV (QuickTime)"])
        imagePopup.selectItem(at: DeskClient.imageFormat == .png ? 0 : 1)
        videoPopup.selectItem(at: DeskClient.videoFormat == .mp4 ? 0 : 1)
        for p in [imagePopup, videoPopup] {
            p.target = self
            p.action = #selector(formatChanged)
        }

        let grid = NSGridView(views: [
            [label("Conta:"), status],
            [NSGridCell.emptyContentView, loginButton],
            [label("Endereço do Desk:"), address],
            [label("Caminho de envio:"), path],
            [NSGridCell.emptyContentView, urlPreview],
            [NSGridCell.emptyContentView, hint("Use o IP (com a porta, se houver) ou o endereço completo. "
                                                + "Os arquivos vão por POST com o token da sua conta Convertize.")],
            [label("Formato dos prints:"), imagePopup],
            [label("Formato das gravações:"), videoPopup],
            [NSGridCell.emptyContentView, hint("Para enviar: botão ⇪ na barra do print (ou tecla D) e "
                                                + "“Enviar ao Desk” na prévia das gravações. O título é criado "
                                                + "automaticamente (tipo, app ou duração, data e hora).")],
        ])
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.rowSpacing = 10
        grid.columnSpacing = 10
        grid.yPlacement = .center
        grid.column(at: 0).xPlacement = .trailing
        grid.row(at: 2).topPadding = 10
        grid.row(at: 6).topPadding = 10
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
            status.widthAnchor.constraint(equalToConstant: 270),
            urlPreview.widthAnchor.constraint(equalToConstant: 270),
        ])
    }

    func refresh() {
        let c = DeskClient.shared
        if c.isLoggedIn {
            let who = [c.userName, c.userEmail].compactMap { $0 }.joined(separator: " · ")
            status.stringValue = "Conectado" + (who.isEmpty ? "" : " — \(who)")
            status.textColor = .systemGreen
            loginButton.title = "Sair"
        } else {
            status.stringValue = "Não conectado. Entre com o login da equipe (com 2FA)."
            status.textColor = .secondaryLabelColor
            loginButton.title = "Entrar com a Convertize"
        }
        urlPreview.stringValue = DeskClient.uploadURL.map { "Envio para: \($0.absoluteString)" } ?? "Endereço ainda não definido"
    }

    @objc private func loginPressed() {
        if DeskClient.shared.isLoggedIn {
            DeskClient.shared.logout()
            return
        }
        loginButton.isEnabled = false
        status.stringValue = "Aguardando o login no navegador…"
        DeskClient.shared.login { [weak self] error in
            self?.loginButton.isEnabled = true
            if let error = error {
                self?.status.stringValue = error.localizedDescription
                self?.status.textColor = .systemRed
            } else {
                self?.refresh()
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }

    @objc private func formatChanged() {
        DeskClient.imageFormat = imagePopup.indexOfSelectedItem == 1 ? .jpeg : .png
        DeskClient.videoFormat = videoPopup.indexOfSelectedItem == 1 ? .mov : .mp4
    }

    func controlTextDidChange(_ obj: Notification) {
        DeskClient.serverAddress = address.stringValue
        DeskClient.uploadPath = path.stringValue
        refresh()
    }
}
