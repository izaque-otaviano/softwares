import Cocoa
import Carbon

/// Registra atalhos globais usando a API Carbon (funciona do 10.6 em diante
/// e não exige permissão de Acessibilidade).
final class HotKeyManager {
    enum Action: UInt32 {
        case capture = 1
        case copyText = 2
        case recordToggle = 3
        case recordLastArea = 4
        case recordPause = 5
        case recordMarker = 6
        case recordWebcam = 7
    }

    static let shared = HotKeyManager()

    var onPress: ((Action) -> Void)?

    private var refs: [Action: EventHotKeyRef] = [:]
    private var handlerRef: EventHandlerRef?

    private init() {}

    func installHandler() {
        guard handlerRef == nil else { return }
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ -> OSStatus in
            var hotKeyID = EventHotKeyID()
            let status = GetEventParameter(event, EventParamName(kEventParamDirectObject),
                                           EventParamType(typeEventHotKeyID), nil,
                                           MemoryLayout<EventHotKeyID>.size, nil, &hotKeyID)
            let action = HotKeyManager.Action(rawValue: status == noErr ? hotKeyID.id : 1) ?? .capture
            DispatchQueue.main.async {
                HotKeyManager.shared.onPress?(action)
            }
            return noErr
        }, 1, &spec, nil, &handlerRef)
    }

    /// Retorna `true` se o atalho foi registrado com sucesso.
    @discardableResult
    func register(_ shortcut: Shortcut, for action: Action) -> Bool {
        unregister(action)
        let hotKeyID = EventHotKeyID(signature: OSType(0x5243_5254), id: action.rawValue) // 'RCRT'
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(shortcut.keyCode,
                                         shortcut.carbonModifiers,
                                         hotKeyID,
                                         GetApplicationEventTarget(),
                                         0,
                                         &ref)
        if status == noErr, let ref = ref { refs[action] = ref }
        return status == noErr
    }

    func unregister(_ action: Action) {
        if let ref = refs[action] {
            UnregisterEventHotKey(ref)
            refs[action] = nil
        }
    }

    func unregisterAll() {
        for action in Array(refs.keys) { unregister(action) }
    }
}
