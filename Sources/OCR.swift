import Cocoa
import Vision

/// Reconhecimento de texto em imagens.
/// - macOS 10.15 ou superior: usa o Vision da Apple (nativo, rápido).
/// - macOS 10.14: usa o Tesseract embutido no app (Contents/Resources/tesseract).
enum OCR {
    enum Outcome {
        case text(String)
        case failure(String)
    }

    static func recognize(_ image: CGImage, completion: @escaping (Outcome) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let result = run(image)
            DispatchQueue.main.async { completion(result) }
        }
    }

    private static func run(_ image: CGImage) -> Outcome {
        let forceTesseract = ProcessInfo.processInfo.environment["RECORTE_FORCE_TESSERACT"] != nil
        if !forceTesseract {
            if #available(macOS 10.15, *) {
                return vision(image)
            }
        }
        return tesseract(image)
    }

    // MARK: Vision (10.15+)

    @available(macOS 10.15, *)
    private static func vision(_ image: CGImage) -> Outcome {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        if #available(macOS 12.0, *) {
            if let supported = try? request.supportedRecognitionLanguages() {
                let wanted = ["pt-BR", "en-US"].filter { supported.contains($0) }
                if !wanted.isEmpty { request.recognitionLanguages = wanted }
            }
        }
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return .failure("Não foi possível reconhecer o texto: \(error.localizedDescription)")
        }
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        return .text(clean(lines.joined(separator: "\n")))
    }

    // MARK: Tesseract (10.14)

    private static func tesseract(_ image: CGImage) -> Outcome {
        guard let resources = Bundle.main.resourceURL?.appendingPathComponent("tesseract", isDirectory: true) else {
            return .failure("Recursos do app não encontrados.")
        }
        let binary = resources.appendingPathComponent("bin/tesseract")
        let tessdata = resources.appendingPathComponent("tessdata", isDirectory: true)
        guard FileManager.default.isExecutableFile(atPath: binary.path) else {
            return .failure("O reconhecimento de texto não está incluído nesta versão do app.")
        }
        let languages = ["por", "eng"].filter {
            FileManager.default.fileExists(atPath: tessdata.appendingPathComponent("\($0).traineddata").path)
        }
        guard !languages.isEmpty else { return .failure("Dicionários de idioma não encontrados.") }

        // Imagens maiores dão resultados melhores; telas sem Retina ganham 2×.
        let scale: CGFloat = image.height < 900 ? 2 : 1
        guard let pgm = grayscalePGM(image, scale: scale) else {
            return .failure("Não foi possível preparar a imagem.")
        }
        let input = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("recorte-ocr-\(UUID().uuidString).pgm")
        defer { try? FileManager.default.removeItem(at: input) }
        do {
            try pgm.write(to: input)
        } catch {
            return .failure("Não foi possível preparar a imagem.")
        }

        let process = Process()
        process.executableURL = binary
        process.arguments = [input.path, "stdout",
                             "--tessdata-dir", tessdata.path,
                             "-l", languages.joined(separator: "+"),
                             "--psm", "3"]
        var env = ProcessInfo.processInfo.environment
        env["OMP_THREAD_LIMIT"] = "1"
        process.environment = env
        let output = Pipe()
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return .failure("Não foi possível iniciar o reconhecimento: \(error.localizedDescription)")
        }
        let data = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            return .failure("O reconhecimento de texto falhou (código \(process.terminationStatus)).")
        }
        return .text(clean(String(decoding: data, as: UTF8.self)))
    }

    /// Converte para tons de cinza no formato PGM, que o Tesseract lê sem bibliotecas extras.
    private static func grayscalePGM(_ image: CGImage, scale: CGFloat) -> Data? {
        let w = max(1, Int(CGFloat(image.width) * scale))
        let h = max(1, Int(CGFloat(image.height) * scale))
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.interpolationQuality = .high
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let raw = ctx.data else { return nil }
        let bytesPerRow = ctx.bytesPerRow
        let pixels = raw.bindMemory(to: UInt8.self, capacity: bytesPerRow * h)
        var pgm = Data("P5\n\(w) \(h)\n255\n".utf8)
        pgm.reserveCapacity(pgm.count + w * h)
        for row in 0..<h {
            pgm.append(pixels + row * bytesPerRow, count: w)
        }
        return pgm
    }

    private static func clean(_ text: String) -> String {
        var t = text.replacingOccurrences(of: "\u{0C}", with: "")
        while t.contains("\n\n\n") { t = t.replacingOccurrences(of: "\n\n\n", with: "\n\n") }
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
