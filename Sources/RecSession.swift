import Cocoa
import AVFoundation

struct RecChunkInfo: Codable {
    var file: String
    var audioKinds: [AudioKind]
    var duration: Double
    var completed: Bool
}

/// Marcador guardado como (trecho, segundos dentro do trecho): assim o tempo final
/// continua certo mesmo com pausas e trechos perdidos.
struct RecMarkerRef: Codable {
    var chunk: Int
    var offset: Double
    var name: String
}

struct RecManifest: Codable {
    var id: String
    var createdAt: Date
    var status: String  // "recording", "finalizing"
    var outputFolder: String
    var outputName: String
    var audioBitrate: Int
    var volumes: [String: Float]
    var chunks: [RecChunkInfo]
    var markers: [RecMarkerRef]
}

/// Pasta temporária de uma gravação (Application Support/Recorte/Gravacoes/<id>):
/// trechos .mov + manifest.json. Só é apagada depois que o MP4 final estiver pronto.
final class RecSessionStore {
    static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library/Application Support")
        return base.appendingPathComponent("Recorte/Gravacoes", isDirectory: true)
    }

    let folder: URL
    private(set) var manifest: RecManifest
    private let lock = NSLock()

    init(profile: RecProfile, volumes: [AudioKind: Float]) throws {
        let id = UUID().uuidString
        folder = RecSessionStore.root.appendingPathComponent(id, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
        var vols: [String: Float] = [:]
        for (k, v) in volumes { vols[k.rawValue] = v }
        manifest = RecManifest(id: id, createdAt: Date(), status: "recording",
                               outputFolder: profile.outputFolderURL.path,
                               outputName: RecSessionStore.baseName(for: Date()),
                               audioBitrate: profile.audioQuality.bitrate, volumes: vols,
                               chunks: [], markers: [])
        try write()
    }

    init?(folder: URL) {
        self.folder = folder
        guard let data = try? Data(contentsOf: folder.appendingPathComponent("manifest.json")),
              let m = try? RecSessionStore.decoder.decode(RecManifest.self, from: data) else { return nil }
        manifest = m
    }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = .prettyPrinted
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    static func baseName(for date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "pt_BR")
        f.dateFormat = "yyyy-MM-dd 'às' HH.mm.ss"
        return "Gravação \(f.string(from: date))"
    }

    private func write() throws {
        let data = try RecSessionStore.encoder.encode(manifest)
        try data.write(to: folder.appendingPathComponent("manifest.json"), options: .atomic)
    }

    private func update(_ change: (inout RecManifest) -> Void) {
        lock.lock()
        change(&manifest)
        try? write()
        lock.unlock()
    }

    func chunkURL(_ index: Int) -> URL {
        return folder.appendingPathComponent(String(format: "trecho-%04d.mov", index))
    }

    func addChunk(index: Int, audioKinds: [AudioKind]) {
        update { m in
            while m.chunks.count <= index {
                m.chunks.append(RecChunkInfo(file: chunkURL(m.chunks.count).lastPathComponent,
                                             audioKinds: audioKinds, duration: 0, completed: false))
            }
        }
    }

    func chunkFinished(index: Int, duration: Double, ok: Bool) {
        update { m in
            guard index < m.chunks.count else { return }
            m.chunks[index].duration = duration
            m.chunks[index].completed = ok
        }
    }

    func addMarker(chunk: Int, offset: Double) -> Int {
        var number = 0
        update { m in
            number = m.markers.count + 1
            m.markers.append(RecMarkerRef(chunk: chunk, offset: offset, name: "Marcador \(number)"))
        }
        return number
    }

    func setStatus(_ status: String) {
        update { $0.status = status }
    }

    var totalRecorded: Double {
        lock.lock(); defer { lock.unlock() }
        return manifest.chunks.reduce(0) { $0 + $1.duration }
    }

    func remove() {
        try? FileManager.default.removeItem(at: folder)
    }

    /// Gravações que não chegaram ao MP4 final (app encerrado, falta de espaço…).
    static func incomplete(excluding active: URL?) -> [RecSessionStore] {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil,
                                                                 options: [.skipsHiddenFiles])) ?? []
        return dirs.filter { $0.standardizedFileURL != active?.standardizedFileURL }
            .compactMap { RecSessionStore(folder: $0) }
            .filter { store in
                store.manifest.chunks.indices.contains { FileManager.default.fileExists(atPath: store.chunkURL($0).path) }
            }
            .sorted { $0.manifest.createdAt < $1.manifest.createdAt }
    }

    // MARK: Finalização

    /// Junta os trechos legíveis num MP4 na pasta de saída. Se a pasta não aceitar gravação,
    /// usa Filmes/Recorte. Mantém a pasta temporária se algo falhar.
    func finalize(muxer: Muxer, progress: @escaping (Double) -> Void,
                  completion: @escaping (Result<(URL, [RecMarker], Double), Error>) -> Void) {
        setStatus("finalizing")
        var segments: [Muxer.Segment] = []
        var chunkStart: [Int: Double] = [:]
        var chunkDuration: [Int: Double] = [:]
        var total = 0.0
        for (i, info) in manifest.chunks.enumerated() {
            let url = chunkURL(i)
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
            guard let track = asset.tracks(withMediaType: .video).first else { continue }
            let d = CMTimeGetSeconds(track.timeRange.duration)
            guard d > 0.05 else { continue }
            segments.append(Muxer.Segment(url: url, range: nil, audioKinds: info.audioKinds))
            chunkStart[i] = total
            chunkDuration[i] = d
            total += d
        }
        guard !segments.isEmpty else {
            completion(.failure(RecError.message("Nenhum trecho legível foi encontrado nesta gravação.")))
            return
        }
        // Tempo final de cada marcador (pausas e trechos perdidos descontados).
        var markers: [RecMarker] = []
        for ref in manifest.markers {
            let t: Double
            if let start = chunkStart[ref.chunk], let d = chunkDuration[ref.chunk] {
                t = start + min(max(ref.offset, 0), d)
            } else {
                // Trecho perdido: marcador vai para o início do próximo trecho existente.
                let next = chunkStart.filter { $0.key > ref.chunk }.min { $0.key < $1.key }?.value
                t = next ?? total
            }
            markers.append(RecMarker(time: min(t, max(total - 0.01, 0)), name: ref.name))
        }

        var folder = URL(fileURLWithPath: manifest.outputFolder, isDirectory: true)
        if !RecSessionStore.isWritableFolder(folder) {
            folder = RecProfile.standard("Reunião").outputFolderURL
            _ = RecSessionStore.isWritableFolder(folder)
        }
        let final = RecSessionStore.uniqueURL(in: folder, base: manifest.outputName, ext: "mp4")
        let temp = folder.appendingPathComponent(".\(final.deletingPathExtension().lastPathComponent).parcial.mp4")
        try? FileManager.default.removeItem(at: temp)

        var volumes: [AudioKind: Float] = [:]
        for (k, v) in manifest.volumes { if let kind = AudioKind(rawValue: k) { volumes[kind] = v } }

        muxer.export(segments: segments, audio: .mix(bitrate: manifest.audioBitrate, volumes: volumes),
                     markers: markers, output: temp, progress: progress) { error in
            if let error = error {
                try? FileManager.default.removeItem(at: temp)
                completion(.failure(error))
                return
            }
            // Só considera salvo quando o arquivo está pronto para tocar.
            guard Muxer.isPlayable(temp) else {
                try? FileManager.default.removeItem(at: temp)
                completion(.failure(RecError.message("O vídeo gerado não pôde ser lido.")))
                return
            }
            do {
                try FileManager.default.moveItem(at: temp, to: final)
                completion(.success((final, markers, total)))
            } catch {
                completion(.failure(error))
            }
        }
    }

    static func isWritableFolder(_ folder: URL) -> Bool {
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true, attributes: nil)
            let probe = folder.appendingPathComponent(".recorte-teste-\(UUID().uuidString)")
            try Data([0]).write(to: probe)
            try FileManager.default.removeItem(at: probe)
            return true
        } catch {
            return false
        }
    }

    static func freeSpace(at url: URL) -> Int64? {
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityKey])
        return values?.volumeAvailableCapacity.map { Int64($0) }
    }

    static func uniqueURL(in folder: URL, base: String, ext: String) -> URL {
        var url = folder.appendingPathComponent("\(base).\(ext)")
        var n = 2
        while FileManager.default.fileExists(atPath: url.path) {
            url = folder.appendingPathComponent("\(base) (\(n)).\(ext)")
            n += 1
        }
        return url
    }
}

/// Gravações recentes (para o menu "Gravações recentes" e os marcadores renomeados).
enum RecLibrary {
    struct Item: Codable {
        var path: String
        var date: Date
        var duration: Double
        var markers: [RecMarker]
    }

    private static var file: URL {
        return RecSessionStore.root.deletingLastPathComponent().appendingPathComponent("gravacoes.json")
    }

    static func items() -> [Item] {
        guard let data = try? Data(contentsOf: file),
              let list = try? JSONDecoder().decode([Item].self, from: data) else { return [] }
        return list.filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    private static func save(_ list: [Item]) {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true, attributes: nil)
        if let data = try? JSONEncoder().encode(Array(list.prefix(30))) {
            try? data.write(to: file, options: .atomic)
        }
    }

    static func add(url: URL, duration: Double, markers: [RecMarker]) {
        var list = items().filter { $0.path != url.path }
        list.insert(Item(path: url.path, date: Date(), duration: duration, markers: markers), at: 0)
        save(list)
    }

    static func item(for url: URL) -> Item? {
        return items().first { $0.path == url.path }
    }

    static func setMarkers(_ markers: [RecMarker], for url: URL) {
        var list = items()
        if let i = list.firstIndex(where: { $0.path == url.path }) {
            list[i].markers = markers
        } else {
            let d = CMTimeGetSeconds(AVURLAsset(url: url).duration)
            list.insert(Item(path: url.path, date: Date(), duration: d, markers: markers), at: 0)
        }
        save(list)
    }

    /// Marcadores salvos; se não houver, lê os capítulos do próprio arquivo.
    static func markers(for url: URL) -> [RecMarker] {
        if let item = item(for: url) { return item.markers }
        let asset = AVURLAsset(url: url)
        let groups = readChapters(asset)
        return groups.compactMap { group in
            guard let title = group.items.first?.stringValue else { return nil }
            return RecMarker(time: CMTimeGetSeconds(group.timeRange.start), name: title)
        }.filter { $0.name != "Início" }
    }
}

/// Lê os capítulos do arquivo em qualquer idioma.
func readChapters(_ asset: AVAsset) -> [AVTimedMetadataGroup] {
    var locales = asset.availableChapterLocales
    if locales.isEmpty { locales = [Locale(identifier: "und")] }
    for locale in locales {
        let groups = asset.chapterMetadataGroups(withTitleLocale: locale, containingItemsWithCommonKeys: [.commonKeyTitle])
        if !groups.isEmpty { return groups }
    }
    return asset.chapterMetadataGroups(bestMatchingPreferredLanguages: Locale.preferredLanguages)
}
