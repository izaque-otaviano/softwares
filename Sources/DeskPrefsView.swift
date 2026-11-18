import Cocoa

/// Aba "Convertize Desk" das Preferências: conta, endereço e tudo o que depende da
/// especificação do Desk (método, formato, campos, limites, resposta, autenticação).
final class DeskPrefsView: NSView, NSTextFieldDelegate, NSTextViewDelegate {
    private let status = NSTextField(wrappingLabelWithString: "")
    private let loginButton = NSButton(title: "Entrar com a Convertize", target: nil, action: nil)
    private let address = NSTextField(string: "")
    private let path = NSTextField(string: "")
    private let urlPreview = NSTextField(labelWithString: "")
    private let methodPopup = NSPopUpButton()
    private let bodyPopup = NSPopUpButton()
    private let fileField = NSTextField(string: "")
    private let fieldsView = NSTextView()
    private let maxImage = NSTextField(string: "")
    private let maxVideo = NSTextField(string: "")
    private let imagePopup = NSPopUpButton()
    private let videoPopup = NSPopUpButton()
    private let successCodes = NSTextField(string: "")
    private let linkKey = NSTextField(string: "")
    private let authHeader = NSTextField(string: "")
    private let authPrefix = NSTextField(string: "")
    private let issuer = NSTextField(string: "")
    private let clientID = NSTextField(string: "")
    private let scopes = NSTextField(string: "")
    private let testButton = NSButton(title: "Enviar captura de teste", target: nil, action: nil)
    private let testResult = NSTextField(wrappingLabelWithString: "")
    private let audience = NSTextField(string: "")
    private let sendAudience = NSButton(checkboxWithTitle: "Pedir esta audiência no login", target: nil, action: nil)
    private let mePath = NSTextField(string: "")
    private let meButton = NSButton(title: "Ver resposta do /me", target: nil, action: nil)
    private let meCopy = NSButton(title: "Copiar", target: nil, action: nil)
    private let meView = NSTextView()
    private weak var pageScroll: NSScrollView?
    /// Campo de texto → chave da configuração.
    private var keys: [NSTextField: String] = [:]

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
        l.preferredMaxLayoutWidth = 262
        l.translatesAutoresizingMaskIntoConstraints = false
        l.widthAnchor.constraint(equalToConstant: 262).isActive = true
        return l
    }

    private func section(_ title: String) -> NSTextField {
        let l = NSTextField(labelWithString: title)
        l.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        l.textColor = .secondaryLabelColor
        return l
    }

    private func field(_ f: NSTextField, key: String, value: String, placeholder: String, width: CGFloat = 250) {
        f.stringValue = UserDefaults.standard.string(forKey: "desk." + key) ?? ""
        f.placeholderString = placeholder
        _ = value
        f.delegate = self
        f.translatesAutoresizingMaskIntoConstraints = false
        f.widthAnchor.constraint(equalToConstant: width).isActive = true
        keys[f] = key
    }

    private func build() {
        status.font = NSFont.systemFont(ofSize: 12)
        status.preferredMaxLayoutWidth = 262
        loginButton.bezelStyle = .rounded
        loginButton.target = self
        loginButton.action = #selector(loginPressed)

        for f in [address, path] {
            f.delegate = self
            f.translatesAutoresizingMaskIntoConstraints = false
            f.widthAnchor.constraint(equalToConstant: 250).isActive = true
        }
        address.placeholderString = "desk.convertize.com.br ou 192.168.0.20:8000"
        path.placeholderString = "/api/capturas/"
        address.stringValue = DeskClient.serverAddress
        path.stringValue = DeskClient.uploadPath
        urlPreview.font = NSFont.systemFont(ofSize: 11)
        urlPreview.textColor = .secondaryLabelColor
        urlPreview.lineBreakMode = .byTruncatingMiddle

        methodPopup.addItems(withTitles: ["POST", "PUT"])
        methodPopup.selectItem(withTitle: DeskClient.method)
        bodyPopup.addItems(withTitles: ["multipart/form-data", "JSON (arquivo em base64)", "Arquivo puro (campos na URL)"])
        bodyPopup.selectItem(at: ["multipart", "json", "raw"].firstIndex(of: DeskClient.bodyFormat) ?? 0)
        imagePopup.addItems(withTitles: ["PNG — sem perda", "JPEG — arquivo menor"])
        videoPopup.addItems(withTitles: ["MP4", "MOV (QuickTime)"])
        imagePopup.selectItem(at: DeskClient.imageFormat == .png ? 0 : 1)
        videoPopup.selectItem(at: DeskClient.videoFormat == .mp4 ? 0 : 1)
        for p in [methodPopup, bodyPopup, imagePopup, videoPopup] {
            p.target = self
            p.action = #selector(popupChanged)
        }

        field(fileField, key: "fileField", value: DeskClient.fileField, placeholder: "arquivo", width: 150)
        field(maxImage, key: "maxImageMB", value: "", placeholder: "sem limite", width: 80)
        field(maxVideo, key: "maxVideoMB", value: "", placeholder: "sem limite", width: 80)
        field(successCodes, key: "success", value: "", placeholder: "200-299", width: 150)
        field(linkKey, key: "linkKey", value: "", placeholder: "ex.: url ou data.link", width: 150)
        field(authHeader, key: "authHeader", value: "", placeholder: "Authorization", width: 150)
        field(authPrefix, key: "authPrefix", value: "", placeholder: "Bearer", width: 150)
        field(issuer, key: "issuer", value: "", placeholder: "https://auth.convertize.com.br")
        field(clientID, key: "clientID", value: "", placeholder: "convertize-print-mac")
        field(scopes, key: "scopes", value: "", placeholder: "openid profile email desk.capturas")
        field(audience, key: "audience", value: "", placeholder: "desk-capturas", width: 150)
        field(mePath, key: "mePath", value: "", placeholder: "/api/v1/me/", width: 150)
        sendAudience.state = DeskClient.sendAudience ? .on : .off
        sendAudience.target = self
        sendAudience.action = #selector(sendAudienceChanged)
        sendAudience.controlSize = .small
        sendAudience.font = NSFont.systemFont(ofSize: 11)

        meButton.bezelStyle = .rounded
        meButton.target = self
        meButton.action = #selector(mePressed)
        meCopy.bezelStyle = .rounded
        meCopy.target = self
        meCopy.action = #selector(meCopyPressed)
        meCopy.isEnabled = false
        let meButtons = NSStackView(views: [meButton, meCopy])
        meButtons.orientation = .horizontal
        meButtons.spacing = 6
        meView.isEditable = false
        meView.isSelectable = true
        meView.isRichText = false
        meView.font = NSFont.userFixedPitchFont(ofSize: 10)
        meView.textColor = .labelColor
        meView.backgroundColor = .textBackgroundColor
        meView.textContainerInset = NSSize(width: 3, height: 4)
        meView.isVerticallyResizable = true
        meView.isHorizontallyResizable = false
        meView.autoresizingMask = [.width]
        meView.string = "Clique em \"Ver resposta do /me\" para consultar o Desk com o seu login."
        let meScroll = NSScrollView()
        meScroll.documentView = meView
        meScroll.hasVerticalScroller = true
        meScroll.borderType = .bezelBorder
        meScroll.translatesAutoresizingMaskIntoConstraints = false
        meScroll.widthAnchor.constraint(equalToConstant: 262).isActive = true
        meScroll.heightAnchor.constraint(equalToConstant: 170).isActive = true
        meView.frame = NSRect(x: 0, y: 0, width: 245, height: 170)

        // Campos enviados (um por linha: nome={variavel})
        fieldsView.string = DeskClient.fieldsTemplate
        fieldsView.font = NSFont.userFixedPitchFont(ofSize: 11)
        fieldsView.isRichText = false
        fieldsView.isAutomaticQuoteSubstitutionEnabled = false
        fieldsView.isAutomaticDashSubstitutionEnabled = false
        fieldsView.isAutomaticSpellingCorrectionEnabled = false
        fieldsView.delegate = self
        fieldsView.isVerticallyResizable = true
        fieldsView.autoresizingMask = [.width]
        fieldsView.textContainerInset = NSSize(width: 2, height: 4)
        let fieldsScroll = NSScrollView()
        fieldsScroll.documentView = fieldsView
        fieldsScroll.hasVerticalScroller = true
        fieldsScroll.borderType = .bezelBorder
        fieldsScroll.translatesAutoresizingMaskIntoConstraints = false
        fieldsScroll.widthAnchor.constraint(equalToConstant: 262).isActive = true
        fieldsScroll.heightAnchor.constraint(equalToConstant: 132).isActive = true
        fieldsView.frame = NSRect(x: 0, y: 0, width: 245, height: 132)
        let resetFields = NSButton(title: "Restaurar campos padrão", target: self, action: #selector(resetFieldsPressed))
        resetFields.bezelStyle = .rounded
        resetFields.controlSize = .small

        testButton.bezelStyle = .rounded
        testButton.target = self
        testButton.action = #selector(testPressed)
        testResult.font = NSFont.userFixedPitchFont(ofSize: 10)
        testResult.textColor = .secondaryLabelColor
        testResult.preferredMaxLayoutWidth = 262
        testResult.isSelectable = true

        func mb(_ f: NSTextField) -> NSStackView {
            let s = NSStackView(views: [f, NSTextField(labelWithString: "MB")])
            s.orientation = .horizontal
            s.spacing = 6
            return s
        }
        let empty = NSGridCell.emptyContentView
        let rows: [[NSView]] = [
            [label("Conta:"), status],
            [empty, loginButton],
            [empty, section("Endereço (1)")],
            [label("Endereço do Desk:"), address],
            [label("Caminho de envio:"), path],
            [label("Método:"), methodPopup],
            [empty, urlPreview],
            [empty, section("Corpo e campos (2 e 3)")],
            [label("Formato do corpo:"), bodyPopup],
            [label("Campo do arquivo:"), fileField],
            [label("Campos enviados:"), fieldsScroll],
            [empty, hint("Um por linha, no formato nome={variável}. Variáveis: {titulo} {tipo} {data} {email} {nome} "
                         + "{origem} {arquivo} {largura} {altura} {formato} {duracao} {marcadores}. "
                         + "Troque o nome à esquerda pelo que o Desk espera; apague as linhas que ele não usa.")],
            [empty, resetFields],
            [empty, section("Arquivos (4)")],
            [label("Formato dos prints:"), imagePopup],
            [label("Formato das gravações:"), videoPopup],
            [label("Máximo por print:"), mb(maxImage)],
            [label("Máximo por gravação:"), mb(maxVideo)],
            [empty, section("Resposta (5)")],
            [label("Códigos de sucesso:"), successCodes],
            [label("Campo com o link:"), linkKey],
            [empty, hint("Se o Desk devolver o link da captura num campo do JSON, informe o nome: o Recorte copia o link ao enviar.")],
            [empty, section("Autenticação (6)")],
            [label("Cabeçalho:"), authHeader],
            [label("Prefixo do token:"), authPrefix],
            [label("Servidor de login:"), issuer],
            [label("Client ID:"), clientID],
            [label("Escopos:"), scopes],
            [label("Audiência (aud):"), audience],
            [empty, sendAudience],
            [empty, hint("O Desk só aceita tokens com esta audiência (CAPTURAS_OAUTH_AUDIENCES no servidor). "
                         + "O botão do /me mostra se o seu token confere. Mudou o servidor, o client ID, "
                         + "os escopos ou a audiência? Saia e entre de novo para valer.")],
            [empty, section("Teste")],
            [empty, testButton],
            [empty, testResult],
            [label("Caminho do /me:"), mePath],
            [empty, meButtons],
            [empty, meScroll],
        ]
        let grid = NSGridView(views: rows)
        grid.translatesAutoresizingMaskIntoConstraints = false
        grid.rowSpacing = 8
        grid.columnSpacing = 10
        grid.yPlacement = .center
        grid.column(at: 0).xPlacement = .trailing
        for (i, r) in rows.enumerated() {
            if let t = r.last as? NSTextField, t.font?.pointSize == 12, t.textColor == .secondaryLabelColor, i > 0 {
                grid.row(at: i).topPadding = 12
            }
        }
        grid.cell(for: fieldsScroll)?.row?.yPlacement = .top
        grid.cell(for: meScroll)?.row?.yPlacement = .top

        let card = CardView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(grid)
        let doc = FlippedView()
        doc.translatesAutoresizingMaskIntoConstraints = false
        doc.addSubview(card)
        let scroll = NSScrollView()
        scroll.documentView = doc
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.translatesAutoresizingMaskIntoConstraints = false
        addSubview(scroll)
        pageScroll = scroll
        NSLayoutConstraint.activate([
            grid.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            grid.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
            grid.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            grid.trailingAnchor.constraint(lessThanOrEqualTo: card.trailingAnchor, constant: -12),
            card.topAnchor.constraint(equalTo: doc.topAnchor),
            card.leadingAnchor.constraint(equalTo: doc.leadingAnchor),
            card.trailingAnchor.constraint(equalTo: doc.trailingAnchor),
            card.bottomAnchor.constraint(equalTo: doc.bottomAnchor),
            doc.topAnchor.constraint(equalTo: scroll.contentView.topAnchor),
            doc.leadingAnchor.constraint(equalTo: scroll.contentView.leadingAnchor),
            doc.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor),
            scroll.topAnchor.constraint(equalTo: topAnchor),
            scroll.bottomAnchor.constraint(equalTo: bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: trailingAnchor),
            status.widthAnchor.constraint(equalToConstant: 262),
            urlPreview.widthAnchor.constraint(equalToConstant: 262),
            testResult.widthAnchor.constraint(equalToConstant: 262),
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
        urlPreview.stringValue = DeskClient.uploadURL.map { "\(DeskClient.method) \($0.absoluteString)" }
            ?? "Endereço ainda não definido"
        fileField.isEnabled = DeskClient.bodyFormat != "raw"
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

    @objc private func popupChanged() {
        DeskClient.imageFormat = imagePopup.indexOfSelectedItem == 1 ? .jpeg : .png
        DeskClient.videoFormat = videoPopup.indexOfSelectedItem == 1 ? .mov : .mp4
        DeskClient.set("method", methodPopup.titleOfSelectedItem ?? "POST")
        DeskClient.set("body", ["multipart", "json", "raw"][max(0, bodyPopup.indexOfSelectedItem)])
        refresh()
    }

    @objc private func resetFieldsPressed() {
        DeskClient.set("fields", "")
        fieldsView.string = DeskClient.fieldsTemplate
    }

    @objc private func testPressed() {
        testButton.isEnabled = false
        testResult.textColor = .secondaryLabelColor
        testResult.stringValue = "Enviando…"
        DeskClient.shared.sendTest { [weak self] ok, detail in
            self?.testButton.isEnabled = true
            self?.testResult.textColor = ok ? .systemGreen : .systemRed
            self?.testResult.stringValue = detail
        }
    }

    @objc private func sendAudienceChanged() {
        DeskClient.set("sendAudience", sendAudience.state == .on ? "1" : "0")
    }

    @objc private func mePressed() {
        meButton.isEnabled = false
        meView.string = "Consultando \(DeskClient.meURL?.absoluteString ?? "")…"
        DeskClient.shared.fetchMe { [weak self] report in
            self?.meButton.isEnabled = true
            self?.meCopy.isEnabled = true
            self?.meView.string = report
            self?.meView.scrollToBeginningOfDocument(nil)
        }
    }

    /// Demonstração (CI): rola até o fim e consulta o /me.
    func runMeDemo() {
        layoutSubtreeIfNeeded()
        if let scroll = pageScroll, let doc = scroll.documentView {
            doc.scroll(NSPoint(x: 0, y: max(0, doc.bounds.height - scroll.contentView.bounds.height)))
        }
        mePressed()
    }

    @objc private func meCopyPressed() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(meView.string, forType: .string)
        meCopy.title = "Copiado"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in self?.meCopy.title = "Copiar" }
    }

    func controlTextDidChange(_ obj: Notification) {
        guard let f = obj.object as? NSTextField else { return }
        if f === address { DeskClient.serverAddress = f.stringValue }
        else if f === path { DeskClient.uploadPath = f.stringValue }
        else if let key = keys[f] { DeskClient.set(key, f.stringValue) }
        refresh()
    }

    func textDidChange(_ notification: Notification) {
        DeskClient.set("fields", fieldsView.string)
    }
}
