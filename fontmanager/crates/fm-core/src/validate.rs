//! Validação de arquivos de fonte baixados: formato real (pelos bytes, não pela extensão),
//! tamanho, estrutura e metadados. Arquivos malformados são rejeitados antes de tocar o SO.

use crate::error::{Error, Result};
use crate::model::FileFormat;

#[derive(Debug, Clone)]
pub struct FontInfo {
    pub format: FileFormat,
    pub faces: u32,
    pub family: Option<String>,
    pub style: Option<String>,
    pub weight: u16,
    pub italic: bool,
    pub variable: bool,
    pub glyphs: u16,
}

pub const MIN_FONT_BYTES: usize = 512;

pub fn sniff(bytes: &[u8]) -> Option<FileFormat> {
    match bytes.get(..4)? {
        [0x00, 0x01, 0x00, 0x00] | b"true" | b"ttcf" => Some(FileFormat::Ttf),
        b"OTTO" => Some(FileFormat::Otf),
        b"wOFF" => Some(FileFormat::Woff),
        b"wOF2" => Some(FileFormat::Woff2),
        _ => None,
    }
}

pub fn validate_font(bytes: &[u8], max_bytes: u64) -> Result<FontInfo> {
    if bytes.len() < MIN_FONT_BYTES {
        return Err(Error::InvalidFont("arquivo pequeno demais".into()));
    }
    if bytes.len() as u64 > max_bytes {
        return Err(Error::TooLarge(format!("{} bytes > {max_bytes}", bytes.len())));
    }
    let format = sniff(bytes).ok_or_else(|| Error::InvalidFont("assinatura de fonte desconhecida".into()))?;
    if !format.installable() {
        return Err(Error::InvalidFont(format!(
            "formato {} é para web e não pode ser registrado no sistema",
            format.as_str()
        )));
    }
    let faces = ttf_parser::fonts_in_collection(bytes).unwrap_or(1);
    if faces == 0 || faces > 64 {
        return Err(Error::InvalidFont("coleção de fontes inválida".into()));
    }
    check_table_bounds(bytes, faces)?;
    let face = ttf_parser::Face::parse(bytes, 0).map_err(|e| Error::InvalidFont(format!("estrutura inválida: {e}")))?;
    let glyphs = face.number_of_glyphs();
    if glyphs == 0 {
        return Err(Error::InvalidFont("fonte sem glifos".into()));
    }
    // Pelo menos um mapeamento de caracteres utilizável.
    if face.tables().cmap.is_none() {
        return Err(Error::InvalidFont("fonte sem tabela cmap".into()));
    }
    let name = |ids: &[u16]| {
        face.names()
            .into_iter()
            .filter(|n| ids.contains(&n.name_id) && n.is_unicode())
            .find_map(|n| n.to_string())
    };
    Ok(FontInfo {
        format,
        faces,
        family: name(&[16, 1]),
        style: name(&[17, 2]),
        weight: face.weight().to_number(),
        italic: face.is_italic(),
        variable: face.is_variable(),
        glyphs,
    })
}

/// Garante que toda tabela declarada no diretório cabe no arquivo (detecta download truncado).
fn check_table_bounds(b: &[u8], faces: u32) -> Result<()> {
    let u16_at = |o: usize| b.get(o..o + 2).map(|x| u16::from_be_bytes([x[0], x[1]]) as usize);
    let u32_at = |o: usize| b.get(o..o + 4).map(|x| u32::from_be_bytes([x[0], x[1], x[2], x[3]]) as usize);
    let err = || Error::InvalidFont("arquivo truncado ou diretório de tabelas inválido".into());
    let offsets: Vec<usize> = if b.starts_with(b"ttcf") {
        (0..faces as usize).map(|i| u32_at(12 + 4 * i).ok_or_else(err)).collect::<Result<_>>()?
    } else {
        vec![0]
    };
    for base in offsets {
        let n = u16_at(base + 4).ok_or_else(err)?;
        if n == 0 || n > 512 {
            return Err(err());
        }
        for i in 0..n {
            let rec = base + 12 + 16 * i;
            let off = u32_at(rec + 8).ok_or_else(err)?;
            let len = u32_at(rec + 12).ok_or_else(err)?;
            if off.checked_add(len).map_or(true, |end| end > b.len()) {
                return Err(err());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    const TTF: &[u8] = include_bytes!("../tests/fixtures/Tiny5-Regular.ttf");

    #[test]
    fn aceita_ttf_real() {
        let i = validate_font(TTF, 30_000_000).unwrap();
        assert_eq!(i.format, FileFormat::Ttf);
        assert_eq!(i.family.as_deref(), Some("Tiny5"));
        assert!(i.glyphs > 10);
        assert!(!i.variable);
    }

    #[test]
    fn rejeita_lixo_e_formatos_web() {
        assert!(validate_font(&[0u8; 2048], 1 << 20).is_err());
        let mut woff = b"wOF2".to_vec();
        woff.extend(vec![0u8; 2048]);
        let e = validate_font(&woff, 1 << 20).unwrap_err().to_string();
        assert!(e.contains("web"), "{e}");
        let html = b"<html><body>erro 404</body></html>".repeat(40);
        assert!(validate_font(&html, 1 << 20).is_err());
    }

    #[test]
    fn rejeita_truncado_e_grande() {
        assert!(validate_font(&TTF[..TTF.len() / 3], 1 << 24).is_err());
        assert!(matches!(validate_font(TTF, 1000), Err(Error::TooLarge(_))));
        assert!(validate_font(&TTF[..100], 1 << 24).is_err());
    }

    #[test]
    fn rejeita_cabecalho_ok_mas_corpo_corrompido() {
        let mut bad = TTF[..12].to_vec();
        bad.extend(vec![0xFFu8; 4096]);
        assert!(validate_font(&bad, 1 << 24).is_err());
    }
}
