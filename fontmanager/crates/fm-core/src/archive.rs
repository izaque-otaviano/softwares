//! Extração segura de pacotes ZIP de fontes. Nada é escrito em disco aqui: devolve os bytes dos
//! arquivos TTF/OTF e o texto da licença. Proteções: limite de entradas, de bytes por entrada e
//! do total descompactado (zip bomb), tamanho declarado não é confiado (leitura limitada), nomes
//! de caminho ignorados (só o nome do arquivo é usado — sem path traversal), lixo do macOS ignorado.

use crate::error::{Error, Result};
use crate::http::MAX_FONT_BYTES;
use std::io::Read;

pub const MAX_ARCHIVE_BYTES: u64 = 60 * 1024 * 1024;
pub const MAX_ENTRIES: usize = 400;
pub const MAX_TOTAL_UNCOMPRESSED: u64 = 200 * 1024 * 1024;
pub const MAX_LICENSE_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone)]
pub struct PackagedFile {
    pub file_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct LicenseFile {
    pub file_name: String,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct Extracted {
    pub fonts: Vec<PackagedFile>,
    pub license: Option<LicenseFile>,
}

fn base_name(path: &str) -> Option<&str> {
    let name = path.rsplit(['/', '\\']).next()?;
    if name.is_empty() || name.starts_with('.') || path.contains("__MACOSX") {
        return None;
    }
    Some(name)
}

fn read_limited(r: impl Read, limit: u64) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    r.take(limit + 1).read_to_end(&mut out).map_err(|e| Error::InvalidFont(format!("pacote corrompido: {e}")))?;
    if out.len() as u64 > limit {
        return Err(Error::TooLarge(format!("entrada do pacote excede {limit} bytes")));
    }
    Ok(out)
}

pub fn extract_fonts(zip_bytes: &[u8]) -> Result<Extracted> {
    if zip_bytes.len() as u64 > MAX_ARCHIVE_BYTES {
        return Err(Error::TooLarge("pacote grande demais".into()));
    }
    if !zip_bytes.starts_with(b"PK") {
        return Err(Error::InvalidFont("o download não é um pacote ZIP".into()));
    }
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes)).map_err(|e| Error::InvalidFont(format!("ZIP inválido: {e}")))?;
    if zip.len() > MAX_ENTRIES {
        return Err(Error::TooLarge(format!("pacote com {} entradas (máx. {MAX_ENTRIES})", zip.len())));
    }
    let mut total = 0u64;
    let mut fonts = Vec::new();
    let mut licenses: Vec<LicenseFile> = Vec::new();
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(|e| Error::InvalidFont(format!("ZIP inválido: {e}")))?;
        if entry.is_dir() {
            continue;
        }
        let full = entry.name().to_string();
        let Some(name) = base_name(&full).map(str::to_string) else { continue };
        let lower = name.to_ascii_lowercase();
        let is_font = lower.ends_with(".ttf") || lower.ends_with(".otf");
        let is_license = lower.ends_with(".txt") && (lower.contains("licen") || lower.contains("ofl") || lower.contains("eula"));
        if !is_font && !is_license {
            continue;
        }
        let limit = if is_font { MAX_FONT_BYTES } else { MAX_LICENSE_BYTES };
        let bytes = read_limited(entry, limit)?;
        total += bytes.len() as u64;
        if total > MAX_TOTAL_UNCOMPRESSED {
            return Err(Error::TooLarge("conteúdo descompactado do pacote grande demais".into()));
        }
        if is_font {
            if !fonts.iter().any(|f: &PackagedFile| f.file_name == name) {
                fonts.push(PackagedFile { file_name: name, bytes });
            }
        } else {
            let text = String::from_utf8(bytes.clone()).unwrap_or_else(|_| bytes.iter().map(|&b| b as char).collect());
            licenses.push(LicenseFile { file_name: name, text });
        }
    }
    if fonts.is_empty() {
        return Err(Error::InvalidFont("o pacote não contém arquivos TTF/OTF".into()));
    }
    // Prefere o arquivo cujo nome menciona "license".
    licenses.sort_by_key(|l| !l.file_name.to_ascii_lowercase().contains("licen"));
    Ok(Extracted { fonts, license: licenses.into_iter().next() })
}

/// Identifica a licença pelo nome do arquivo que o provedor inclui no pacote.
pub fn license_id_from_file_name(file_name: &str) -> String {
    let stem = file_name.rsplit_once('.').map(|(s, _)| s).unwrap_or(file_name).trim();
    let l = stem.to_lowercase();
    if l.contains("freeware") {
        return "Freeware".into();
    }
    crate::dedup::normalize_license(stem).unwrap_or_else(|| stem.to_string())
}

/// Regra combinada com o usuário: só OFL e Apache ativam sem confirmação.
pub fn license_auto_approved(license: &str) -> bool {
    matches!(crate::dedup::normalize_license(license).as_deref(), Some("OFL-1.1") | Some("Apache-2.0"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    const REAL: &[u8] = include_bytes!("../tests/fixtures/fontsquirrel/six-caps.zip");

    fn make_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut buf);
            let opt = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            for (n, b) in entries {
                z.start_file(*n, opt).unwrap();
                z.write_all(b).unwrap();
            }
            z.finish().unwrap();
        }
        buf.into_inner()
    }

    #[test]
    fn extrai_pacote_real_do_font_squirrel() {
        let x = extract_fonts(REAL).unwrap();
        assert_eq!(x.fonts.len(), 1);
        assert_eq!(x.fonts[0].file_name, "SixCaps.ttf");
        let lic = x.license.unwrap();
        assert_eq!(lic.file_name, "SIL Open Font License.txt");
        assert!(lic.text.contains("SIL OPEN FONT LICENSE"));
        assert_eq!(license_id_from_file_name(&lic.file_name), "OFL-1.1");
    }

    #[test]
    fn ignora_caminhos_maliciosos_e_lixo() {
        let ttf = include_bytes!("../tests/fixtures/Tiny5-Regular.ttf");
        let z = make_zip(&[("../../etc/evil.ttf", ttf), ("__MACOSX/._x.ttf", b"lixo"), (".hidden.ttf", b"x"), ("readme.html", b"<x>"), ("a/b/Freeware License.txt", b"texto")]);
        let x = extract_fonts(&z).unwrap();
        assert_eq!(x.fonts.len(), 1);
        assert_eq!(x.fonts[0].file_name, "evil.ttf", "só o nome do arquivo é usado");
        assert_eq!(license_id_from_file_name(&x.license.unwrap().file_name), "Freeware");
    }

    #[test]
    fn rejeita_zip_bomb_lixo_e_pacote_sem_fonte() {
        let bomb = make_zip(&[("big.ttf", &vec![0u8; (MAX_FONT_BYTES + 10) as usize])]);
        assert!(bomb.len() < 1_000_000, "comprime muito: é uma bomba");
        assert!(matches!(extract_fonts(&bomb), Err(Error::TooLarge(_))));
        assert!(extract_fonts(b"<html>erro 500</html>").is_err());
        assert!(extract_fonts(&make_zip(&[("readme.txt", b"oi")])).is_err());
    }

    #[test]
    fn regra_de_licencas() {
        for ok in ["OFL-1.1", "SIL Open Font License", "Apache License", "SIL OFL 1.1 and Bitstream Vera"] {
            assert!(license_auto_approved(ok), "{ok}");
        }
        for no in ["Freeware", "Creative Commons Attribution-ShareAlike", "Nick's Fonts License", "Magnus Cederholm License"] {
            assert!(!license_auto_approved(no), "{no}");
        }
    }
}
