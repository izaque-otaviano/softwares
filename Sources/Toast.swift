import Cocoa

/// Aviso rápido e translúcido (estilo HUD do macOS), ex.: "Copiado".
final class Toast {
    private static var current: NSWindow?

    static func show(_ title: String, subtitle: String? = nil, duration: TimeInterval = 1.6) {
        current?.orderOut(nil)

        let titleLabel = NSTextField(labelWithString: title)
        titleLabel.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        titleLabel.textColor = .labelColor
        var views: [NSView] = [titleLabel]
        if let subtitle = subtitle {
            let s = NSTextField(labelWithString: subtitle)
            s.font = NSFont.systemFont(ofSize: 12)
            s.textColor = .secondaryLabelColor
            s.lineBreakMode = .byTruncatingMiddle
            views.append(s)
        }
        let icon = NSImageView(image: Icons.check)
        icon.contentTintColor = .controlAccentColor
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 22).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 22).isActive = true

        let texts = NSStackView(views: views)
        texts.orientation = .vertical
        texts.alignment = .leading
        texts.spacing = 2
        let row = NSStackView(views: [icon, texts])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 10
        row.translatesAutoresizingMaskIntoConstraints = false

        let effect = NSVisualEffectView()
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active
        effect.maskImage = Icons.roundedMask(radius: 14)
        effect.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: effect.leadingAnchor, constant: 16),
            row.trailingAnchor.constraint(equalTo: effect.trailingAnchor, constant: -20),
            row.topAnchor.constraint(equalTo: effect.topAnchor, constant: 12),
            row.bottomAnchor.constraint(equalTo: effect.bottomAnchor, constant: -12),
            row.widthAnchor.constraint(lessThanOrEqualToConstant: 380),
        ])
        effect.layoutSubtreeIfNeeded()
        let size = effect.fittingSize

        let screen = NSScreen.screens.first(where: { NSMouseInRect(NSEvent.mouseLocation, $0.frame, false) })
            ?? NSScreen.main
        let area = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        let frame = NSRect(x: area.midX - size.width / 2, y: area.minY + 90, width: size.width, height: size.height)

        let window = NSWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.level = .statusBar
        window.ignoresMouseEvents = true
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.canJoinAllSpaces, .transient]
        window.contentView = effect
        window.alphaValue = 0
        window.orderFrontRegardless()
        current = window

        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.15
            window.animator().alphaValue = 1
        }, completionHandler: nil)

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.3
                window.animator().alphaValue = 0
            }, completionHandler: {
                window.orderOut(nil)
                if current === window { current = nil }
            })
        }
    }
}
