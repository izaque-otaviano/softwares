import Cocoa
import Carbon

/// Registra um atalho global usando a API Carbon (funciona do 10.6 em diante
/// e não exige permissão de Acessibilidade).
final class HotKeyManager {
    static let shared = HotKeyManager()

    var onPress: (() -> Void)?

    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?

    private init() {}

    func installHandler() {
        guard handlerRef == nil else { return }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, _, _ -> OSStatus in
            DispatchQueue.main.async {
                HotKeyManager.shared.onPress?()
            }
            return noErr
        }, 1, &spec, nil, &handlerRef)
    }

    /// Retorna `true` se o atalho foi registrado com sucesso.
    @discardableResult
    func register(_ shortcut: Shortcut) -> Bool {
        unregister()
        let hotKeyID = EventHotKeyID(signature: OSType(0x5243_5254), id: 1) // 'RCRT'
        let status = RegisterEventHotKey(shortcut.keyCode,
                                         shortcut.carbonModifiers,
                                         hotKeyID,
                                         GetApplicationEventTarget(),
                                         0,
                                         &hotKeyRef)
        return status == noErr
    }

    func unregister() {
        if let ref = hotKeyRef {
            UnregisterEventHotKey(ref)
            hotKeyRef = nil
        }
    }
}
