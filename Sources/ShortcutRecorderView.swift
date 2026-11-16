import Cocoa
import Carbon

/// Campo em que o usuário clica e pressiona a combinação de teclas desejada.
final class ShortcutRecorderView: NSView {
    var shortcut: Shortcut = Shortcut.standard {
        didSet {
            needsDisplay = true
            setAccessibilityValue(shortcut.displayString)
        }
    }
    var onChange: ((Shortcut) -> Void)?
    var onRecordingChange: ((Bool) -> Void)?

    private(set) var isRecording = false {
        didSet {
            guard oldValue != isRecording else { return }
            needsDisplay = true
            onRecordingChange?(isRecording)
        }
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        setAccessibilityRole(.button)
        setAccessibilityLabel("Atalho de captura")
        toolTip = "Clique e pressione a nova combinação de teclas"
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) não é usado")
    }

    override var intrinsicContentSize: NSSize { return NSSize(width: 180, height: 28) }
    override var acceptsFirstResponder: Bool { return true }
    override var focusRingMaskBounds: NSRect { return bounds }

    override func drawFocusRingMask() {
        NSBezierPath(roundedRect: bounds.insetBy(dx: 1, dy: 1), xRadius: 6, yRadius: 6).fill()
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)
        isRecording = !isRecording
    }

    override func resignFirstResponder() -> Bool {
        isRecording = false
        return super.resignFirstResponder()
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if isRecording && window?.firstResponder === self {
            handle(event)
            return true
        }
        return super.performKeyEquivalent(with: event)
    }

    override func keyDown(with event: NSEvent) {
        if isRecording {
            handle(event)
        } else if Int(event.keyCode) == kVK_Space || Int(event.keyCode) == kVK_Return {
            isRecording = true
        } else {
            super.keyDown(with: event)
        }
    }

    private func handle(_ event: NSEvent) {
        let code = Int(event.keyCode)
        let mods = event.modifierFlags.intersection(Shortcut.relevantModifiers)

        if mods.isEmpty {
            if code == kVK_Escape {
                isRecording = false
                return
            }
            if code == kVK_Delete || code == kVK_ForwardDelete {
                shortcut = Shortcut.standard
                onChange?(shortcut)
                isRecording = false
                return
            }
        }

        // Exige ⌘, ⌥ ou ⌃ (as teclas F1–F20 podem ser usadas sozinhas).
        let hasMainModifier = !mods.subtracting(.shift).isEmpty
        guard hasMainModifier || Shortcut.isFunctionKey(code) else {
            NSSound.beep()
            return
        }

        shortcut = Shortcut(keyCode: UInt32(code), modifiers: mods)
        onChange?(shortcut)
        isRecording = false
    }

    override func draw(_ dirtyRect: NSRect) {
        let rect = bounds.insetBy(dx: 1, dy: 1)
        let path = NSBezierPath(roundedRect: rect, xRadius: 6, yRadius: 6)
        NSColor.controlBackgroundColor.setFill()
        path.fill()
        path.lineWidth = isRecording ? 2 : 1
        (isRecording ? NSColor.controlAccentColor : NSColor.separatorColor).setStroke()
        path.stroke()

        let text: String
        let color: NSColor
        let font: NSFont
        if isRecording {
            text = "Pressione o atalho…"
            color = .secondaryLabelColor
            font = NSFont.systemFont(ofSize: 13)
        } else {
            text = shortcut.displayString
            color = .labelColor
            font = NSFont.systemFont(ofSize: 14, weight: .medium)
        }
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let size = (text as NSString).size(withAttributes: attrs)
        (text as NSString).draw(at: NSPoint(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2),
                                withAttributes: attrs)
    }
}
