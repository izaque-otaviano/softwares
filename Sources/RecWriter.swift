import Cocoa
import AVFoundation
import CoreImage
import CoreMedia

/// Grava um "trecho" (.mov) da gravação. Cada pausa ou a cada poucos minutos começa um
/// trecho novo; trechos concluídos ficam intactos se o app for encerrado de repente.
/// Faixas: vídeo H.264 + uma faixa AAC por fonte de áudio (mixadas no final).
final class ChunkWriter {
    struct VideoFormat {
        let width: Int
        let height: Int
        let fps: Int
        let bitrate: Int
    }

    let url: URL
    let audioKinds: [AudioKind]
    private let writer: AVAssetWriter
    private var videoInput: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var audioInputs: [AudioKind: AVAssetWriterInput] = [:]
    private(set) var startTime: CMTime?
    private(set) var endTime: CMTime?
    private(set) var lastVideoTime: CMTime?
    var failed: Bool { return writer.status == .failed }
    var error: Error? { return writer.error }

    init(url: URL, video: VideoFormat?, audioKinds: [AudioKind], audioBitrate: Int) throws {
        self.url = url
        self.audioKinds = audioKinds
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        // Fragmentos a cada 2 s: se o app cair, o arquivo continua legível até o último fragmento.
        writer.movieFragmentInterval = CMTime(seconds: 1, preferredTimescale: 600)

        if let v = video {
            let settings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: v.width,
                AVVideoHeightKey: v.height,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: v.bitrate,
                    AVVideoExpectedSourceFrameRateKey: v.fps,
                    AVVideoMaxKeyFrameIntervalKey: v.fps * 2,
                    AVVideoAllowFrameReorderingKey: false,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                ],
            ]
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
            input.expectsMediaDataInRealTime = true
            let attrs: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: v.width,
                kCVPixelBufferHeightKey as String: v.height,
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            ]
            adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
            guard writer.canAdd(input) else { throw RecError.message("Não foi possível preparar o vídeo.") }
            writer.add(input)
            videoInput = input
        }
        for kind in audioKinds {
            let channels = kind == .system ? 2 : 1
            let input = AVAssetWriterInput(mediaType: .audio,
                                           outputSettings: ChunkWriter.aacSettings(channels: channels,
                                                                                   bitrate: max(audioBitrate, 128_000)))
            input.expectsMediaDataInRealTime = true
            guard writer.canAdd(input) else { throw RecError.message("Não foi possível preparar o áudio.") }
            writer.add(input)
            audioInputs[kind] = input
        }
    }

    static func aacSettings(channels: Int, bitrate: Int) -> [String: Any] {
        var layout = AudioChannelLayout()
        layout.mChannelLayoutTag = channels == 1 ? kAudioChannelLayoutTag_Mono : kAudioChannelLayoutTag_Stereo
        let layoutData = Data(bytes: &layout, count: MemoryLayout<AudioChannelLayout>.size)
        return [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 48_000,
            AVNumberOfChannelsKey: channels,
            AVEncoderBitRateKey: channels == 1 ? min(bitrate, 128_000) : bitrate,
            AVChannelLayoutKey: layoutData,
        ]
    }

    private func startIfNeeded(at time: CMTime) -> Bool {
        if startTime != nil { return true }
        guard writer.startWriting() else { return false }
        writer.startSession(atSourceTime: time)
        startTime = time
        return true
    }

    var pixelBufferPool: CVPixelBufferPool? { return adaptor?.pixelBufferPool }

    /// Começa o trecho no primeiro quadro (ou no primeiro áudio, se não houver vídeo).
    func prepare(at time: CMTime) -> Bool {
        return startIfNeeded(at: time)
    }

    func append(pixelBuffer: CVPixelBuffer, at time: CMTime) {
        guard let input = videoInput, let adaptor = adaptor, startIfNeeded(at: time), endTime == nil else { return }
        if let last = lastVideoTime, CMTimeCompare(time, last) <= 0 { return }
        guard input.isReadyForMoreMediaData else { return } // atraso: descarta o quadro
        if adaptor.append(pixelBuffer, withPresentationTime: time) {
            lastVideoTime = time
        } else if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
            print("Quadro recusado em \(url.lastPathComponent) t=\(CMTimeGetSeconds(time)) início=\(startTime.map { CMTimeGetSeconds($0) } ?? -1): \((writer.error as NSError?).map { "\($0.code) \($0.userInfo)" } ?? "")")
        }
    }

    /// Fim do último áudio gravado por fonte (o gravador recusa áudio "voltando no tempo").
    private var audioEnd: [AudioKind: CMTime] = [:]

    func append(audio original: CMSampleBuffer, kind: AudioKind) {
        guard let input = audioInputs[kind] else { return }
        var sampleBuffer = original
        var pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        // A conversão de relógio pode deixar um buffer alguns ms antes do fim do anterior.
        // Pequeno atraso: encaixa logo depois do anterior. Muito atrás: descarta.
        if let end = audioEnd[kind], CMTimeCompare(pts, end) < 0 {
            let behind = CMTimeGetSeconds(CMTimeSubtract(end, pts))
            guard behind < 0.08, let fixed = SampleTiming.shifted(sampleBuffer, by: CMTimeSubtract(end, pts)) else { return }
            sampleBuffer = fixed
            pts = end
        }
        if videoInput == nil { _ = startIfNeeded(at: pts) }
        guard let start = startTime, CMTimeCompare(pts, start) >= 0 else { return }
        if let end = endTime, CMTimeCompare(pts, end) >= 0 { return }
        guard writer.status == .writing, input.isReadyForMoreMediaData else { return }
        if input.append(sampleBuffer) {
            let count = CMSampleBufferGetNumSamples(sampleBuffer)
            var rate = 48_000.0
            if let f = CMSampleBufferGetFormatDescription(sampleBuffer),
               let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(f)?.pointee, asbd.mSampleRate > 0 {
                rate = asbd.mSampleRate
            }
            audioEnd[kind] = CMTimeAdd(pts, CMTime(value: CMTimeValue(count), timescale: CMTimeScale(rate)))
        } else if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
            print("Áudio recusado (\(kind.rawValue)) em \(url.lastPathComponent) t=\(CMTimeGetSeconds(pts)): \((writer.error as NSError?).map { "\($0.code) \($0.userInfo)" } ?? "")")
        }
    }

    /// Marca o fim do trecho; áudio anterior a `time` ainda pode chegar até `finish`.
    func end(at time: CMTime) {
        if endTime == nil { endTime = time }
    }

    var duration: Double {
        guard let s = startTime else { return 0 }
        let e = endTime ?? lastVideoTime ?? s
        return max(0, CMTimeGetSeconds(CMTimeSubtract(e, s)))
    }

    func finish(completion: @escaping (Bool) -> Void) {
        guard startTime != nil, writer.status == .writing else {
            if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
                print("Trecho cancelado \(url.lastPathComponent): início \(startTime != nil), status \(writer.status.rawValue) \((writer.error as NSError?).map { "\($0.code) \($0.userInfo)" } ?? "")")
            }
            if writer.status == .failed {
                // O arquivo é fragmentado: o que já foi gravado continua legível. Mantém.
                completion(false)
                return
            }
            writer.cancelWriting()
            try? FileManager.default.removeItem(at: url)
            completion(false)
            return
        }
        if let end = endTime ?? lastVideoTime {
            writer.endSession(atSourceTime: end)
        }
        videoInput?.markAsFinished()
        for input in audioInputs.values { input.markAsFinished() }
        writer.finishWriting { [writer] in
            if ProcessInfo.processInfo.environment["RECORTE_TEST"] != nil {
                print("Fechou \(writer.outputURL.lastPathComponent): status \(writer.status.rawValue) \(writer.error?.localizedDescription ?? "")")
            }
            completion(writer.status == .completed)
        }
    }
}

enum RecError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self {
        case .message(let m): return m
        }
    }
}

/// Clique a destacar no vídeo.
struct ClickMark {
    let time: CMTime
    /// Posição normalizada dentro da área gravada (0…1, origem embaixo à esquerda).
    let position: CGPoint
}

/// Monta cada quadro: escala para o tamanho final, desenha os cliques e a webcam.
final class FrameCompositor {
    private let context = CIContext(options: [CIContextOption.useSoftwareRenderer: false])
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private var webcamMask: (CGSize, CIImage)?

    func render(source: CVPixelBuffer, into destination: CVPixelBuffer, time: CMTime,
                clicks: [ClickMark], webcam: CVPixelBuffer?,
                webcamPosition: WebcamPosition, webcamSize: WebcamSize) {
        let outW = CGFloat(CVPixelBufferGetWidth(destination))
        let outH = CGFloat(CVPixelBufferGetHeight(destination))
        let srcW = CGFloat(CVPixelBufferGetWidth(source))
        let srcH = CGFloat(CVPixelBufferGetHeight(source))
        var image = CIImage(cvPixelBuffer: source)
        if abs(srcW - outW) > 0.5 || abs(srcH - outH) > 0.5 {
            image = image.transformed(by: CGAffineTransform(scaleX: outW / srcW, y: outH / srcH))
        }

        // Destaque de cliques: círculo amarelo que cresce e some em 0,6 s.
        let unit = max(outW, outH) / 1600
        for click in clicks {
            let age = CMTimeGetSeconds(CMTimeSubtract(time, click.time))
            guard age >= 0, age < 0.6 else { continue }
            let progress = CGFloat(age / 0.6)
            let radius = (22 + 26 * progress) * max(unit, 0.6)
            let alpha = 0.55 * (1 - progress)
            let center = CIVector(x: click.position.x * outW, y: click.position.y * outH)
            guard let gradient = CIFilter(name: "CIRadialGradient", parameters: [
                "inputCenter": center,
                "inputRadius0": radius * 0.55,
                "inputRadius1": radius,
                "inputColor0": CIColor(red: 1, green: 0.84, blue: 0.04, alpha: alpha),
                "inputColor1": CIColor(red: 1, green: 0.84, blue: 0.04, alpha: 0),
            ])?.outputImage else { continue }
            let disc = gradient.cropped(to: CGRect(x: center.x - radius, y: center.y - radius,
                                                   width: radius * 2, height: radius * 2))
            image = disc.composited(over: image)
        }

        // Webcam no canto escolhido, com cantos arredondados (espelhada, como um espelho).
        if let cam = webcam {
            var camImage = CIImage(cvPixelBuffer: cam)
            let camW = camImage.extent.width, camH = camImage.extent.height
            let targetW = (outW * webcamSize.fraction).rounded()
            let targetH = (targetW * camH / max(camW, 1)).rounded()
            camImage = camImage
                .transformed(by: CGAffineTransform(scaleX: -targetW / camW, y: targetH / camH))
                .transformed(by: CGAffineTransform(translationX: targetW, y: 0))
            let margin = (outW * 0.02).rounded()
            let x: CGFloat, y: CGFloat
            switch webcamPosition {
            case .bottomRight: x = outW - targetW - margin; y = margin
            case .bottomLeft: x = margin; y = margin
            case .topRight: x = outW - targetW - margin; y = outH - targetH - margin
            case .topLeft: x = margin; y = outH - targetH - margin
            }
            let mask = roundedMask(size: CGSize(width: targetW, height: targetH))
            if let blend = CIFilter(name: "CIBlendWithMask", parameters: [
                kCIInputImageKey: camImage,
                kCIInputBackgroundImageKey: CIImage.empty(),
                kCIInputMaskImageKey: mask,
            ])?.outputImage {
                let placed = blend.transformed(by: CGAffineTransform(translationX: x, y: y))
                image = placed.composited(over: image)
            }
        }

        context.render(image, to: destination, bounds: CGRect(x: 0, y: 0, width: outW, height: outH),
                       colorSpace: colorSpace)
    }

    private func roundedMask(size: CGSize) -> CIImage {
        if let cached = webcamMask, cached.0 == size { return cached.1 }
        let radius = min(size.width, size.height) * 0.12
        let w = Int(size.width), h = Int(size.height)
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return CIImage.empty() }
        ctx.setFillColor(gray: 0, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.addPath(CGPath(roundedRect: CGRect(x: 0, y: 0, width: w, height: h),
                           cornerWidth: radius, cornerHeight: radius, transform: nil))
        ctx.fillPath()
        guard let cg = ctx.makeImage() else { return CIImage.empty() }
        let mask = CIImage(cgImage: cg)
        webcamMask = (size, mask)
        return mask
    }
}
