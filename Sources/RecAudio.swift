import Cocoa
import AVFoundation
import CoreAudio
import CoreMedia

enum AudioKind: String, Codable {
    case system, mic

    var title: String { return self == .system ? "Som do Mac" : "Microfone" }
}

/// Consultas ao CoreAudio: dispositivos, BlackHole e saída múltipla.
enum AudioDevices {
    /// Microfones e entradas de áudio (inclui o BlackHole, se instalado).
    static func inputDevices() -> [AVCaptureDevice] {
        return AVCaptureDevice.devices(for: .audio)
    }

    static func isBlackHole(_ device: AVCaptureDevice) -> Bool {
        return device.localizedName.lowercased().contains("blackhole") || device.uniqueID.lowercased().contains("blackhole")
    }

    /// Microfones "de verdade" (sem o BlackHole, que só serve para o som do Mac).
    static func microphones() -> [AVCaptureDevice] {
        return inputDevices().filter { !isBlackHole($0) }
    }

    static func blackHole() -> AVCaptureDevice? {
        let all = inputDevices().filter { isBlackHole($0) }
        return all.first(where: { $0.localizedName.contains("2ch") }) ?? all.first
    }

    static func microphone(uid: String?) -> AVCaptureDevice? {
        if let uid = uid, let d = microphones().first(where: { $0.uniqueID == uid }) { return d }
        if let d = AVCaptureDevice.default(for: .audio), !isBlackHole(d) { return d }
        if let m = microphones().first { return m }
        // Só nos testes automáticos (Mac sem microfone): usa o BlackHole como "microfone".
        if ProcessInfo.processInfo.environment["RECORTE_TEST_MIC_BLACKHOLE"] != nil { return blackHole() }
        return nil
    }

    // MARK: Saída do sistema

    private static func property<T>(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector,
                                    _ value: inout T) -> Bool {
        var address = AudioObjectPropertyAddress(mSelector: selector,
                                                 mScope: kAudioObjectPropertyScopeGlobal,
                                                 mElement: kAudioObjectPropertyElementMaster)
        var size = UInt32(MemoryLayout<T>.size)
        return AudioObjectGetPropertyData(object, &address, 0, nil, &size, &value) == noErr
    }

    static func defaultOutputDevice() -> AudioObjectID? {
        var id = AudioObjectID(0)
        guard property(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultOutputDevice, &id),
              id != 0 else { return nil }
        return id
    }

    static func uid(of device: AudioObjectID) -> String? {
        var uid: CFString = "" as CFString
        guard property(device, kAudioDevicePropertyDeviceUID, &uid) else { return nil }
        return uid as String
    }

    static func name(of device: AudioObjectID) -> String? {
        var name: CFString = "" as CFString
        guard property(device, kAudioObjectPropertyName, &name) else { return nil }
        return name as String
    }

    /// UIDs dos dispositivos dentro de um dispositivo agregado / saída múltipla.
    static func subDeviceUIDs(of device: AudioObjectID) -> [String] {
        var address = AudioObjectPropertyAddress(mSelector: kAudioAggregateDevicePropertyFullSubDeviceList,
                                                 mScope: kAudioObjectPropertyScopeGlobal,
                                                 mElement: kAudioObjectPropertyElementMaster)
        guard AudioObjectHasProperty(device, &address) else { return [] }
        var list: CFArray = [] as CFArray
        var size = UInt32(MemoryLayout<CFArray>.size)
        guard AudioObjectGetPropertyData(device, &address, 0, nil, &size, &list) == noErr else { return [] }
        return (list as? [String]) ?? []
    }

    enum SystemAudioRoute {
        /// A saída padrão é uma saída múltipla com BlackHole: grava e continua tocando.
        case multiOutput
        /// A saída padrão é o próprio BlackHole: grava, mas você não ouve nada.
        case blackHoleOnly
        /// O som não está indo para o BlackHole: a gravação ficaria muda.
        case notRouted(currentOutput: String)
    }

    static func systemAudioRoute() -> SystemAudioRoute {
        guard let out = defaultOutputDevice() else { return .notRouted(currentOutput: "desconhecida") }
        let uid = (self.uid(of: out) ?? "").lowercased()
        if uid.contains("blackhole") { return .blackHoleOnly }
        if subDeviceUIDs(of: out).contains(where: { $0.lowercased().contains("blackhole") }) { return .multiOutput }
        return .notRouted(currentOutput: name(of: out) ?? "saída atual")
    }

    static func openAudioMIDISetup() {
        let paths = ["/System/Applications/Utilities/Audio MIDI Setup.app",
                     "/Applications/Utilities/Audio MIDI Setup.app"]
        if let path = paths.first(where: { FileManager.default.fileExists(atPath: $0) }) {
            NSWorkspace.shared.open(URL(fileURLWithPath: path))
        }
    }

    static let blackHoleURL = URL(string: "https://existential.audio/blackhole/")!

    /// Passo a passo para gravar o som do Mac no macOS 10.14–12 (sem ScreenCaptureKit de áudio).
    static let setupInstructions = [
        "1. Instale o BlackHole 2ch (gratuito): existential.audio/blackhole.",
        "2. Abra Configuração de Áudio e MIDI (Aplicativos › Utilitários).",
        "3. Clique em “+” no canto inferior esquerdo › Criar Dispositivo de Saída Múltipla.",
        "4. Marque os seus alto-falantes ou fones E o BlackHole 2ch. Deixe os alto-falantes como "
            + "Dispositivo Principal e ligue “Correção de Desvio” no BlackHole.",
        "5. Em Preferências do Sistema › Som › Saída, escolha a Saída Múltipla.",
        "Assim você continua ouvindo normalmente e o Recorte grava o som do Mac pelo BlackHole.",
    ].joined(separator: "\n")
}

/// Nível de áudio (pico) de um CMSampleBuffer, de 0 a 1.
enum AudioLevel {
    static func peak(of sampleBuffer: CMSampleBuffer) -> Float {
        guard let format = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(format) else { return 0 }
        let asbd = asbdPointer.pointee
        var blockBuffer: CMBlockBuffer?
        var sizeNeeded = 0
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sampleBuffer, bufferListSizeNeededOut: &sizeNeeded,
                                                                bufferListOut: nil, bufferListSize: 0,
                                                                blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
                                                                flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
                                                                blockBufferOut: nil)
        guard sizeNeeded > 0 else { return 0 }
        let raw = UnsafeMutableRawPointer.allocate(byteCount: sizeNeeded, alignment: 16)
        defer { raw.deallocate() }
        let list = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer, bufferListSizeNeededOut: nil, bufferListOut: list, bufferListSize: sizeNeeded,
            blockBufferAllocator: nil, blockBufferMemoryAllocator: nil,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, blockBufferOut: &blockBuffer)
        guard status == noErr else { return 0 }
        let isFloat = asbd.mFormatFlags & kAudioFormatFlagIsFloat != 0
        let bits = Int(asbd.mBitsPerChannel)
        var peak: Float = 0
        for buffer in UnsafeMutableAudioBufferListPointer(list) {
            guard let data = buffer.mData else { continue }
            let bytes = Int(buffer.mDataByteSize)
            if isFloat && bits == 32 {
                let p = data.bindMemory(to: Float.self, capacity: bytes / 4)
                for i in stride(from: 0, to: bytes / 4, by: 4) { peak = max(peak, abs(p[i])) }
            } else if bits == 16 {
                let p = data.bindMemory(to: Int16.self, capacity: bytes / 2)
                for i in stride(from: 0, to: bytes / 2, by: 4) { peak = max(peak, abs(Float(p[i]) / 32768)) }
            } else if bits == 32 {
                let p = data.bindMemory(to: Int32.self, capacity: bytes / 4)
                for i in stride(from: 0, to: bytes / 4, by: 4) { peak = max(peak, abs(Float(p[i]) / 2_147_483_648)) }
            }
        }
        return min(peak, 1)
    }

    /// Converte o pico para uma escala visual (-60 dB … 0 dB → 0 … 1).
    static func meterValue(_ peak: Float) -> Float {
        guard peak > 0.000_001 else { return 0 }
        let db = 20 * log10(peak)
        return max(0, min(1, (db + 60) / 60))
    }
}

/// Ajuste de tempo de CMSampleBuffers (todas as fontes são levadas ao relógio do sistema).
enum SampleTiming {
    static func hostNow() -> CMTime {
        return CMClockGetTime(CMClockGetHostTimeClock())
    }

    static func shifted(_ sampleBuffer: CMSampleBuffer, by delta: CMTime) -> CMSampleBuffer? {
        if CMTimeCompare(delta, .zero) == 0 { return sampleBuffer }
        var count: CMItemCount = 0
        CMSampleBufferGetSampleTimingInfoArray(sampleBuffer, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count)
        guard count > 0 else { return nil }
        var infos = [CMSampleTimingInfo](repeating: CMSampleTimingInfo(), count: count)
        CMSampleBufferGetSampleTimingInfoArray(sampleBuffer, entryCount: count, arrayToFill: &infos, entriesNeededOut: &count)
        for i in 0..<count {
            infos[i].presentationTimeStamp = CMTimeAdd(infos[i].presentationTimeStamp, delta)
            if infos[i].decodeTimeStamp.isValid {
                infos[i].decodeTimeStamp = CMTimeAdd(infos[i].decodeTimeStamp, delta)
            }
        }
        var out: CMSampleBuffer?
        CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: sampleBuffer,
                                              sampleTimingEntryCount: count, sampleTimingArray: &infos,
                                              sampleBufferOut: &out)
        return out
    }

    /// Converte o tempo do buffer (relógio da sessão de captura) para o relógio do sistema.
    static func toHostClock(_ sampleBuffer: CMSampleBuffer, from clock: CMClock?) -> CMSampleBuffer? {
        guard let clock = clock else { return sampleBuffer }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let host = CMSyncConvertTime(pts, from: clock, to: CMClockGetHostTimeClock())
        guard host.isValid else { return sampleBuffer }
        return shifted(sampleBuffer, by: CMTimeSubtract(host, pts))
    }
}
