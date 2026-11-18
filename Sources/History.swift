import Cocoa

/// Últimas capturas (até 10), guardadas em ~/Library/Application Support/Recorte/Historico.
enum History {
    static let limit = 10

    struct Entry {
        let url: URL
        let date: Date
    }

    static var folder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Recorte/Historico", isDirectory: true)
    }

    @discardableResult
    static func add(_ png: Data) -> URL {
        let fm = FileManager.default
        try? fm.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        let f = DateFormatter()
        f.dateFormat = "yyyyMMdd-HHmmss-SSS"
        let url = folder.appendingPathComponent("\(f.string(from: Date())).png")
        try? png.write(to: url)
        for old in entries().dropFirst(limit) {
            try? fm.removeItem(at: old.url)
            try? fm.removeItem(at: linkFile(for: old.url))
        }
        return url
    }

    /// Link do Desk de uma captura do histórico (guardado ao lado, em .link).
    private static func linkFile(for url: URL) -> URL {
        return url.deletingPathExtension().appendingPathExtension("link")
    }

    static func setLink(_ link: String?, for url: URL) {
        guard let link = link else { return }
        try? link.write(to: linkFile(for: url), atomically: true, encoding: .utf8)
    }

    static func link(for url: URL) -> String? {
        return try? String(contentsOf: linkFile(for: url), encoding: .utf8)
    }

    /// Mais recentes primeiro.
    static func entries() -> [Entry] {
        let keys: [URLResourceKey] = [.contentModificationDateKey]
        let urls = (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys,
                                                                 options: [.skipsHiddenFiles])) ?? []
        return urls.filter { $0.pathExtension.lowercased() == "png" }
            .map { url -> Entry in
                let date = (try? url.resourceValues(forKeys: Set(keys)).contentModificationDate) ?? Date.distantPast
                return Entry(url: url, date: date)
            }
            .sorted { $0.date > $1.date }
    }

    static func clear() {
        for e in entries() {
            try? FileManager.default.removeItem(at: e.url)
            try? FileManager.default.removeItem(at: linkFile(for: e.url))
        }
    }

    static func thumbnail(for url: URL, height: CGFloat = 36) -> NSImage? {
        guard let image = NSImage(contentsOf: url), image.size.height > 0 else { return nil }
        let width = min(96, image.size.width * height / image.size.height)
        let thumb = NSImage(size: NSSize(width: width, height: height), flipped: false) { rect in
            NSGraphicsContext.current?.imageInterpolation = .high
            image.draw(in: rect)
            NSColor.black.withAlphaComponent(0.15).setStroke()
            NSBezierPath(rect: rect.insetBy(dx: 0.5, dy: 0.5)).stroke()
            return true
        }
        return thumb
    }

    static func copyToClipboard(_ url: URL) -> Bool {
        guard let data = try? Data(contentsOf: url) else { return false }
        DeskClient.copyImage(png: data, link: link(for: url))
        return true
    }
}
