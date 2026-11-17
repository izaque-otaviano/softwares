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

    /// - Parameter pixelScale: pixels por ponto da captura (2 em telas Retina, 1 nas demais).
    static func recognize(_ image: CGImage, pixelScale: CGFloat, completion: @escaping (Outcome) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let result = run(image, pixelScale: pixelScale)
            DispatchQueue.main.async { completion(result) }
        }
    }

    static func run(_ image: CGImage, pixelScale: CGFloat) -> Outcome {
        // Prepara a imagem: margem em volta, ampliação quando o texto é pequeno e
        // formato de cor comum. Recortes minúsculos (uma palavra só) sem margem
        // costumam voltar "nenhum texto".
        let prepared = prepare(image, pixelScale: pixelScale) ?? image
        let smallCrop = CGFloat(image.height) / max(pixelScale, 1) < 90

        let forceTesseract = ProcessInfo.processInfo.environment["RECORTE_FORCE_TESSERACT"] != nil
        if !forceTesseract {
            if #available(macOS 10.15, *) {
                let result = vision(prepared)
                if case .text(let t) = result, !t.isEmpty { return result }
                // Vision não achou nada: tenta o Tesseract, se estiver disponível.
                if case .text(let t) = tesseract(prepared, singleBlock: smallCrop), !t.isEmpty { return .text(t) }
                return result
            }
        }
        return tesseract(prepared, singleBlock: smallCrop)
    }

    // MARK: Preparação da imagem

    private static func prepare(_ image: CGImage, pixelScale: CGFloat) -> CGImage? {
        // Alvo: ~2 pixels por ponto (texto de tela com ~26px de altura); recortes
        // pequenos ganham mais ampliação. Imagens enormes são reduzidas (velocidade).
        var scale = 2 / max(pixelScale, 1)
        let pointsHigh = CGFloat(image.height) / max(pixelScale, 1)
        if pointsHigh < 90 { scale *= 1.5 }
        let maxPixels: CGFloat = 5_000_000
        let pixels = CGFloat(image.width * image.height) * scale * scale
        if pixels > maxPixels { scale *= (maxPixels / pixels).squareRoot() }

        let margin = Int(24 * max(scale, 1))
        let w = Int(CGFloat(image.width) * scale), h = Int(CGFloat(image.height) * scale)
        guard w > 0, h > 0, let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: w + margin * 2, height: h + margin * 2,
                                  bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        // Margem na cor do canto da imagem (fundo provável).
        let bg = cornerColor(image, space: space) ?? CGColor(red: 1, green: 1, blue: 1, alpha: 1)
        ctx.setFillColor(bg)
        ctx.fill(CGRect(x: 0, y: 0, width: w + margin * 2, height: h + margin * 2))
        ctx.interpolationQuality = .high
        ctx.draw(image, in: CGRect(x: margin, y: margin, width: w, height: h))
        return ctx.makeImage()
    }

    private static func cornerColor(_ image: CGImage, space: CGColorSpace) -> CGColor? {
        guard let one = image.cropping(to: CGRect(x: 0, y: 0, width: 1, height: 1)),
              let ctx = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                  space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
        else { return nil }
        ctx.draw(one, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        guard let raw = ctx.data else { return nil }
        let b = raw.bindMemory(to: UInt8.self, capacity: 4)
        return CGColor(red: CGFloat(b[0]) / 255, green: CGFloat(b[1]) / 255, blue: CGFloat(b[2]) / 255, alpha: 1)
    }

    // MARK: Vision (10.15+)

    @available(macOS 10.15, *)
    private static func vision(_ image: CGImage) -> Outcome {
        var lastError: String?
        // Primeiro o modo preciso; se não achar nada, o modo rápido (melhor em textos soltos).
        for level in [VNRequestTextRecognitionLevel.accurate, .fast] {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = level
            request.usesLanguageCorrection = true
            request.minimumTextHeight = 0
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
                lastError = error.localizedDescription
                continue
            }
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            let lines = observations.compactMap { $0.topCandidates(1).first?.string }
            let text = clean(lines.joined(separator: "\n"))
            if !text.isEmpty { return .text(text) }
        }
        if let e = lastError { return .failure("Não foi possível reconhecer o texto: \(e)") }
        return .text("")
    }

    // MARK: Tesseract (10.14)

    private static func tesseract(_ image: CGImage, singleBlock: Bool) -> Outcome {
        guard let resources = Bundle.main.resourceURL?.appendingPathComponent("tesseract", isDirectory: true) else {
            return .failure("Recursos do app não encontrados.")
        }
        let binary = resources.appendingPathComponent("bin/tesseract")
        let tessdata = resources.appendingPathComponent("tessdata", isDirectory: true)
        guard FileManager.default.isExecutableFile(atPath: binary.path) else {
            return .failure("O reconhecimento de texto não está incluído nesta versão do app.")
        }
        // Um idioma só é ~2× mais rápido que dois; o modelo de português também lê inglês.
        guard let language = ["por", "eng"].first(where: {
            FileManager.default.fileExists(atPath: tessdata.appendingPathComponent("\($0).traineddata").path)
        }) else { return .failure("Dicionários de idioma não encontrados.") }

        guard let pgm = grayscalePGM(image) else {
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
                             "-l", language,
                             "--oem", "1",
                             "--psm", singleBlock ? "6" : "3"]
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
    /// Fundos escuros (texto claro) são invertidos, porque o Tesseract lê melhor preto no branco.
    private static func grayscalePGM(_ image: CGImage) -> Data? {
        let w = image.width, h = image.height
        guard w > 0, h > 0,
              let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
        ctx.setFillColor(gray: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let raw = ctx.data else { return nil }
        let bytesPerRow = ctx.bytesPerRow
        let pixels = raw.bindMemory(to: UInt8.self, capacity: bytesPerRow * h)

        // Brilho médio (amostrado) para decidir se inverte.
        var sum = 0, count = 0
        var row = 0
        while row < h {
            var col = 0
            while col < w {
                sum += Int(pixels[row * bytesPerRow + col])
                count += 1
                col += 4
            }
            row += 4
        }
        let dark = count > 0 && sum / count < 110

        var pgm = Data("P5\n\(w) \(h)\n255\n".utf8)
        pgm.reserveCapacity(pgm.count + w * h)
        if dark {
            var line = [UInt8](repeating: 0, count: w)
            for r in 0..<h {
                for c in 0..<w { line[c] = 255 - pixels[r * bytesPerRow + c] }
                pgm.append(contentsOf: line)
            }
        } else {
            for r in 0..<h {
                pgm.append(pixels + r * bytesPerRow, count: w)
            }
        }
        return pgm
    }

    private static func clean(_ text: String) -> String {
        var t = text.replacingOccurrences(of: "\u{0C}", with: "")
        while t.contains("\n\n\n") { t = t.replacingOccurrences(of: "\n\n\n", with: "\n\n") }
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
