//! Normalização e deduplicação de famílias entre provedores.
//!
//! Política (conservadora): duas descrições são a **mesma família** quando o nome normalizado é
//! igual **e** as licenças, se ambas conhecidas, são equivalentes. Versões diferentes não separam
//! a família — cada origem guarda a própria versão (`family_sources.version`). Quando as licenças
//! conflitam, a segunda ocorrência ganha uma chave distinta (`nome~provedor`) e aparece separada.

use crate::model::RemoteFamily;

/// Chave canônica: minúsculas, sem acentos comuns, apenas `[a-z0-9]`.
pub fn normalize_key(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        let c = fold_accent(c);
        if c == '&' {
            out.push_str("and");
        } else if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        }
    }
    out
}

fn fold_accent(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => 'a',
        'ç' | 'Ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'i',
        'ñ' | 'Ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' => 'o',
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'u',
        other => other,
    }
}

/// Normaliza identificadores de licença para comparação ("OFL", "SIL OFL 1.1" → "OFL-1.1").
pub fn normalize_license(raw: &str) -> Option<String> {
    let l = raw.trim().to_lowercase();
    if l.is_empty() || l == "unknown" || l == "n/a" {
        return None;
    }
    if l.contains("ofl") || l.contains("open font") {
        return Some("OFL-1.1".into());
    }
    if l.contains("apache") {
        return Some("Apache-2.0".into());
    }
    if l.contains("ubuntu font") || l == "ufl" || l == "ufl-1.0" {
        return Some("UFL-1.0".into());
    }
    if l == "mit" {
        return Some("MIT".into());
    }
    Some(raw.trim().to_string())
}

/// Licenças que permitem redistribuir/hospedar o arquivo (usadas para liberar `@font-face` local).
pub fn license_allows_self_hosting(license: Option<&str>) -> bool {
    matches!(
        license.and_then(normalize_license).as_deref(),
        Some("OFL-1.1") | Some("Apache-2.0") | Some("UFL-1.0") | Some("MIT")
    )
}

/// `true` se `a` e `b` podem ser exibidas como uma única família.
pub fn compatible(a: &RemoteFamily, b: &RemoteFamily) -> bool {
    if normalize_key(&a.name) != normalize_key(&b.name) {
        return false;
    }
    licenses_compatible(a.license.as_deref(), b.license.as_deref())
}

pub fn licenses_compatible(a: Option<&str>, b: Option<&str>) -> bool {
    match (a.and_then(normalize_license), b.and_then(normalize_license)) {
        (Some(x), Some(y)) => x == y,
        _ => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fam(name: &str, lic: Option<&str>) -> RemoteFamily {
        RemoteFamily {
            provider_id: "p".into(),
            provider_family_id: name.into(),
            name: name.into(),
            category: None,
            origin: None,
            version: None,
            license: lic.map(Into::into),
            license_url: None,
            last_modified: None,
            subsets: vec![],
            weights: vec![],
            styles: vec![],
            variable: false,
            axes: vec![],
        }
    }

    #[test]
    fn normaliza_nomes() {
        assert_eq!(normalize_key("Open Sans"), "opensans");
        assert_eq!(normalize_key("open-sans"), "opensans");
        assert_eq!(normalize_key("Playfair  Display SC"), "playfairdisplaysc");
        assert_eq!(normalize_key("Noto Sans JP"), "notosansjp");
        assert_eq!(normalize_key("Barlow Semi Condensed"), "barlowsemicondensed");
        assert_eq!(normalize_key("Fira Code & Co"), "firacodeandco");
        assert_eq!(normalize_key("Fraunces 9pt"), "fraunces9pt");
    }

    #[test]
    fn nomes_parecidos_nao_colidem() {
        assert_ne!(normalize_key("Inter"), normalize_key("Inter Tight"));
        assert_ne!(normalize_key("Roboto"), normalize_key("Roboto Mono"));
    }

    #[test]
    fn licencas() {
        assert_eq!(normalize_license("OFL").as_deref(), Some("OFL-1.1"));
        assert_eq!(normalize_license("SIL Open Font License 1.1").as_deref(), Some("OFL-1.1"));
        assert_eq!(normalize_license("Apache License 2.0").as_deref(), Some("Apache-2.0"));
        assert_eq!(normalize_license(""), None);
        assert!(license_allows_self_hosting(Some("OFL-1.1")));
        assert!(!license_allows_self_hosting(Some("Proprietary EULA")));
        assert!(!license_allows_self_hosting(None));
    }

    #[test]
    fn compatibilidade() {
        assert!(compatible(&fam("Inter", Some("OFL-1.1")), &fam("inter", Some("OFL"))));
        assert!(compatible(&fam("Inter", None), &fam("Inter", Some("OFL"))));
        assert!(!compatible(&fam("Inter", Some("OFL-1.1")), &fam("Inter", Some("Proprietary"))));
        assert!(!compatible(&fam("Inter", None), &fam("Inter Tight", None)));
    }
}
