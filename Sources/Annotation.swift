import Cocoa

enum Tool: Int, CaseIterable {
    case arrow, rectangle, ellipse, highlight, pen, text, number, blur

    var title: String {
        switch self {
        case .arrow: return "Seta (A)"
        case .rectangle: return "Retângulo (R)"
        case .ellipse: return "Círculo (O)"
        case .highlight: return "Destacar área (H)"
        case .pen: return "Caneta (P)"
        case .text: return "Texto (T)"
        case .number: return "Números em sequência (N)"
        case .blur: return "Desfocar / esconder (B)"
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
        case .number: return "n"
        case .blur: return "b"
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
        case .number: return Icons.number
        case .blur: return Icons.blur
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
    /// Ferramenta "números": o número desta marcação.
    var number: Int = 0
    /// Ferramenta "desfocar": imagem desfocada da tela inteira e o retângulo onde ela é desenhada.
    var pixelSource: NSImage?
    var sourceFrame: NSRect = .zero

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
        case .number: return number > 0
        default: return hypot(end.x - start.x, end.y - start.y) > 4
        }
    }

    static func fontSize(forWidth width: CGFloat) -> CGFloat {
        return 12 + width * 3
    }

    var font: NSFont {
        return NSFont.systemFont(ofSize: Annotation.fontSize(forWidth: width), weight: .semibold)
    }

    /// Diâmetro do círculo da ferramenta "números".
    var badgeDiameter: CGFloat {
        return 14 + width * 3
    }

    /// Retângulo ocupado pela marcação (para seleção e moldura).
    var bounds: CGRect {
        switch tool {
        case .text:
            let size = (text as NSString).size(withAttributes: [.font: font])
            return CGRect(origin: start, size: size)
        case .number:
            let d = badgeDiameter
            return CGRect(x: start.x - d / 2, y: start.y - d / 2, width: d, height: d)
        case .pen:
            let xs = points.map { $0.x }, ys = points.map { $0.y }
            guard let minX = xs.min(), let maxX = xs.max(), let minY = ys.min(), let maxY = ys.max() else { return .zero }
            return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
        default:
            return rect
        }
    }

    /// O ponto `p` está sobre esta marcação?
    func hitTest(_ p: CGPoint) -> Bool {
        let tolerance = max(6, width / 2 + 4)
        switch tool {
        case .arrow:
            return distance(from: p, toSegment: start, end) <= tolerance
        case .pen:
            for i in 1..<max(points.count, 1) where distance(from: p, toSegment: points[i - 1], points[i]) <= tolerance {
                return true
            }
            return false
        case .rectangle, .ellipse:
            let outer = rect.insetBy(dx: -tolerance, dy: -tolerance)
            let inner = rect.insetBy(dx: tolerance, dy: tolerance)
            return outer.contains(p) && (inner.width <= 0 || inner.height <= 0 || !inner.contains(p))
        default:
            return bounds.insetBy(dx: -4, dy: -4).contains(p)
        }
    }

    private func distance(from p: CGPoint, toSegment a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x, dy = b.y - a.y
        let len2 = dx * dx + dy * dy
        guard len2 > 0 else { return hypot(p.x - a.x, p.y - a.y) }
        let t = max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
        return hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    }

    func move(by dx: CGFloat, _ dy: CGFloat) {
        start = CGPoint(x: start.x + dx, y: start.y + dy)
        end = CGPoint(x: end.x + dx, y: end.y + dy)
        points = points.map { CGPoint(x: $0.x + dx, y: $0.y + dy) }
    }

    func draw() {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        NSGraphicsContext.saveGraphicsState()
        defer { NSGraphicsContext.restoreGraphicsState() }

        if tool == .blur {
            guard let source = pixelSource else { return }
            NSBezierPath(rect: rect).addClip()
            NSGraphicsContext.current?.imageInterpolation = .high
            source.draw(in: sourceFrame)
            return
        }

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
            path.lineCapStyle = roundLineCap
            path.lineJoinStyle = roundLineJoin
            color.setStroke()
            path.stroke()

        case .arrow:
            drawArrow()

        case .text:
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
            (text as NSString).draw(at: start, withAttributes: attrs)

        case .number:
            let r = bounds
            color.setFill()
            NSBezierPath(ovalIn: r).fill()
            let ring = NSBezierPath(ovalIn: r.insetBy(dx: 1, dy: 1))
            ring.lineWidth = 2
            NSColor.white.withAlphaComponent(0.9).setStroke()
            ring.stroke()
            let light = color == NSColor.white || color == NSColor.systemYellow
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: badgeDiameter * 0.55, weight: .bold),
                .foregroundColor: light ? NSColor.black : NSColor.white,
            ]
            let label = "\(number)" as NSString
            let size = label.size(withAttributes: attrs)
            label.draw(at: CGPoint(x: r.midX - size.width / 2, y: r.midY - size.height / 2), withAttributes: attrs)

        case .blur:
            break
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
        shaft.lineCapStyle = roundLineCap
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
        head.lineJoinStyle = roundLineJoin
        head.lineWidth = max(1, width * 0.4)
        head.fill()
        head.stroke()
    }
}

// Os nomes destas constantes mudaram entre SDKs (.roundLineCapStyle → .round);
// usar o valor bruto compila em qualquer versão do Xcode.
let roundLineCap = NSBezierPath.LineCapStyle(rawValue: 1)!
let roundLineJoin = NSBezierPath.LineJoinStyle(rawValue: 1)!
