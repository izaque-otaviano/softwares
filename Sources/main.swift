import Cocoa

// Modo de teste (usado no CI): Recorte --ocr-file imagem.png [--scale 2]
// Reconhece o texto do arquivo, imprime o resultado e o tempo, e sai.
let arguments = CommandLine.arguments
if let i = arguments.firstIndex(of: "--ocr-file"), i + 1 < arguments.count {
    var scale: CGFloat = 1
    if let j = arguments.firstIndex(of: "--scale"), j + 1 < arguments.count, let v = Double(arguments[j + 1]) {
        scale = CGFloat(v)
    }
    let url = URL(fileURLWithPath: arguments[i + 1])
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        print("ERRO: não foi possível abrir \(url.path)")
        exit(2)
    }
    let start = Date()
    let outcome = OCR.run(image, pixelScale: scale)
    let elapsed = String(format: "%.2f", Date().timeIntervalSince(start))
    switch outcome {
    case .text(let t): print("[\(elapsed)s] \(image.width)x\(image.height) TEXTO: \(t.isEmpty ? "(vazio)" : t)")
    case .failure(let m): print("[\(elapsed)s] FALHA: \(m)")
    }
    exit(0)
}

let app = NSApplication.shared
let appDelegate = AppDelegate()
app.delegate = appDelegate
app.run()
