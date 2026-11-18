import Cocoa
import Network
import CommonCrypto
import Security
import AVFoundation

/// Login na Convertize (auth.convertize.com.br, OAuth com PKCE, sem client_secret) e envio
/// de prints e gravações para o Convertize Desk. Compatível com o macOS 10.14: usa a volta
/// do login por 127.0.0.1 (Network.framework), CommonCrypto e chamadas com completion.
final class DeskClient: NSObject {
    static let shared = DeskClient()

    // Tudo o que depende do Desk/gestor é configurável nas Preferências (com estes padrões).
    static func setting(_ key: String, _ fallback: String) -> String {
        let v = UserDefaults.standard.string(forKey: "desk." + key)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return v.isEmpty ? fallback : v
    }

    static func set(_ key: String, _ value: String) {
        UserDefaults.standard.set(value, forKey: "desk." + key)
    }

    static let defaultFields = [
        "titulo={titulo}", "tipo={tipo}", "origem={origem}", "criado_em={data}", "enviado_por={email}",
        "largura={largura}", "altura={altura}", "formato={formato}", "duracao={duracao}", "marcadores={marcadores}",
    ].joined(separator: "\n")

    static var issuer: String {
        var v = setting("issuer", "https://auth.convertize.com.br")
        while v.hasSuffix("/") { v.removeLast() }
        return v
    }
    static var clientID: String { return setting("clientID", "convertize-print-mac") }
    static var scopes: String { return setting("scopes", "openid profile email desk.capturas") }
    static var method: String { return setting("method", "POST").uppercased() }
    /// "multipart", "json" (arquivo em base64) ou "raw" (arquivo puro no corpo; campos na URL).
    static var bodyFormat: String { return setting("body", "multipart") }
    static var fileField: String { return setting("fileField", "arquivo") }
    static var fieldsTemplate: String { return setting("fields", defaultFields) }
    static var maxImageMB: Double { return Double(setting("maxImageMB", "0").replacingOccurrences(of: ",", with: ".")) ?? 0 }
    static var maxVideoMB: Double { return Double(setting("maxVideoMB", "0").replacingOccurrences(of: ",", with: ".")) ?? 0 }
    static var successCodes: String { return setting("success", "200-299") }
    /// Campo da resposta JSON com o link da captura (ex.: "url" ou "data.link"). Vazio = não usar.
    static var linkKey: String { return setting("linkKey", "") }
    static var authHeader: String { return setting("authHeader", "Authorization") }
    static var authPrefix: String { return setting("authPrefix", "Bearer") }

    /// Link público (qualquer pessoa com o link) ou privado (só a equipe). Fica a última escolha.
    static var isPublic: Bool {
        get { return setting("visibility", "privado") == "publico" }
        set { set("visibility", newValue ? "publico" : "privado") }
    }
    /// Nome do campo e valores que o Desk espera para a visibilidade.
    static var visibilityField: String { return setting("visibilityField", "visibilidade") }
    static var publicValue: String { return setting("publicValue", "publico") }
    static var privateValue: String { return setting("privateValue", "privado") }

    static func isSuccess(_ status: Int) -> Bool {
        for part in successCodes.split(whereSeparator: { $0 == "," || $0 == " " || $0 == ";" }) {
            let bounds = part.split(separator: "-").compactMap { Int($0) }
            if bounds.count == 1, bounds[0] == status { return true }
            if bounds.count == 2, (bounds[0]...max(bounds[0], bounds[1])).contains(status) { return true }
        }
        return false
    }

    /// Última resposta do Desk (para o teste nas Preferências) e link devolvido, se houver.
    private(set) var lastResponse = ""
    private(set) var lastLink: String?

    enum ImageFormat: String, CaseIterable { case png, jpeg }
    enum VideoFormat: String, CaseIterable { case mp4, mov }

    // MARK: Preferências

    private static let defaults = UserDefaults.standard

    /// Endereço do Desk: IP ou URL (ex.: 192.168.0.20:8000 ou https://desk.convertize.com.br).
    static var serverAddress: String {
        get { return defaults.string(forKey: "desk.server") ?? "desk.convertize.com.br" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "desk.server") }
    }

    static var uploadPath: String {
        get { return defaults.string(forKey: "desk.path") ?? "/api/v1/screenshots/" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "desk.path") }
    }

    static var imageFormat: ImageFormat {
        get { return ImageFormat(rawValue: defaults.string(forKey: "desk.imageFormat") ?? "") ?? .jpeg }
        set { defaults.set(newValue.rawValue, forKey: "desk.imageFormat") }
    }

    static var videoFormat: VideoFormat {
        get { return VideoFormat(rawValue: defaults.string(forKey: "desk.videoFormat") ?? "") ?? .mp4 }
        set { defaults.set(newValue.rawValue, forKey: "desk.videoFormat") }
    }

    /// URL completa de envio, ou nil se o endereço for inválido.
    static var uploadURL: URL? {
        var address = serverAddress
        guard !address.isEmpty else { return nil }
        if !address.lowercased().hasPrefix("http://") && !address.lowercased().hasPrefix("https://") {
            // Domínios (desk.convertize.com.br) vão por HTTPS; IPs e nomes locais, por HTTP.
            let host = address.split(separator: "/").first.map(String.init) ?? address
            let hostOnly = host.split(separator: ":").first.map(String.init) ?? host
            let isIP = hostOnly.allSatisfy { $0.isNumber || $0 == "." }
            let isLocal = hostOnly == "localhost" || hostOnly.hasSuffix(".local") || !hostOnly.contains(".")
            address = (isIP || isLocal ? "http://" : "https://") + address
        }
        while address.hasSuffix("/") { address.removeLast() }
        var path = uploadPath.isEmpty ? "/" : uploadPath
        if !path.hasPrefix("/") { path = "/" + path }
        return URL(string: address + path)
    }

    // MARK: Sessão

    private(set) var userName: String? = DeskClient.defaults.string(forKey: "desk.userName")
    private(set) var userEmail: String? = DeskClient.defaults.string(forKey: "desk.userEmail")
    private var accessToken: String?
    private var accessExpiry = Date.distantPast
    private var listener: NWListener?
    private var pendingLogin: ((Error?) -> Void)?
    var onChange: (() -> Void)?

    var isLoggedIn: Bool { return Keychain.refreshToken != nil || testToken != nil }

    private var testToken: String? { return ProcessInfo.processInfo.environment["RECORTE_TEST_DESK_TOKEN"] }

    // MARK: Login (PKCE + volta por 127.0.0.1)

    func login(completion: @escaping (Error?) -> Void) {
        listener?.cancel()
        let verifier = DeskClient.randomURLSafe(48)
        let state = DeskClient.randomURLSafe(24)
        let challenge = DeskClient.base64URL(DeskClient.sha256(Data(verifier.utf8)))
        let listener: NWListener
        do {
            // Só aceita conexões do próprio Mac (127.0.0.1), nunca da rede.
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = NWEndpoint.hostPort(host: .ipv4(.loopback), port: .any)
            listener = try NWListener(using: parameters)
        } catch {
            completion(error)
            return
        }
        self.listener = listener
        pendingLogin = completion
        listener.newConnectionHandler = { [weak self] connection in
            self?.handleCallback(connection, state: state, verifier: verifier, listener: listener)
        }
        listener.stateUpdateHandler = { [weak self] st in
            guard let self = self else { return }
            switch st {
            case .ready:
                guard let port = listener.port?.rawValue else { return }
                let redirect = "http://127.0.0.1:\(port)/callback"
                self.redirectURI = redirect
                var c = URLComponents(string: DeskClient.issuer + "/oauth/authorize/")!
                c.queryItems = [
                    URLQueryItem(name: "response_type", value: "code"),
                    URLQueryItem(name: "client_id", value: DeskClient.clientID),
                    URLQueryItem(name: "redirect_uri", value: redirect),
                    URLQueryItem(name: "scope", value: DeskClient.scopes),
                    URLQueryItem(name: "state", value: state),
                    URLQueryItem(name: "code_challenge", value: challenge),
                    URLQueryItem(name: "code_challenge_method", value: "S256"),
                ]
                DispatchQueue.main.async {
                    guard let url = c.url else { return }
                    if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
                        print("URL de login: \(url.absoluteString)")
                    } else {
                        NSWorkspace.shared.open(url)
                    }
                }
            case .failed(let error):
                self.finishLogin(error)
            default:
                break
            }
        }
        listener.start(queue: .main)
        // Desiste depois de 5 minutos sem resposta.
        DispatchQueue.main.asyncAfter(deadline: .now() + 300) { [weak self] in
            guard let self = self, self.listener === listener, self.pendingLogin != nil else { return }
            self.finishLogin(RecError.message("O login não foi concluído a tempo."))
        }
    }

    private var redirectURI = ""

    private func handleCallback(_ connection: NWConnection, state: String, verifier: String, listener: NWListener) {
        // Defesa extra: recusa qualquer conexão que não venha do próprio Mac.
        if case .hostPort(let host, _) = connection.endpoint {
            let text = "\(host)"
            guard text.hasPrefix("127.") || text == "::1" || text == "localhost" else {
                connection.cancel()
                return
            }
        }
        connection.start(queue: .main)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) { [weak self] data, _, _, _ in
            guard let self = self else { return }
            let request = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
            let firstLine = request.components(separatedBy: "\r\n").first ?? ""
            let parts = firstLine.split(separator: " ")
            let target = parts.count > 1 ? String(parts[1]) : ""
            let components = URLComponents(string: "http://127.0.0.1" + target)
            guard components?.path == "/callback" else {
                self.reply(connection, status: "404 Not Found", body: "")
                return
            }
            let items = components?.queryItems ?? []
            func value(_ n: String) -> String? { return items.first { $0.name == n }?.value }
            let ok = value("state") == state && value("code") != nil && value("error") == nil
            let message = ok ? "Login concluído. Pode fechar esta aba e voltar ao Recorte." : "Falha no login. Tente de novo no Recorte."
            self.reply(connection, status: "200 OK", body: "<html><head><meta charset=\"utf-8\"></head>"
                       + "<body style=\"font-family:-apple-system;padding:40px\"><h3>\(message)</h3></body></html>")
            listener.cancel()
            self.listener = nil
            if let error = value("error") {
                self.finishLogin(RecError.message("A Convertize recusou o login: \(error) \(value("error_description") ?? "")"))
                return
            }
            guard value("state") == state else {
                self.finishLogin(RecError.message("Resposta de login inválida (state diferente). Tente de novo."))
                return
            }
            guard let code = value("code") else {
                self.finishLogin(RecError.message("A resposta do login não trouxe o código."))
                return
            }
            self.postToken([
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self.redirectURI,
                "code_verifier": verifier,
                "client_id": DeskClient.clientID,
            ]) { error in
                if error == nil { self.loadUserInfo() }
                self.finishLogin(error)
            }
        }
    }

    private func reply(_ connection: NWConnection, status: String, body: String) {
        let response = "HTTP/1.1 \(status)\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
    }

    private func finishLogin(_ error: Error?) {
        let done = pendingLogin
        pendingLogin = nil
        listener?.cancel()
        listener = nil
        DispatchQueue.main.async {
            done?(error)
            self.onChange?()
        }
    }

    func logout() {
        if let refresh = Keychain.refreshToken {
            var request = URLRequest(url: URL(string: DeskClient.issuer + "/oauth/revoke/")!)
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = DeskClient.form(["token": refresh, "token_type_hint": "refresh_token",
                                                "client_id": DeskClient.clientID])
            URLSession.shared.dataTask(with: request).resume()
        }
        Keychain.refreshToken = nil
        accessToken = nil
        userName = nil
        userEmail = nil
        DeskClient.defaults.removeObject(forKey: "desk.userName")
        DeskClient.defaults.removeObject(forKey: "desk.userEmail")
        onChange?()
    }

    // MARK: Tokens

    private func postToken(_ form: [String: String], completion: @escaping (Error?) -> Void) {
        var request = URLRequest(url: URL(string: DeskClient.issuer + "/oauth/token/")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = DeskClient.form(form)
        request.timeoutInterval = 20
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let error = error { completion(error); return }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard status == 200, let data = data,
                      let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                      let access = json["access_token"] as? String else {
                    let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                    if status == 400 || status == 401 { Keychain.refreshToken = nil }
                    completion(RecError.message("O servidor de login respondeu \(status): \(body.prefix(200))"))
                    return
                }
                self.accessToken = access
                let expires = (json["expires_in"] as? Double) ?? 3600
                self.accessExpiry = Date().addingTimeInterval(expires - 60)
                // O refresh muda a cada renovação: guarda sempre o novo.
                if let refresh = json["refresh_token"] as? String { Keychain.refreshToken = refresh }
                completion(nil)
            }
        }.resume()
    }

    /// Entrega um access token válido (renova se precisar).
    func withAccessToken(_ completion: @escaping (Result<String, Error>) -> Void) {
        if let t = testToken { completion(.success(t)); return }
        if let token = accessToken, Date() < accessExpiry { completion(.success(token)); return }
        guard let refresh = Keychain.refreshToken else {
            completion(.failure(RecError.message("Entre com a sua conta Convertize nas Preferências › Convertize Desk.")))
            return
        }
        postToken(["grant_type": "refresh_token", "refresh_token": refresh, "client_id": DeskClient.clientID]) { error in
            if let error = error {
                completion(.failure(RecError.message("A sessão expirou. Entre de novo. (\(error.localizedDescription))")))
                self.onChange?()
            } else if let token = self.accessToken {
                completion(.success(token))
            }
        }
    }

    private func loadUserInfo() {
        withAccessToken { [weak self] result in
            guard case .success(let token) = result else { return }
            var request = URLRequest(url: URL(string: DeskClient.issuer + "/oauth/userinfo/")!)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            URLSession.shared.dataTask(with: request) { data, _, _ in
                guard let data = data, let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
                DispatchQueue.main.async {
                    self?.userName = json["name"] as? String
                    self?.userEmail = json["email"] as? String
                    DeskClient.defaults.set(self?.userName, forKey: "desk.userName")
                    DeskClient.defaults.set(self?.userEmail, forKey: "desk.userEmail")
                    self?.onChange?()
                }
            }.resume()
        }
    }

    // MARK: Envio

    struct Item {
        let file: URL
        let title: String
        let kind: String  // "imagem" ou "video"
        var fields: [String: String]
    }

    /// Título automático: "Print — Safari — 17/11/2026 14:32".
    static func title(kind: String, detail: String?, date: Date = Date()) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "dd/MM/yyyy HH:mm"
        var parts = [kind]
        if let d = detail, !d.isEmpty { parts.append(d) }
        parts.append(f.string(from: date))
        return parts.joined(separator: " — ")
    }

    /// Converte um print para o formato escolhido e envia.
    func sendImage(_ rep: NSBitmapImageRep, sourceApp: String?, completion: @escaping (Error?) -> Void) {
        let format = DeskClient.imageFormat
        let data: Data?
        switch format {
        case .png: data = rep.representation(using: .png, properties: [:])
        case .jpeg: data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.88])
        }
        guard let bytes = data else { completion(RecError.message("Não foi possível preparar a imagem.")); return }
        let name = Settings.newFileName().replacingOccurrences(of: ".png", with: ".\(format == .png ? "png" : "jpg")")
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do { try bytes.write(to: file) } catch { completion(error); return }
        let title = DeskClient.title(kind: "Print", detail: sourceApp)
        send(Item(file: file, title: title, kind: "imagem", fields: [
            "largura": "\(rep.pixelsWide)", "altura": "\(rep.pixelsHigh)", "formato": format.rawValue,
        ])) { error in
            try? FileManager.default.removeItem(at: file)
            completion(error)
        }
    }

    /// Envia uma gravação no formato escolhido (MOV é convertido sem recompressão).
    func sendVideo(_ url: URL, progress: @escaping (Double) -> Void, completion: @escaping (Error?) -> Void) {
        let asset = AVURLAsset(url: url)
        let duration = CMTimeGetSeconds(asset.duration)
        let markers = RecLibrary.markers(for: url)
        let markerJSON = (try? JSONSerialization.data(withJSONObject: markers.map { ["tempo": $0.time, "nome": $0.name] }))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        let created = (try? url.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? Date()
        let title = DeskClient.title(kind: "Gravação", detail: Recorder.format(duration), date: created)
        var fields = ["duracao": String(format: "%.1f", duration), "marcadores": markerJSON,
                      "formato": DeskClient.videoFormat.rawValue]
        if let v = asset.tracks(withMediaType: .video).first {
            fields["largura"] = "\(Int(v.naturalSize.width))"
            fields["altura"] = "\(Int(v.naturalSize.height))"
        }
        let upload: (URL, Bool) -> Void = { file, temporary in
            self.send(Item(file: file, title: title, kind: "video", fields: fields), progress: progress) { error in
                if temporary { try? FileManager.default.removeItem(at: file) }
                completion(error)
            }
        }
        if DeskClient.videoFormat == .mp4 { upload(url, false); return }
        // MOV: troca só o contêiner (rápido, sem perda).
        let mov = FileManager.default.temporaryDirectory
            .appendingPathComponent(url.deletingPathExtension().lastPathComponent + ".mov")
        try? FileManager.default.removeItem(at: mov)
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
            completion(RecError.message("Não foi possível converter para MOV.")); return
        }
        export.outputURL = mov
        export.outputFileType = .mov
        export.exportAsynchronously {
            DispatchQueue.main.async {
                if export.status == .completed { upload(mov, true) } else {
                    completion(export.error ?? RecError.message("Não foi possível converter para MOV."))
                }
            }
        }
    }

    /// Envia o arquivo e os campos conforme a configuração (método, formato, nomes dos campos).
    func send(_ item: Item, progress: ((Double) -> Void)? = nil, completion: @escaping (Error?) -> Void) {
        lastResponse = ""
        lastLink = nil
        guard let target = DeskClient.uploadURL else {
            completion(RecError.message("Defina o endereço do Desk nas Preferências › Convertize Desk."))
            return
        }
        // Sem criptografia, o token da conta só pode trafegar dentro da rede interna.
        if target.scheme?.lowercased() != "https", !DeskClient.isPrivateHost(target.host ?? "") {
            completion(RecError.message("Por segurança, o envio sem criptografia (http) só é permitido para "
                + "endereços da rede interna. Use https:// no endereço do Desk."))
            return
        }
        // Limite de tamanho configurado.
        let bytes = ((try? item.file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? nil) ?? 0
        let limit = item.kind == "video" ? DeskClient.maxVideoMB : DeskClient.maxImageMB
        if limit > 0, Double(bytes) > limit * 1_048_576 {
            let mb = String(format: "%.1f", Double(bytes) / 1_048_576)
            completion(RecError.message("O arquivo tem \(mb) MB e o limite configurado para \(item.kind == "video" ? "gravações" : "prints") é \(limit) MB."))
            return
        }
        withAccessToken { result in
            switch result {
            case .failure(let error):
                completion(error)
            case .success(let token):
                do {
                    let fields = DeskClient.resolvedFields(for: item, email: self.userEmail, name: self.userName)
                    let mime = DeskClient.mime(of: item.file)
                    var request = URLRequest(url: target)
                    let bodyFile: URL
                    var temporary = true
                    switch DeskClient.bodyFormat {
                    case "json":
                        var object: [String: Any] = [:]
                        for (k, v) in fields { object[k] = v }
                        object[DeskClient.fileField] = try Data(contentsOf: item.file).base64EncodedString()
                        object["nome_arquivo"] = item.file.lastPathComponent
                        object["tipo_mime"] = mime
                        bodyFile = FileManager.default.temporaryDirectory.appendingPathComponent("recorte-envio-\(UUID().uuidString)")
                        try JSONSerialization.data(withJSONObject: object).write(to: bodyFile)
                        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    case "raw":
                        var c = URLComponents(url: target, resolvingAgainstBaseURL: false)
                        let existing = c?.queryItems ?? []
                        c?.queryItems = existing + fields.map { URLQueryItem(name: $0.0, value: $0.1) }
                        request.url = c?.url ?? target
                        request.setValue(mime, forHTTPHeaderField: "Content-Type")
                        request.setValue(item.file.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                                         forHTTPHeaderField: "X-Nome-Arquivo")
                        bodyFile = item.file
                        temporary = false
                    default:
                        let body = try DeskClient.multipartFile(file: item.file, fields: fields, mime: mime)
                        bodyFile = body.file
                        request.setValue("multipart/form-data; boundary=\(body.boundary)", forHTTPHeaderField: "Content-Type")
                    }
                    request.httpMethod = DeskClient.method
                    let prefix = DeskClient.authPrefix
                    request.setValue(prefix.isEmpty || prefix == "-" ? token : "\(prefix) \(token)",
                                     forHTTPHeaderField: DeskClient.authHeader)
                    request.setValue("application/json", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 600
                    let task = URLSession.shared.uploadTask(with: request, fromFile: bodyFile) { data, response, error in
                        if temporary { try? FileManager.default.removeItem(at: bodyFile) }
                        DispatchQueue.main.async {
                            if let error = error {
                                self.lastResponse = error.localizedDescription
                                completion(RecError.message("Não foi possível conectar ao Desk (\(target.host ?? "")): \(error.localizedDescription)"))
                                return
                            }
                            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                            let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                            self.lastResponse = "\(DeskClient.method) \(request.url?.absoluteString ?? "") → \(status)\n\(text.prefix(400))"
                            if DeskClient.isSuccess(status) {
                                self.lastLink = DeskClient.link(in: data)
                                if item.kind == "imagem", let image = try? Data(contentsOf: item.file),
                                   let rep = NSBitmapImageRep(data: image),
                                   let png = rep.representation(using: .png, properties: [:]) {
                                    // Prints: copia a própria imagem (e não o link) para colar em qualquer lugar.
                                    DeskClient.copyImage(png: png, link: self.lastLink)
                                } else if let link = self.lastLink {
                                    let pb = NSPasteboard.general
                                    pb.clearContents()
                                    pb.setString(link, forType: .string)
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 2.3) {
                                        Toast.show("Link do Desk copiado", subtitle: link, duration: 2.5)
                                    }
                                }
                                completion(nil)
                            } else {
                                var hint = ""
                                switch status {
                                case 404: hint = " O caminho de envio não existe no Desk; confira com o gestor."
                                case 401, 403: hint = " O Desk recusou o token; confira o cabeçalho de autenticação e os escopos."
                                case 400, 415, 422: hint = " O Desk não aceitou o formato; confira o formato do corpo e os nomes dos campos."
                                case 413: hint = " Arquivo grande demais para o Desk."
                                case 405: hint = " O Desk não aceita o método \(DeskClient.method) neste endereço."
                                default: break
                                }
                                completion(RecError.message("O Desk respondeu \(status).\(hint) \(text.prefix(200))"))
                            }
                        }
                    }
                    if let progress = progress {
                        self.observations.append(task.progress.observe(\.fractionCompleted) { p, _ in
                            DispatchQueue.main.async { progress(p.fractionCompleted) }
                        })
                    }
                    task.resume()
                } catch {
                    completion(error)
                }
            }
        }
    }

    private var observations: [NSKeyValueObservation] = []

    /// Campos a enviar: cada linha "nome={variavel}" do modelo; valores vazios são omitidos.
    static func resolvedFields(for item: Item, email: String?, name: String?) -> [(String, String)] {
        var values = item.fields
        values["titulo"] = item.title
        values["tipo"] = item.kind
        values["origem"] = "Recorte (Mac)"
        values["data"] = ISO8601DateFormatter().string(from: Date())
        values["email"] = email ?? ""
        values["nome"] = name ?? ""
        values["arquivo"] = item.file.lastPathComponent
        values["visibilidade"] = isPublic ? publicValue : privateValue
        var out: [(String, String)] = []
        for line in fieldsTemplate.components(separatedBy: .newlines) {
            guard let eq = line.firstIndex(of: "=") else { continue }
            let key = line[..<eq].trimmingCharacters(in: .whitespaces)
            var value = String(line[line.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
            guard !key.isEmpty else { continue }
            for (k, v) in values { value = value.replacingOccurrences(of: "{\(k)}", with: v) }
            // Variáveis sem valor neste envio (ex.: {duracao} num print) somem.
            if value.contains("{"), value.contains("}") { continue }
            if value.isEmpty { continue }
            out.append((key, value))
        }
        // Visibilidade do link sempre vai, mesmo se não estiver na lista de campos.
        let vField = visibilityField
        if vField != "-", !out.contains(where: { $0.0 == vField }) {
            out.append((vField, values["visibilidade"] ?? privateValue))
        }
        return out
    }

    static func mime(of file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "mov": return "video/quicktime"
        default: return "video/mp4"
        }
    }

    /// Coloca a imagem na área de transferência. Com o link do Desk, também vai uma versão
    /// HTML (<img src="link">): e-mail e editores web colam a imagem hospedada no Desk;
    /// os demais apps colam a própria imagem. Não vai texto, para nunca colar só o link.
    static func copyImage(png: Data, link: String?) {
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setData(png, forType: .png)
        if let image = NSImage(data: png), let tiff = image.tiffRepresentation { pb.setData(tiff, forType: .tiff) }
        if let link = link, let url = URL(string: link), let scheme = url.scheme?.lowercased(),
           scheme == "https" || scheme == "http" {
            let safe = link.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "\"", with: "&quot;")
                .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
            pb.setString("<img src=\"\(safe)\" alt=\"Print\">", forType: .html)
        }
    }

    /// Procura o link na resposta JSON pelo caminho configurado (ex.: "url" ou "data.link").
    static func link(in data: Data?) -> String? {
        let path = linkKey
        guard !path.isEmpty, let data = data, var node = try? JSONSerialization.jsonObject(with: data) else { return nil }
        for key in path.split(separator: ".") {
            guard let dict = node as? [String: Any], let next = dict[String(key)] else { return nil }
            node = next
        }
        return node as? String
    }

    /// Monta o corpo multipart num arquivo temporário (vídeos grandes não vão para a memória).
    private static func multipartFile(file: URL, fields: [(String, String)], mime: String) throws -> (file: URL, boundary: String) {
        let boundary = "RecorteBoundary\(UUID().uuidString)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("recorte-envio-\(UUID().uuidString)")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let out = try FileHandle(forWritingTo: url)
        defer { out.closeFile() }
        func write(_ s: String) { out.write(Data(s.utf8)) }
        for (k, v) in fields {
            write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n")
        }
        let name = file.lastPathComponent.replacingOccurrences(of: "\"", with: "")
        write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(name)\"\r\nContent-Type: \(mime)\r\n\r\n")
        let input = try FileHandle(forReadingFrom: file)
        defer { input.closeFile() }
        while true {
            let chunk = input.readData(ofLength: 1_048_576)
            if chunk.isEmpty { break }
            out.write(chunk)
        }
        write("\r\n--\(boundary)--\r\n")
        return (url, boundary)
    }

    /// Envia uma imagem pequena de teste e devolve a resposta do Desk (Preferências).
    func sendTest(completion: @escaping (Bool, String) -> Void) {
        let size = NSSize(width: 320, height: 120)
        let image = NSImage(size: size, flipped: false) { rect in
            NSColor(calibratedRed: 0x1B / 255, green: 0x20 / 255, blue: 0x30 / 255, alpha: 1).setFill()
            rect.fill()
            let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 18, weight: .semibold),
                                                        .foregroundColor: NSColor.white]
            ("Teste do Recorte" as NSString).draw(at: NSPoint(x: 20, y: 46), withAttributes: attrs)
            return true
        }
        guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else {
            completion(false, "Não foi possível criar a imagem de teste.")
            return
        }
        sendImage(rep, sourceApp: "Teste") { error in
            let detail = self.lastResponse.isEmpty ? (error?.localizedDescription ?? "") : self.lastResponse
            completion(error == nil, error == nil ? "Enviado. \(detail)" : "\(error!.localizedDescription)\n\(detail)")
        }
    }

    /// Endereço da rede interna? (127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, localhost, *.local, nome sem ponto)
    static func isPrivateHost(_ host: String) -> Bool {
        let h = host.lowercased()
        if h == "localhost" || h.hasSuffix(".local") || (!h.isEmpty && !h.contains(".")) { return true }
        let parts = h.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4, h.split(separator: ".").count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }
        switch (parts[0], parts[1]) {
        case (127, _), (10, _), (192, 168), (169, 254): return true
        case (172, 16...31): return true
        default: return false
        }
    }

    // MARK: Utilidades

    private static func form(_ values: [String: String]) -> Data {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return Data(values.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }
            .joined(separator: "&").utf8)
    }

    static func randomURLSafe(_ count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        return base64URL(Data(bytes))
    }

    static func base64URL(_ data: Data) -> String {
        return data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func sha256(_ data: Data) -> Data {
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        data.withUnsafeBytes { raw in
            _ = CC_SHA256(raw.baseAddress, CC_LONG(data.count), &digest)
        }
        return Data(digest)
    }
}

/// Refresh token no Keychain do macOS (nunca em arquivo ou UserDefaults).
enum Keychain {
    private static let service = "br.com.convertize.recorte.desk"
    private static let account = "refresh_token"

    static var refreshToken: String? {
        get {
            let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                        kSecAttrService as String: service, kSecAttrAccount as String: account,
                                        kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
            var out: AnyObject?
            guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
            return String(data: data, encoding: .utf8)
        }
        set {
            let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                       kSecAttrService as String: service, kSecAttrAccount as String: account]
            SecItemDelete(base as CFDictionary)
            guard let v = newValue else { return }
            var add = base
            add[kSecValueData as String] = Data(v.utf8)
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }
}
