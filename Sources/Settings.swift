import Cocoa

/// Preferências do usuário, guardadas em UserDefaults.
enum Settings {
    private static let defaults = UserDefaults.standard

    private enum Key {
        static let keyCode = "shortcutKeyCode"
        static let modifiers = "shortcutModifiers"
        static let textKeyCode = "textShortcutKeyCode"
        static let textModifiers = "textShortcutModifiers"
        static let saveFolder = "saveFolder"
        static let saveOnDone = "saveOnDone"
        static let launchedBefore = "launchedBefore"
        static let lastTool = "lastTool"
        static let lastColor = "lastColor"
        static let lastWidth = "lastWidth"
    }

    static func registerDefaults() {
        defaults.register(defaults: [
            Key.saveOnDone: true,
            Key.lastTool: Tool.arrow.rawValue,
            Key.lastColor: 0,
            Key.lastWidth: 1,
        ])
    }

    static var shortcut: Shortcut {
        get {
            guard defaults.object(forKey: Key.keyCode) != nil else { return Shortcut.standard }
            let code = UInt32(defaults.integer(forKey: Key.keyCode))
            let mods = NSEvent.ModifierFlags(rawValue: UInt(defaults.integer(forKey: Key.modifiers)))
            return Shortcut(keyCode: code, modifiers: mods)
        }
        set {
            defaults.set(Int(newValue.keyCode), forKey: Key.keyCode)
            defaults.set(Int(newValue.modifiers.rawValue), forKey: Key.modifiers)
        }
    }

    /// Atalho para "copiar texto da tela" (OCR direto). Padrão ⇧⌘1.
    static var textShortcut: Shortcut {
        get {
            guard defaults.object(forKey: Key.textKeyCode) != nil else { return Shortcut.standardText }
            let code = UInt32(defaults.integer(forKey: Key.textKeyCode))
            let mods = NSEvent.ModifierFlags(rawValue: UInt(defaults.integer(forKey: Key.textModifiers)))
            return Shortcut(keyCode: code, modifiers: mods)
        }
        set {
            defaults.set(Int(newValue.keyCode), forKey: Key.textKeyCode)
            defaults.set(Int(newValue.modifiers.rawValue), forKey: Key.textModifiers)
        }
    }

    static var saveFolder: URL {
        get {
            if let path = defaults.string(forKey: Key.saveFolder) {
                return URL(fileURLWithPath: path, isDirectory: true)
            }
            return FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
        }
        set { defaults.set(newValue.path, forKey: Key.saveFolder) }
    }

    static var saveOnDone: Bool {
        get { return defaults.bool(forKey: Key.saveOnDone) }
        set { defaults.set(newValue, forKey: Key.saveOnDone) }
    }

    static var launchedBefore: Bool {
        get { return defaults.bool(forKey: Key.launchedBefore) }
        set { defaults.set(newValue, forKey: Key.launchedBefore) }
    }

    static var lastTool: Tool {
        get { return Tool(rawValue: defaults.integer(forKey: Key.lastTool)) ?? .arrow }
        set { defaults.set(newValue.rawValue, forKey: Key.lastTool) }
    }

    static var lastColorIndex: Int {
        get { return defaults.integer(forKey: Key.lastColor) }
        set { defaults.set(newValue, forKey: Key.lastColor) }
    }

    static var lastWidthIndex: Int {
        get { return defaults.integer(forKey: Key.lastWidth) }
        set { defaults.set(newValue, forKey: Key.lastWidth) }
    }

    static func newFileName() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "yyyy-MM-dd 'às' HH.mm.ss"
        return "Recorte \(f.string(from: Date())).png"
    }
}
