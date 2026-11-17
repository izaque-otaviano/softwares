import Cocoa
import AVFoundation
import Carbon

/// Como a área de gravação é escolhida.
enum RecAreaMode: String, Codable, CaseIterable {
    case fullScreen, lastArea, select

    var title: String {
        switch self {
        case .fullScreen: return "Tela inteira"
        case .lastArea: return "Última área usada"
        case .select: return "Selecionar a cada gravação"
        }
    }
}

enum RecVideoQuality: String, Codable, CaseIterable {
    case light, standard, high

    var title: String {
        switch self {
        case .light: return "Leve — até 720p · 30 fps"
        case .standard: return "Padrão — até 1080p · 30 fps"
        case .high: return "Alta — resolução nativa · 60 fps"
        }
    }

    /// Altura máxima do vídeo (nil = resolução nativa da área).
    var maxHeight: Int? {
        switch self {
        case .light: return 720
        case .standard: return 1080
        case .high: return nil
        }
    }

    var fps: Int { return self == .high ? 60 : 30 }

    /// Bits por pixel por quadro (H.264). Define o bitrate de acordo com o tamanho.
    var bitsPerPixel: Double {
        switch self {
        case .light: return 0.09
        case .standard: return 0.10
        case .high: return 0.08
        }
    }
}

enum RecAudioQuality: String, Codable, CaseIterable {
    case voice, standard, high

    var title: String {
        switch self {
        case .voice: return "Voz — AAC 96 kbps"
        case .standard: return "Padrão — AAC 128 kbps"
        case .high: return "Alta — AAC 192 kbps"
        }
    }

    var bitrate: Int {
        switch self {
        case .voice: return 96_000
        case .standard: return 128_000
        case .high: return 192_000
        }
    }
}

enum WebcamPosition: String, Codable, CaseIterable {
    case bottomRight, bottomLeft, topRight, topLeft

    var title: String {
        switch self {
        case .bottomRight: return "Inferior direita"
        case .bottomLeft: return "Inferior esquerda"
        case .topRight: return "Superior direita"
        case .topLeft: return "Superior esquerda"
        }
    }
}

enum WebcamSize: String, Codable, CaseIterable {
    case small, medium, large

    var title: String {
        switch self {
        case .small: return "Pequena"
        case .medium: return "Média"
        case .large: return "Grande"
        }
    }

    /// Fração da largura do vídeo.
    var fraction: CGFloat {
        switch self {
        case .small: return 0.16
        case .medium: return 0.22
        case .large: return 0.30
        }
    }
}

/// Perfil de gravação editável ("Reunião", "Treinamento", "Tutorial").
struct RecProfile: Codable, Equatable {
    var name: String
    var areaMode: RecAreaMode
    /// Tela para "tela inteira" (nil = a tela onde está o mouse).
    var displayID: UInt32?
    var systemAudio: Bool
    var systemVolume: Float
    var microphone: Bool
    var micDeviceUID: String?
    var micVolume: Float
    var videoQuality: RecVideoQuality
    var audioQuality: RecAudioQuality
    /// Pasta de saída (nil = Filmes/Recorte).
    var outputFolder: String?
    var countdown: Bool
    var clickHighlight: Bool
    var webcam: Bool
    var cameraUID: String?
    var webcamPosition: WebcamPosition
    var webcamSize: WebcamSize
    /// Mostrar o cursor no vídeo (nil = sim; campo novo, compatível com perfis antigos).
    var showCursor: Bool? = nil

    static let names = ["Reunião", "Treinamento", "Tutorial"]

    static func standard(_ name: String) -> RecProfile {
        var p = RecProfile(name: name, areaMode: .fullScreen, displayID: nil,
                           systemAudio: true, systemVolume: 1, microphone: true, micDeviceUID: nil, micVolume: 1,
                           videoQuality: .standard, audioQuality: .standard, outputFolder: nil,
                           countdown: false, clickHighlight: false,
                           webcam: false, cameraUID: nil, webcamPosition: .bottomRight, webcamSize: .medium)
        switch name {
        case "Treinamento":
            p.areaMode = .lastArea
        case "Tutorial":
            p.areaMode = .select
            p.countdown = true
            p.clickHighlight = true
            p.audioQuality = .voice
        default:
            break
        }
        return p
    }

    var outputFolderURL: URL {
        if let path = outputFolder { return URL(fileURLWithPath: path, isDirectory: true) }
        let movies = FileManager.default.urls(for: .moviesDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Movies")
        return movies.appendingPathComponent("Recorte", isDirectory: true)
    }
}

/// Última área gravada: tela + retângulo em pontos (origem no canto inferior esquerdo da tela).
struct RecLastArea: Codable {
    var displayID: UInt32
    var screenWidth: CGFloat
    var screenHeight: CGFloat
    var x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat

    var rect: NSRect { return NSRect(x: x, y: y, width: width, height: height) }

    /// A tela correspondente, se ainda existir com o mesmo tamanho e a área couber nela.
    func validScreen() -> NSScreen? {
        guard let screen = NSScreen.screens.first(where: { $0.displayID == displayID }) else { return nil }
        let size = screen.frame.size
        guard abs(size.width - screenWidth) < 1, abs(size.height - screenHeight) < 1 else { return nil }
        guard NSRect(origin: .zero, size: size).contains(rect), width >= 16, height >= 16 else { return nil }
        return screen
    }
}

extension NSScreen {
    var displayID: UInt32 {
        let key = NSDeviceDescriptionKey("NSScreenNumber")
        return (deviceDescription[key] as? NSNumber)?.uint32Value ?? CGMainDisplayID()
    }

    var recorteName: String {
        let index = (NSScreen.screens.firstIndex(of: self) ?? 0) + 1
        var name = "Tela \(index)"
        if #available(macOS 10.15, *) { name = localizedName }
        let w = Int(frame.width * backingScaleFactor), h = Int(frame.height * backingScaleFactor)
        return "\(name) — \(w)×\(h)"
    }
}

/// Ações de gravação com atalho global.
enum RecShortcut: String, CaseIterable {
    case toggle, lastArea, pause, marker, webcam

    var title: String {
        switch self {
        case .toggle: return "Iniciar / parar gravação:"
        case .lastArea: return "Gravar última área:"
        case .pause: return "Pausar / retomar:"
        case .marker: return "Adicionar marcador:"
        case .webcam: return "Mostrar / ocultar webcam:"
        }
    }

    var standard: Shortcut {
        let mods: NSEvent.ModifierFlags = [.command, .option, .shift]
        switch self {
        case .toggle: return Shortcut(keyCode: UInt32(kVK_ANSI_R), modifiers: mods)
        case .lastArea: return Shortcut(keyCode: UInt32(kVK_ANSI_L), modifiers: mods)
        case .pause: return Shortcut(keyCode: UInt32(kVK_ANSI_P), modifiers: mods)
        case .marker: return Shortcut(keyCode: UInt32(kVK_ANSI_M), modifiers: mods)
        case .webcam: return Shortcut(keyCode: UInt32(kVK_ANSI_W), modifiers: mods)
        }
    }

    var hotKeyAction: HotKeyManager.Action {
        switch self {
        case .toggle: return .recordToggle
        case .lastArea: return .recordLastArea
        case .pause: return .recordPause
        case .marker: return .recordMarker
        case .webcam: return .recordWebcam
        }
    }
}

enum RecSettings {
    private static let defaults = UserDefaults.standard

    static var currentProfileName: String {
        get { return defaults.string(forKey: "rec.profile").flatMap { RecProfile.names.contains($0) ? $0 : nil } ?? "Reunião" }
        set { defaults.set(newValue, forKey: "rec.profile") }
    }

    static func profile(_ name: String) -> RecProfile {
        if let data = defaults.data(forKey: "rec.profile.\(name)"),
           let p = try? JSONDecoder().decode(RecProfile.self, from: data) {
            return p
        }
        return RecProfile.standard(name)
    }

    static func save(_ profile: RecProfile) {
        if let data = try? JSONEncoder().encode(profile) {
            defaults.set(data, forKey: "rec.profile.\(profile.name)")
        }
    }

    static func resetProfile(_ name: String) {
        defaults.removeObject(forKey: "rec.profile.\(name)")
    }

    static var current: RecProfile {
        get { return profile(currentProfileName) }
        set { save(newValue) }
    }

    static var lastArea: RecLastArea? {
        get {
            guard let data = defaults.data(forKey: "rec.lastArea") else { return nil }
            return try? JSONDecoder().decode(RecLastArea.self, from: data)
        }
        set {
            if let v = newValue, let data = try? JSONEncoder().encode(v) {
                defaults.set(data, forKey: "rec.lastArea")
            } else {
                defaults.removeObject(forKey: "rec.lastArea")
            }
        }
    }

    static func shortcut(_ s: RecShortcut) -> Shortcut {
        guard defaults.object(forKey: "rec.key.\(s.rawValue)") != nil else { return s.standard }
        let code = UInt32(defaults.integer(forKey: "rec.key.\(s.rawValue)"))
        let mods = NSEvent.ModifierFlags(rawValue: UInt(defaults.integer(forKey: "rec.mods.\(s.rawValue)")))
        return Shortcut(keyCode: code, modifiers: mods)
    }

    static func setShortcut(_ value: Shortcut, for s: RecShortcut) {
        defaults.set(Int(value.keyCode), forKey: "rec.key.\(s.rawValue)")
        defaults.set(Int(value.modifiers.rawValue), forKey: "rec.mods.\(s.rawValue)")
    }

    /// Todos os atalhos do app (capturas + gravação), para detectar conflitos.
    static func allShortcuts() -> [(String, Shortcut)] {
        var list: [(String, Shortcut)] = [
            ("Capturar área", Settings.shortcut),
            ("Copiar texto da tela", Settings.textShortcut),
        ]
        for s in RecShortcut.allCases {
            list.append((String(s.title.dropLast()), shortcut(s)))
        }
        return list
    }

    /// Nome da ação que já usa este atalho (ignorando `except`), ou nil.
    static func conflict(for value: Shortcut, except: String) -> String? {
        return allShortcuts().first(where: { $0.0 != except && $0.1 == value })?.0
    }
}

/// Tamanho, fps e bitrate efetivos para uma área de captura (em pixels).
struct RecVideoFormat {
    let width: Int
    let height: Int
    let fps: Int
    let bitrate: Int

    init(capturePixels: CGSize, quality: RecVideoQuality) {
        var w = capturePixels.width, h = capturePixels.height
        if let maxH = quality.maxHeight, h > CGFloat(maxH) {
            w = w * CGFloat(maxH) / h
            h = CGFloat(maxH)
        }
        // H.264: dimensões pares; limite prático de 4096 px de largura.
        if w > 4096 { h = h * 4096 / w; w = 4096 }
        width = max(16, Int(w) / 2 * 2)
        height = max(16, Int(h) / 2 * 2)
        fps = quality.fps
        let bits = Double(width * height * fps) * quality.bitsPerPixel
        bitrate = Int(min(max(bits, 1_000_000), 40_000_000))
    }

    var summary: String {
        let mbps = String(format: "%.1f", Double(bitrate) / 1_000_000).replacingOccurrences(of: ".", with: ",")
        return "\(width)×\(height) · \(fps) fps · \(mbps) Mbps"
    }
}
