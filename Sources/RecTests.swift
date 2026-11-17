import Cocoa
import AVFoundation

/// Testes de ponta a ponta do gravador, usados no CI (RECORTE_TEST=record|crash|recover|sources).
extension AppDelegate {
    func runRecordingTest(_ mode: String) {
        setbuf(stdout, nil)
        print("TESTE \(mode) — macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
        print("Tela por: \(CaptureSources.modernScreenAvailable ? "ScreenCaptureKit" : "AVCaptureScreenInput")"
              + " · Som do Mac por: \(CaptureSources.systemAudioViaSCK ? "ScreenCaptureKit" : "BlackHole")")
        switch mode {
        case "sources":
            printSources()
            exit(0)
        case "desk":
            DeskClient.serverAddress = "127.0.0.1:8765"
            DeskClient.uploadPath = "/api/capturas/"
            DeskClient.imageFormat = .jpeg
            guard let image = NSImage(contentsOfFile: ProcessInfo.processInfo.environment["RECORTE_DEMO_IMAGE"] ?? ""),
                  let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else {
                print("RESULTADO: FALHA (imagem)"); exit(1)
            }
            print("Título do print: \(DeskClient.title(kind: "Print", detail: "Safari"))")
            DeskClient.shared.sendImage(rep, sourceApp: "Safari") { error in
                print("Envio do print: \(error?.localizedDescription ?? "ok")")
                DeskClient.videoFormat = .mov
                let video = URL(fileURLWithPath: "/tmp/recorte-ultimo.mp4")
                DeskClient.shared.sendVideo(video, progress: { _ in }) { error2 in
                    print("Envio do vídeo (MOV): \(error2?.localizedDescription ?? "ok")")
                    print(error == nil && error2 == nil ? "RESULTADO: OK" : "RESULTADO: FALHA")
                    exit(error == nil && error2 == nil ? 0 : 1)
                }
            }
        case "login":
            DeskClient.shared.login { error in
                print("Login terminou: \(error?.localizedDescription ?? "ok")")
                exit(0)
            }
        case "crash":
            startTestRecording(stopAfter: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 7) {
                print("Encerrando o app à força no meio da gravação…")
                kill(getpid(), SIGKILL)
            }
        case "recover":
            let pending = RecSessionStore.incomplete(excluding: nil)
            print("Gravações incompletas encontradas: \(pending.count)")
            guard let store = pending.last else { print("RESULTADO: FALHA (nada para recuperar)"); exit(1) }
            print("Trechos no manifesto: \(store.manifest.chunks.count)")
            Recorder.shared.recover(store) { url in
                guard let url = url else { print("RESULTADO: FALHA (recuperação)"); exit(1) }
                let ok = self.describe(url, expectedDuration: nil)
                print("Pasta temporária apagada: \(!FileManager.default.fileExists(atPath: store.folder.path))")
                print(ok ? "RESULTADO: OK" : "RESULTADO: FALHA")
                exit(ok ? 0 : 1)
            }
        default:
            startTestRecording(stopAfter: 9)
        }
    }

    private func printSources() {
        print("Microfones: \(AudioDevices.microphones().map { $0.localizedName })")
        print("BlackHole: \(AudioDevices.blackHole()?.localizedName ?? "não encontrado")")
        switch AudioDevices.systemAudioRoute() {
        case .multiOutput: print("Saída: Saída Múltipla com BlackHole")
        case .blackHoleOnly: print("Saída: BlackHole")
        case .notRouted(let n): print("Saída: \(n) (sem BlackHole)")
        }
        print("Câmeras: \(WebcamSource.cameras().map { $0.localizedName })")
        print("Mic autorização: \(AVCaptureDevice.authorizationStatus(for: .audio).rawValue)")
    }

    private func startTestRecording(stopAfter: Double?) {
        printSources()
        var p = RecProfile.standard("Reunião")
        let env = ProcessInfo.processInfo.environment
        p.systemAudio = env["RECORTE_TEST_NO_SYSTEM"] == nil
        p.microphone = env["RECORTE_TEST_NO_MIC"] == nil
        p.clickHighlight = true
        p.webcam = env["RECORTE_TEST_WEBCAM"] != nil
        p.countdown = false
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("recorte-saida", isDirectory: true)
        p.outputFolder = out.path
        guard let screen = NSScreen.main else { print("Sem tela"); exit(1) }
        // Área no meio da tela (testa o recorte e a escala Retina).
        let w = min(900, screen.frame.width - 200), h = min(560, screen.frame.height - 160)
        let rect = NSRect(x: 100, y: 80, width: w.rounded(), height: h.rounded())
        print("Área: \(rect) na tela \(screen.recorteName) (escala \(screen.backingScaleFactor))")

        let r = Recorder.shared
        let start = Date()
        func log(_ s: String) { print(String(format: "[%.1fs] ", Date().timeIntervalSince(start)) + s) }
        r.onFinished = { url in
            log("Vídeo pronto: \(url.lastPathComponent)")
            try? FileManager.default.removeItem(atPath: "/tmp/recorte-ultimo.mp4")
            try? FileManager.default.copyItem(atPath: url.path, toPath: "/tmp/recorte-ultimo.mp4")
            let ok = self.describe(url, expectedDuration: 7)
            self.testTrim(url) { trimOK in
                print(ok && trimOK ? "RESULTADO: OK" : "RESULTADO: FALHA")
                exit(ok && trimOK ? 0 : 1)
            }
        }
        r.start(screen: screen, rect: rect, profile: p)

        // Som tocando o tempo todo (vai para o som do Mac e, no CI, para o BlackHole).
        let sound = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { _ in
            let pr = Process()
            pr.executableURL = URL(fileURLWithPath: "/usr/bin/afplay")
            pr.arguments = ["/System/Library/Sounds/Funk.aiff"]
            try? pr.run()
        }
        let at: [(Double, String, () -> Void)] = [
            (1.5, "clique simulado", { r.testClick(at: CGPoint(x: 0.5, y: 0.5)) }),
            (3.0, "pausar", { r.pause() }),
            (5.0, "retomar", { r.resume() }),
            (6.0, "marcador", { r.addMarker() }),
            (6.5, "alternar webcam", { r.toggleWebcam() }),
            (7.5, "marcador", { r.addMarker() }),
        ]
        guard let stopAfter = stopAfter else { return }
        for (t, name, action) in at {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) {
                log("\(name) — estado \(r.state), tempo gravado \(String(format: "%.1f", r.elapsed))s")
                action()
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + stopAfter) {
            sound.invalidate()
            log("parar — tempo gravado \(String(format: "%.1f", r.elapsed))s, níveis: som do Mac "
                + "\(String(format: "%.2f", r.level(.system))), mic \(String(format: "%.2f", r.level(.mic)))")
            r.stop()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 120) {
            print("RESULTADO: FALHA (tempo esgotado, estado \(r.state))")
            exit(1)
        }
    }

    /// Mostra faixas, duração, capítulos e se o áudio está audível.
    @discardableResult
    func describe(_ url: URL, expectedDuration: Double?) -> Bool {
        let asset = AVURLAsset(url: url)
        let d = CMTimeGetSeconds(asset.duration)
        let video = asset.tracks(withMediaType: .video)
        let audio = asset.tracks(withMediaType: .audio)
        let text = asset.tracks(withMediaType: .text)
        let chapters = readChapters(asset)
        print("Idiomas de capítulos: \(asset.availableChapterLocales.map { $0.identifier })")
        print(String(format: "Arquivo: %@ · %.2f s · tocável: %@", url.lastPathComponent, d, asset.isPlayable ? "sim" : "não"))
        if let v = video.first {
            print("Vídeo: \(Int(v.naturalSize.width))×\(Int(v.naturalSize.height)) · \(String(format: "%.1f", v.nominalFrameRate)) fps "
                  + "· \(Int(v.estimatedDataRate / 1000)) kbps")
        }
        print("Faixas de áudio: \(audio.count) · faixas de texto (capítulos): \(text.count)")
        print("Capítulos: \(chapters.map { "\($0.items.first?.stringValue ?? "?") @ \(String(format: "%.2f", CMTimeGetSeconds($0.timeRange.start)))s" })")
        print("Marcadores (histórico): \(RecLibrary.markers(for: url).map { "\($0.name) @ \(String(format: "%.2f", $0.time))s" })")
        let peak = audioPeak(asset)
        print(String(format: "Pico do áudio: %.3f (%@)", peak, peak > 0.01 ? "audível" : "silêncio"))
        var ok = asset.isPlayable && !video.isEmpty && d > 0
        if let e = expectedDuration {
            let within = abs(d - e) < 1.6
            print(String(format: "Duração esperada ~%.1f s (pausa descontada): %@", e, within ? "ok" : "fora"))
            ok = ok && within
        }
        return ok
    }

    private func audioPeak(_ asset: AVAsset) -> Float {
        guard let track = asset.tracks(withMediaType: .audio).first,
              let reader = try? AVAssetReader(asset: asset) else { return 0 }
        let out = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false,
        ])
        reader.add(out)
        reader.startReading()
        var peak: Float = 0
        while let sb = out.copyNextSampleBuffer() { peak = max(peak, AudioLevel.peak(of: sb)) }
        return peak
    }

    /// Exporta um corte (1 s a 5 s) e confere duração e marcadores ajustados.
    private func testTrim(_ url: URL, completion: @escaping (Bool) -> Void) {
        let markers = RecLibrary.markers(for: url)
        let range = CMTimeRange(start: CMTime(seconds: 1, preferredTimescale: 600),
                                end: CMTime(seconds: 5, preferredTimescale: 600))
        let kept = markers.filter { $0.time >= 1 && $0.time < 5 }.map { RecMarker(time: $0.time - 1, name: $0.name) }
        let output = url.deletingLastPathComponent().appendingPathComponent("corte-teste.mp4")
        try? FileManager.default.removeItem(at: output)
        Muxer().export(segments: [Muxer.Segment(url: url, range: range, audioKinds: [.system])], audio: .passthrough,
                       markers: kept, output: output, progress: { _ in }) { error in
            if let e = error { print("Corte: FALHA \(e.localizedDescription)"); completion(false); return }
            print("— Corte de 1 s a 5 s —")
            print("Marcadores esperados no corte: \(kept.map { "\($0.name) @ \(String(format: "%.2f", $0.time))s" })")
            completion(self.describe(output, expectedDuration: 4))
        }
    }
}
