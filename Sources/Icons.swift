import Cocoa

/// Ícones desenhados em código (SF Symbols não existem no macOS 10.14).
/// Todos são "template images", então se adaptam ao modo claro/escuro.
enum Icons {
    static func make(size: CGFloat = 20, _ draw: @escaping (NSRect) -> Void) -> NSImage {
        let image = NSImage(size: NSSize(width: size, height: size), flipped: false) { rect in
            NSColor.black.set()
            draw(rect)
            return true
        }
        image.isTemplate = true
        return image
    }

    private static func stroke(_ path: NSBezierPath, _ width: CGFloat = 1.6) {
        path.lineWidth = width
        path.lineCapStyle = roundLineCap
        path.lineJoinStyle = roundLineJoin
        path.stroke()
    }

    static let arrow = make { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 4.5, y: 4.5))
        p.line(to: NSPoint(x: 15, y: 15))
        p.move(to: NSPoint(x: 8.5, y: 15.2))
        p.line(to: NSPoint(x: 15.2, y: 15.2))
        p.line(to: NSPoint(x: 15.2, y: 8.5))
        Icons.stroke(p)
    }

    static let rectangle = make { _ in
        Icons.stroke(NSBezierPath(roundedRect: NSRect(x: 3.5, y: 5.5, width: 13, height: 9), xRadius: 2, yRadius: 2))
    }

    static let ellipse = make { _ in
        Icons.stroke(NSBezierPath(ovalIn: NSRect(x: 3, y: 4.5, width: 14, height: 11)))
    }

    static let highlight = make { _ in
        let r = NSRect(x: 3, y: 5.5, width: 14, height: 9)
        NSColor.black.withAlphaComponent(0.35).setFill()
        NSBezierPath(roundedRect: r, xRadius: 2, yRadius: 2).fill()
        NSColor.black.setStroke()
        Icons.stroke(NSBezierPath(roundedRect: r, xRadius: 2, yRadius: 2), 1.2)
    }

    static let pen = make { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 3, y: 7))
        p.curve(to: NSPoint(x: 17, y: 12),
                controlPoint1: NSPoint(x: 7, y: 19),
                controlPoint2: NSPoint(x: 11, y: -1))
        Icons.stroke(p, 1.8)
    }

    static let text = make { rect in
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: 15, weight: .semibold),
            .foregroundColor: NSColor.black,
        ]
        let s = "A" as NSString
        let size = s.size(withAttributes: attrs)
        s.draw(at: NSPoint(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2), withAttributes: attrs)
    }

    private static func curvedArrow() {
        let center = NSPoint(x: 11, y: 9)
        let radius: CGFloat = 5.5
        let endAngle: CGFloat = 160
        let p = NSBezierPath()
        p.appendArc(withCenter: center, radius: radius, startAngle: -70, endAngle: endAngle, clockwise: false)
        Icons.stroke(p)
        let rad = endAngle * .pi / 180
        let tip = NSPoint(x: center.x + cos(rad) * radius, y: center.y + sin(rad) * radius)
        // direção da tangente (sentido anti-horário) no fim do arco
        let dir = rad + .pi / 2
        let head = NSBezierPath()
        let len: CGFloat = 4
        for spread in [CGFloat(0.6), CGFloat(-0.6)] {
            let a = dir + .pi + spread
            head.move(to: tip)
            head.line(to: NSPoint(x: tip.x + cos(a) * len, y: tip.y + sin(a) * len))
        }
        Icons.stroke(head)
    }

    static let undo = make { _ in
        Icons.curvedArrow()
    }

    static let redo = make { rect in
        let t = NSAffineTransform()
        t.translateX(by: rect.width, yBy: 0)
        t.scaleX(by: -1, yBy: 1)
        t.concat()
        Icons.curvedArrow()
    }

    /// Ícone da barra de menus: um "visor" com uma pequena seta.
    static let menuBar = make(size: 18) { _ in
        let c = NSBezierPath()
        let l: CGFloat = 4.5
        // cantos
        c.move(to: NSPoint(x: 2, y: 2 + l)); c.line(to: NSPoint(x: 2, y: 2)); c.line(to: NSPoint(x: 2 + l, y: 2))
        c.move(to: NSPoint(x: 16 - l, y: 2)); c.line(to: NSPoint(x: 16, y: 2)); c.line(to: NSPoint(x: 16, y: 2 + l))
        c.move(to: NSPoint(x: 16, y: 16 - l)); c.line(to: NSPoint(x: 16, y: 16)); c.line(to: NSPoint(x: 16 - l, y: 16))
        c.move(to: NSPoint(x: 2 + l, y: 16)); c.line(to: NSPoint(x: 2, y: 16)); c.line(to: NSPoint(x: 2, y: 16 - l))
        Icons.stroke(c, 1.5)
        let a = NSBezierPath()
        a.move(to: NSPoint(x: 6.5, y: 6.5)); a.line(to: NSPoint(x: 11.5, y: 11.5))
        a.move(to: NSPoint(x: 8, y: 11.7)); a.line(to: NSPoint(x: 11.7, y: 11.7)); a.line(to: NSPoint(x: 11.7, y: 8))
        Icons.stroke(a, 1.5)
    }

    /// Máscara com cantos arredondados para NSVisualEffectView.
    static func roundedMask(radius: CGFloat) -> NSImage {
        let edge = radius * 2 + 1
        let image = NSImage(size: NSSize(width: edge, height: edge), flipped: false) { rect in
            NSColor.black.setFill()
            NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
            return true
        }
        image.capInsets = NSEdgeInsets(top: radius, left: radius, bottom: radius, right: radius)
        image.resizingMode = .stretch
        return image
    }

    /// Desenha uma imagem template tingida com a cor indicada.
    static func drawTinted(_ image: NSImage, in rect: NSRect, color: NSColor) {
        let tinted = NSImage(size: image.size, flipped: false) { r in
            image.draw(in: r)
            color.set()
            r.fill(using: .sourceAtop)
            return true
        }
        tinted.draw(in: rect)
    }
}
