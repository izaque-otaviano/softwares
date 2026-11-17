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

    static let issuer = "https://auth.convertize.com.br"
    static let clientID = "convertize-print-mac"
    static let scopes = "openid profile email desk.capturas"

    enum ImageFormat: String, CaseIterable { case png, jpeg }
    enum VideoFormat: String, CaseIterable { case mp4, mov }

    // MARK: Preferências

    private static let defaults = UserDefaults.standard

    /// Endereço do Desk: IP ou URL (ex.: 192.168.0.20:8000 ou https://desk.convertize.com.br).
    static var serverAddress: String {
        get { return defaults.string(forKey: "desk.server") ?? "" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "desk.server") }
    }

    static var uploadPath: String {
        get { return defaults.string(forKey: "desk.path") ?? "/api/capturas/" }
        set { defaults.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: "desk.path") }
    }

    static var imageFormat: ImageFormat {
        get { return ImageFormat(rawValue: defaults.string(forKey: "desk.imageFormat") ?? "") ?? .png }
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
            address = "http://" + address
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
            listener = try NWListener(using: .tcp, on: .any)
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

    /// POST multipart/form-data com o arquivo e os dados, autenticado com o token da Convertize.
    func send(_ item: Item, progress: ((Double) -> Void)? = nil, completion: @escaping (Error?) -> Void) {
        guard let target = DeskClient.uploadURL else {
            completion(RecError.message("Defina o endereço do Desk nas Preferências › Convertize Desk."))
            return
        }
        withAccessToken { result in
            switch result {
            case .failure(let error):
                completion(error)
            case .success(let token):
                do {
                    let body = try DeskClient.multipartFile(for: item, sender: self.userEmail)
                    var request = URLRequest(url: target)
                    request.httpMethod = "POST"
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    request.setValue("multipart/form-data; boundary=\(body.boundary)", forHTTPHeaderField: "Content-Type")
                    request.timeoutInterval = 600
                    let task = URLSession.shared.uploadTask(with: request, fromFile: body.file) { data, response, error in
                        try? FileManager.default.removeItem(at: body.file)
                        DispatchQueue.main.async {
                            if let error = error {
                                completion(RecError.message("Não foi possível conectar ao Desk (\(target.host ?? "")): \(error.localizedDescription)"))
                                return
                            }
                            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                            if (200..<300).contains(status) {
                                completion(nil)
                            } else {
                                let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                                completion(RecError.message("O Desk respondeu \(status). \(text.prefix(200))"))
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

    /// Monta o corpo multipart num arquivo temporário (vídeos grandes não vão para a memória).
    private static func multipartFile(for item: Item, sender: String?) throws -> (file: URL, boundary: String) {
        let boundary = "RecorteBoundary\(UUID().uuidString)"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("recorte-envio-\(UUID().uuidString)")
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let out = try FileHandle(forWritingTo: url)
        defer { out.closeFile() }
        func write(_ s: String) { out.write(Data(s.utf8)) }
        var fields = item.fields
        fields["titulo"] = item.title
        fields["tipo"] = item.kind
        fields["origem"] = "Recorte (Mac)"
        fields["criado_em"] = ISO8601DateFormatter().string(from: Date())
        if let s = sender { fields["enviado_por"] = s }
        for (k, v) in fields.sorted(by: { $0.key < $1.key }) {
            write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n")
        }
        let name = item.file.lastPathComponent.replacingOccurrences(of: "\"", with: "")
        let mime: String
        switch item.file.pathExtension.lowercased() {
        case "png": mime = "image/png"
        case "jpg", "jpeg": mime = "image/jpeg"
        case "mov": mime = "video/quicktime"
        default: mime = "video/mp4"
        }
        write("--\(boundary)\r\nContent-Disposition: form-data; name=\"arquivo\"; filename=\"\(name)\"\r\nContent-Type: \(mime)\r\n\r\n")
        let input = try FileHandle(forReadingFrom: item.file)
        defer { input.closeFile() }
        while true {
            let chunk = input.readData(ofLength: 1_048_576)
            if chunk.isEmpty { break }
            out.write(chunk)
        }
        write("\r\n--\(boundary)--\r\n")
        return (url, boundary)
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
