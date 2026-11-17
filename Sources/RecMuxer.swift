import Cocoa
import AVFoundation
import CoreMedia

/// Marcador na linha do tempo do vídeo final.
struct RecMarker: Codable, Equatable {
    var time: Double
    var name: String
}

/// Junta trechos, mistura o áudio numa faixa só (toca em qualquer player), escreve os
/// marcadores como capítulos e faz cortes. O vídeo é copiado sem recompressão.
final class Muxer {
    struct Segment {
        let url: URL
        /// Trecho a usar (nil = arquivo inteiro).
        let range: CMTimeRange?
        /// Tipo de cada faixa de áudio do arquivo, na ordem (para os volumes).
        let audioKinds: [AudioKind]
    }

    enum Audio {
        /// Decodifica, mistura todas as faixas e grava AAC estéreo.
        case mix(bitrate: Int, volumes: [AudioKind: Float])
        /// Copia a faixa de áudio sem recompressão (cortes, renomear marcadores).
        case passthrough
    }

    private let queue = DispatchQueue(label: "recorte.muxer")
    private var cancelled = false

    func cancel() { cancelled = true }

    /// Exporta para `output` (MP4). Chama `progress` (0…1) e `completion` na fila principal.
    func export(segments: [Segment], audio: Audio, markers: [RecMarker], output: URL,
                progress: @escaping (Double) -> Void, completion: @escaping (Error?) -> Void) {
        queue.async {
            // Capítulos: tenta texto QuickTime e depois tx3g; se nenhum for aceito, grava sem.
            var result: Error? = RecError.message("sem capítulos")
            for subType in [kCMTextFormatType_QTText, kCMTextFormatType_3GText] where result != nil && !self.cancelled {
                try? FileManager.default.removeItem(at: output)
                result = self.run(segments: segments, audio: audio, markers: markers, output: output,
                                  chapters: true, chapterType: subType, progress: progress)
                if let e = result as NSError?, ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
                    print("Capítulos \(subType == kCMTextFormatType_QTText ? "text" : "tx3g"): \(e.code) \(e.userInfo[NSDebugDescriptionErrorKey] ?? "")")
                }
            }
            if result != nil && !self.cancelled {
                // Se os capítulos não forem aceitos, grava sem eles (os marcadores ficam no histórico).
                try? FileManager.default.removeItem(at: output)
                result = self.run(segments: segments, audio: audio, markers: markers, output: output,
                                  chapters: false, progress: progress)
            }
            DispatchQueue.main.async { completion(result) }
        }
    }

    // MARK: Execução

    private final class Feeder {
        let makeOutput: (Int) -> (AVAssetReader, AVAssetReaderOutput)?
        let count: Int
        let offsets: [CMTime]
        let starts: [CMTime]
        var index = 0
        var reader: AVAssetReader?
        var output: AVAssetReaderOutput?
        var lastTime = CMTime.zero

        init(count: Int, offsets: [CMTime], starts: [CMTime],
             makeOutput: @escaping (Int) -> (AVAssetReader, AVAssetReaderOutput)?) {
            self.count = count
            self.offsets = offsets
            self.starts = starts
            self.makeOutput = makeOutput
        }

        func next() -> CMSampleBuffer? {
            while index < count {
                if output == nil {
                    guard let pair = makeOutput(index), pair.0.startReading() else {
                        index += 1
                        continue
                    }
                    reader = pair.0
                    output = pair.1
                }
                if let sb = output?.copyNextSampleBuffer() {
                    let delta = CMTimeSubtract(offsets[index], starts[index])
                    guard let shifted = SampleTiming.shifted(sb, by: delta) else { continue }
                    lastTime = CMSampleBufferGetPresentationTimeStamp(shifted)
                    return shifted
                }
                reader?.cancelReading()
                reader = nil
                output = nil
                index += 1
            }
            return nil
        }
    }

    private func run(segments: [Segment], audio: Audio, markers: [RecMarker], output: URL,
                     chapters: Bool, chapterType: CMTextFormatType = kCMTextFormatType_QTText,
                     progress: @escaping (Double) -> Void) -> Error? {
        let assets = segments.map { AVURLAsset(url: $0.url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true]) }
        var ranges: [CMTimeRange] = []
        for (i, asset) in assets.enumerated() {
            let full: CMTimeRange
            if let v = asset.tracks(withMediaType: .video).first {
                full = v.timeRange
            } else if let a = asset.tracks(withMediaType: .audio).first {
                full = a.timeRange
            } else {
                full = CMTimeRange(start: .zero, duration: .zero)
            }
            ranges.append(segments[i].range.map { CMTimeRangeGetIntersection($0, otherRange: full) } ?? full)
        }
        var offsets: [CMTime] = []
        var total = CMTime.zero
        for r in ranges {
            offsets.append(total)
            total = CMTimeAdd(total, r.duration)
        }
        let totalSeconds = max(CMTimeGetSeconds(total), 0.001)
        guard CMTimeGetSeconds(total) > 0 else { return RecError.message("Nenhum trecho gravado para salvar.") }

        let writer: AVAssetWriter
        do {
            // Variante MPEG-4 do iTunes (.m4v): aceita a faixa de capítulos e continua sendo MP4.
            writer = try AVAssetWriter(outputURL: output, fileType: chapters && !markers.isEmpty ? .m4v : .mp4)
        } catch {
            return error
        }
        writer.shouldOptimizeForNetworkUse = true

        // Vídeo: cópia direta (sem recompressão).
        let firstVideo = assets.compactMap { $0.tracks(withMediaType: .video).first }.first
        var videoInput: AVAssetWriterInput?
        if let track = firstVideo, let fmt = track.formatDescriptions.first {
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: nil,
                                           sourceFormatHint: (fmt as! CMFormatDescription))
            input.expectsMediaDataInRealTime = false
            if writer.canAdd(input) { writer.add(input); videoInput = input }
        }

        // Áudio
        let hasAudio = assets.contains { !$0.tracks(withMediaType: .audio).isEmpty }
        var audioInput: AVAssetWriterInput?
        if hasAudio {
            switch audio {
            case .mix(let bitrate, _):
                let input = AVAssetWriterInput(mediaType: .audio,
                                               outputSettings: ChunkWriter.aacSettings(channels: 2, bitrate: bitrate))
                if writer.canAdd(input) { writer.add(input); audioInput = input }
            case .passthrough:
                let fmt = assets.compactMap { $0.tracks(withMediaType: .audio).first?.formatDescriptions.first }.first
                let input = AVAssetWriterInput(mediaType: .audio, outputSettings: nil,
                                               sourceFormatHint: fmt.map { $0 as! CMFormatDescription })
                if writer.canAdd(input) { writer.add(input); audioInput = input }
            }
            audioInput?.expectsMediaDataInRealTime = false
        }

        // Capítulos (marcadores)
        var chapterInput: AVAssetWriterInput?
        var chapterSamples: [CMSampleBuffer] = []
        if chapters, let video = videoInput, !markers.isEmpty, let fmt = Muxer.textFormat(subType: chapterType) {
            let input = AVAssetWriterInput(mediaType: .text, outputSettings: nil, sourceFormatHint: fmt)
            input.marksOutputTrackAsEnabled = false
            // A faixa de texto precisa de dimensões (sem isso o formato é recusado).
            let videoSize = firstVideo?.naturalSize ?? CGSize(width: 640, height: 360)
            input.naturalSize = CGSize(width: max(videoSize.width, 16), height: 60)
            input.expectsMediaDataInRealTime = false
            if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
                print("Faixa de capítulos aceita: \(writer.canAdd(input))")
            }
            if writer.canAdd(input) {
                writer.add(input)
                if video.canAddTrackAssociation(withTrackOf: input, type: AVAssetTrack.AssociationType.chapterList.rawValue) {
                    video.addTrackAssociation(withTrackOf: input, type: AVAssetTrack.AssociationType.chapterList.rawValue)
                }
                chapterInput = input
                chapterSamples = Muxer.chapterSamples(markers, total: totalSeconds, format: fmt)
            }
        }

        guard writer.startWriting() else { return writer.error ?? RecError.message("Não foi possível criar o arquivo.") }
        writer.startSession(atSourceTime: .zero)

        let starts = ranges.map { $0.start }
        let group = DispatchGroup()

        if let input = videoInput {
            let feeder = Feeder(count: assets.count, offsets: offsets, starts: starts) { i in
                guard let track = assets[i].tracks(withMediaType: .video).first,
                      let reader = try? AVAssetReader(asset: assets[i]) else { return nil }
                reader.timeRange = ranges[i]
                let out = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
                out.alwaysCopiesSampleData = false
                guard reader.canAdd(out) else { return nil }
                reader.add(out)
                return (reader, out)
            }
            pump(input: input, feeder: feeder, group: group) { t in
                progress(min(1, CMTimeGetSeconds(t) / totalSeconds))
            }
        }

        if let input = audioInput {
            let feeder = Feeder(count: assets.count, offsets: offsets, starts: starts) { i in
                let tracks = assets[i].tracks(withMediaType: .audio)
                guard !tracks.isEmpty, let reader = try? AVAssetReader(asset: assets[i]) else { return nil }
                reader.timeRange = ranges[i]
                let out: AVAssetReaderOutput
                switch audio {
                case .mix(_, let volumes):
                    var layout = AudioChannelLayout()
                    layout.mChannelLayoutTag = kAudioChannelLayoutTag_Stereo
                    let mix = AVAssetReaderAudioMixOutput(audioTracks: tracks, audioSettings: [
                        AVFormatIDKey: kAudioFormatLinearPCM,
                        AVSampleRateKey: 48_000,
                        AVNumberOfChannelsKey: 2,
                        AVLinearPCMBitDepthKey: 16,
                        AVLinearPCMIsFloatKey: false,
                        AVLinearPCMIsBigEndianKey: false,
                        AVLinearPCMIsNonInterleaved: false,
                        AVChannelLayoutKey: Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size),
                    ])
                    let audioMix = AVMutableAudioMix()
                    let kinds = segments[i].audioKinds
                    audioMix.inputParameters = tracks.enumerated().map { (j, track) in
                        let p = AVMutableAudioMixInputParameters(track: track)
                        let kind = j < kinds.count ? kinds[j] : .system
                        p.setVolume(volumes[kind] ?? 1, at: .zero)
                        return p
                    }
                    mix.audioMix = audioMix
                    out = mix
                case .passthrough:
                    out = AVAssetReaderTrackOutput(track: tracks[0], outputSettings: nil)
                }
                guard reader.canAdd(out) else { return nil }
                reader.add(out)
                return (reader, out)
            }
            pump(input: input, feeder: feeder, group: group) { t in
                if videoInput == nil { progress(min(1, CMTimeGetSeconds(t) / totalSeconds)) }
            }
        }

        if let input = chapterInput {
            group.enter()
            var pending = chapterSamples
            input.requestMediaDataWhenReady(on: DispatchQueue(label: "recorte.muxer.chapters")) {
                while input.isReadyForMoreMediaData && !pending.isEmpty {
                    input.append(pending.removeFirst())
                }
                if pending.isEmpty {
                    input.markAsFinished()
                    group.leave()
                }
            }
        }

        group.wait()
        if cancelled {
            writer.cancelWriting()
            return RecError.message("Cancelado.")
        }
        let done = DispatchSemaphore(value: 0)
        writer.finishWriting { done.signal() }
        done.wait()
        if writer.status != .completed {
            return writer.error ?? RecError.message("Não foi possível finalizar o vídeo.")
        }
        return nil
    }

    private func pump(input: AVAssetWriterInput, feeder: Feeder, group: DispatchGroup,
                      onTime: @escaping (CMTime) -> Void) {
        group.enter()
        var finished = false
        let q = DispatchQueue(label: "recorte.muxer.\(input.mediaType.rawValue)")
        input.requestMediaDataWhenReady(on: q) { [weak self] in
            guard !finished else { return }
            while input.isReadyForMoreMediaData {
                if self?.cancelled == true {
                    finished = true
                    input.markAsFinished()
                    group.leave()
                    return
                }
                guard let sb = feeder.next() else {
                    finished = true
                    input.markAsFinished()
                    group.leave()
                    return
                }
                if !input.append(sb) {
                    finished = true
                    input.markAsFinished()
                    group.leave()
                    return
                }
                onTime(feeder.lastTime)
            }
        }
    }

    // MARK: Capítulos (faixa de texto QuickTime)

    /// 'tx3g' (texto MPEG-4, o formato usual de capítulos em MP4) ou 'text' (QuickTime).
    static func textFormat(subType: CMTextFormatType = kCMTextFormatType_3GText) -> CMFormatDescription? {
        let extensions: [String: Any] = [
            kCMTextFormatDescriptionExtension_DisplayFlags as String: 0,
            kCMTextFormatDescriptionExtension_BackgroundColor as String: [
                kCMTextFormatDescriptionColor_Red as String: 0,
                kCMTextFormatDescriptionColor_Green as String: 0,
                kCMTextFormatDescriptionColor_Blue as String: 0,
                kCMTextFormatDescriptionColor_Alpha as String: 255,
            ],
            kCMTextFormatDescriptionExtension_DefaultTextBox as String: [
                kCMTextFormatDescriptionRect_Top as String: 0,
                kCMTextFormatDescriptionRect_Left as String: 0,
                kCMTextFormatDescriptionRect_Bottom as String: 60,
                kCMTextFormatDescriptionRect_Right as String: 400,
            ],
            kCMTextFormatDescriptionExtension_DefaultStyle as String: [
                kCMTextFormatDescriptionStyle_StartChar as String: 0,
                kCMTextFormatDescriptionStyle_Font as String: 1,
                kCMTextFormatDescriptionStyle_FontFace as String: 0,
                kCMTextFormatDescriptionStyle_ForegroundColor as String: [
                    kCMTextFormatDescriptionColor_Red as String: 255,
                    kCMTextFormatDescriptionColor_Green as String: 255,
                    kCMTextFormatDescriptionColor_Blue as String: 255,
                    kCMTextFormatDescriptionColor_Alpha as String: 255,
                ],
                kCMTextFormatDescriptionStyle_FontSize as String: 12,
            ],
            kCMTextFormatDescriptionExtension_HorizontalJustification as String: 0,
            kCMTextFormatDescriptionExtension_VerticalJustification as String: 0,
        ]
        var desc: CMFormatDescription?
        let status = CMFormatDescriptionCreate(allocator: kCFAllocatorDefault, mediaType: kCMMediaType_Text,
                                               mediaSubType: subType,
                                               extensions: extensions as CFDictionary, formatDescriptionOut: &desc)
        return status == noErr ? desc : nil
    }

    static func chapterSamples(_ markers: [RecMarker], total: Double, format: CMFormatDescription) -> [CMSampleBuffer] {
        var list = markers.filter { $0.time >= 0 && $0.time < total }.sorted { $0.time < $1.time }
        if list.first.map({ $0.time > 0.5 }) ?? true {
            list.insert(RecMarker(time: 0, name: "Início"), at: 0)
        } else {
            list[0].time = 0
        }
        var samples: [CMSampleBuffer] = []
        for (i, m) in list.enumerated() {
            let end = i + 1 < list.count ? list[i + 1].time : total
            guard end > m.time,
                  let sb = textSample(m.name, start: m.time, duration: end - m.time, format: format) else { continue }
            samples.append(sb)
        }
        return samples
    }

    private static func textSample(_ text: String, start: Double, duration: Double,
                                   format: CMFormatDescription) -> CMSampleBuffer? {
        let utf8 = Array(text.utf8.prefix(1000))
        var data = Data()
        var length = UInt16(utf8.count).bigEndian
        data.append(Data(bytes: &length, count: 2))
        data.append(contentsOf: utf8)
        // Átomo 'encd': texto em UTF-8.
        var atomSize = UInt32(12).bigEndian
        data.append(Data(bytes: &atomSize, count: 4))
        data.append(contentsOf: Array("encd".utf8))
        var encoding = UInt32(0x0000_0100).bigEndian
        data.append(Data(bytes: &encoding, count: 4))

        var block: CMBlockBuffer?
        guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil,
                                                 blockLength: data.count, blockAllocator: kCFAllocatorDefault,
                                                 customBlockSource: nil, offsetToData: 0, dataLength: data.count,
                                                 flags: kCMBlockBufferAssureMemoryNowFlag,
                                                 blockBufferOut: &block) == noErr,
              let blockBuffer = block else { return nil }
        let copied = data.withUnsafeBytes { raw -> OSStatus in
            guard let base = raw.baseAddress else { return -1 }
            return CMBlockBufferReplaceDataBytes(with: base, blockBuffer: blockBuffer,
                                                 offsetIntoDestination: 0, dataLength: data.count)
        }
        guard copied == noErr else { return nil }
        var timing = CMSampleTimingInfo(duration: CMTime(seconds: duration, preferredTimescale: 600),
                                        presentationTimeStamp: CMTime(seconds: start, preferredTimescale: 600),
                                        decodeTimeStamp: .invalid)
        var size = data.count
        var sample: CMSampleBuffer?
        CMSampleBufferCreate(allocator: kCFAllocatorDefault, dataBuffer: blockBuffer, dataReady: true,
                             makeDataReadyCallback: nil, refcon: nil, formatDescription: format,
                             sampleCount: 1, sampleTimingEntryCount: 1, sampleTimingArray: &timing,
                             sampleSizeEntryCount: 1, sampleSizeArray: &size, sampleBufferOut: &sample)
        return sample
    }

    /// Arquivo pronto para tocar? (faixas legíveis e duração > 0)
    static func isPlayable(_ url: URL) -> Bool {
        let asset = AVURLAsset(url: url)
        return asset.isPlayable && CMTimeGetSeconds(asset.duration) > 0
            && !asset.tracks(withMediaType: .video).isEmpty
    }
}
