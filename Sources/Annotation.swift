import Cocoa

enum Tool: Int, CaseIterable {
    case arrow, rectangle, ellipse, highlight, pen, text

    var title: String {
        switch self {
        case .arrow: return "Seta (A)"
        case .rectangle: return "Retângulo (R)"
        case .ellipse: return "Círculo (O)"
        case .highlight: return "Destacar área (H)"
        case .pen: return "Caneta (P)"
        case .text: return "Texto (T)"
        }
    }

    var key: String {
        switch self {
        case .arrow: return "a"
        case .rectangle: return "r"
        case .ellipse: return "o"
        case .highlight: return "h"
        case .pen: return "p"
        case .text: return "t"
        }
    }

    var icon: NSImage {
        switch self {
        case .arrow: return Icons.arrow
        case .rectangle: return Icons.rectangle
        case .ellipse: return Icons.ellipse
        case .highlight: return Icons.highlight
        case .pen: return Icons.pen
        case .text: return Icons.text
        }
    }
}

/// Uma marcação desenhada sobre a captura. As coordenadas estão no espaço
/// da imagem (pontos, origem no canto inferior esquerdo).
final class Annotation {
    let tool: Tool
    let color: NSColor
    let width: CGFloat
    var start: CGPoint
    var end: CGPoint
    var points: [CGPoint]
    var text: String = ""

    init(tool: Tool, color: NSColor, width: CGFloat, start: CGPoint) {
        self.tool = tool
        self.color = color
        self.width = width
        self.start = start
        self.end = start
        self.points = [start]
    }

    var rect: CGRect {
        return CGRect(x: min(start.x, end.x), y: min(start.y, end.y),
                      width: abs(end.x - start.x), height: abs(end.y - start.y))
    }

    var isMeaningful: Bool {
        switch tool {
        case .pen: return points.count > 2
        case .text: return !text.trimmingCharacters(in: .whitespaces).isEmpty
        default: return hypot(end.x - start.x, end.y - start.y) > 4
        }
    }

    static func fontSize(forWidth width: CGFloat) -> CGFloat {
        return 12 + width * 3
    }

    var font: NSFont {
        return NSFont.systemFont(ofSize: Annotation.fontSize(forWidth: width), weight: .semibold)
    }

    func draw() {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }

        // Sombra suave, no estilo da Marcação do macOS.
        if tool != .highlight {
            let shadow = NSShadow()
            shadow.shadowColor = NSColor.black.withAlphaComponent(0.3)
            shadow.shadowBlurRadius = 3
            shadow.shadowOffset = NSSize(width: 0, height: -1)
            shadow.set()
        }
        ctx.beginTransparencyLayer(auxiliaryInfo: nil)
        defer { ctx.endTransparencyLayer() }

        switch tool {
        case .rectangle:
            let path = NSBezierPath(roundedRect: rect, xRadius: width, yRadius: width)
            path.lineWidth = width
            color.setStroke()
            path.stroke()

        case .ellipse:
            let path = NSBezierPath(ovalIn: rect)
            path.lineWidth = width
            color.setStroke()
            path.stroke()

        case .highlight:
            let path = NSBezierPath(roundedRect: rect, xRadius: 3, yRadius: 3)
            color.withAlphaComponent(0.28).setFill()
            path.fill()
            path.lineWidth = 1.5
            color.withAlphaComponent(0.85).setStroke()
            path.stroke()

        case .pen:
            guard let first = points.first else { return }
            let path = NSBezierPath()
            path.move(to: first)
            for p in points.dropFirst() { path.line(to: p) }
            path.lineWidth = width
            path.lineCapStyle = .roundLineCapStyle
            path.lineJoinStyle = .roundLineJoinStyle
            color.setStroke()
            path.stroke()

        case .arrow:
            drawArrow()

        case .text:
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
            (text as NSString).draw(at: start, withAttributes: attrs)
        }
    }

    private func drawArrow() {
        let dx = end.x - start.x, dy = end.y - start.y
        let length = hypot(dx, dy)
        guard length > 0.5 else { return }
        let angle = atan2(dy, dx)
        let headLength = min(max(width * 4.5, 14), length)
        let headHalfWidth = headLength * 0.5

        let back = CGPoint(x: end.x - cos(angle) * headLength, y: end.y - sin(angle) * headLength)
        let shaftEnd = CGPoint(x: end.x - cos(angle) * headLength * 0.8,
                               y: end.y - sin(angle) * headLength * 0.8)

        color.setStroke()
        color.setFill()

        let shaft = NSBezierPath()
        shaft.move(to: start)
        shaft.line(to: shaftEnd)
        shaft.lineWidth = width
        shaft.lineCapStyle = .roundLineCapStyle
        shaft.stroke()

        let left = CGPoint(x: back.x + cos(angle + .pi / 2) * headHalfWidth,
                           y: back.y + sin(angle + .pi / 2) * headHalfWidth)
        let right = CGPoint(x: back.x + cos(angle - .pi / 2) * headHalfWidth,
                            y: back.y + sin(angle - .pi / 2) * headHalfWidth)
        let head = NSBezierPath()
        head.move(to: end)
        head.line(to: left)
        head.line(to: right)
        head.close()
        head.lineJoinStyle = .roundLineJoinStyle
        head.lineWidth = max(1, width * 0.4)
        head.fill()
        head.stroke()
    }
}
