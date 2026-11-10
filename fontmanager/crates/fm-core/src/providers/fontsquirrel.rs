//! Font Squirrel — API pública e gratuita, documentada em
//! <https://www.fontsquirrel.com/blog/2010/12/the-font-squirrel-api> (verificada ao vivo em 2026-11-10):
//!
//! * `GET /api/fontlist/all` – famílias (nome, `family_urlname`, fundição, classificação, nº de estilos);
//! * `GET /api/familyinfo/{family_urlname}` – um registro por arquivo: estilo, nome do arquivo,
//!   `checksum` (MD5 do arquivo — conferido contra o download), imagem de amostra;
//! * `GET /fonts/download/{family_urlname}` – ZIP com os TTF/OTF ORIGINAIS e o arquivo de licença.
//!
//! **Estado em 2026-11-10:** o site responde `202` sem conteúdo a clientes que não sejam navegadores
//! ou ferramentas conhecidas (proteção anti-robôs). O app NÃO falsifica o User-Agent para contornar
//! isso; enquanto o Font Squirrel não liberar o acesso, a sincronização falha com mensagem clara.
//!
//! A API **não informa a licença**: ela é lida do arquivo `.txt` dentro do ZIP. A regra de ativação
//! (só OFL/Apache sem confirmação) é aplicada pelo serviço, não aqui. O `fontfacekit` não é usado:
//! traz versões web cortadas para o subset MacRoman, impróprias para instalar no sistema.

use super::*;
use crate::error::Error;
use serde_json::Value;

pub struct FontSquirrel {
    base: String,
}

impl Default for FontSquirrel {
    fn default() -> Self {
        Self { base: "https://www.fontsquirrel.com".into() }
    }
}

impl FontSquirrel {
    /// Somente testes (servidor local).
    pub fn with_base(base: impl Into<String>) -> Self {
        Self { base: base.into() }
    }
}

fn check_id(id: &str) -> Result<&str> {
    if !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(id)
    } else {
        Err(Error::Provider(format!("identificador Font Squirrel inválido: {id}")))
    }
}

#[async_trait]
impl FontProvider for FontSquirrel {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "fontsquirrel".into(),
            name: "Font Squirrel".into(),
            has_catalog: true,
            can_install_files: true,
            has_cdn: false,
            status: ProviderStatus::Ok,
            note: Some(
                "Licenças variam por família e só são conhecidas ao baixar: OFL e Apache ativam direto; as demais pedem sua confirmação. Atenção: hoje o site bloqueia acesso automático de apps (proteção anti-robôs), então a sincronização pode falhar.".into(),
            ),
        }
    }

    async fn fetch_catalog(&self, http: &Http, _cfg: &ProviderConfig) -> Result<Vec<RemoteFamily>> {
        let v = http.get_json(&format!("{}/api/fontlist/all", self.base), 16 * 1024 * 1024).await?;
        parse_catalog(&v)
    }

    async fn resolve_files(&self, _http: &Http, _fam: &FamilyRef) -> Result<Vec<RemoteFile>> {
        Err(Error::Unavailable("o Font Squirrel distribui pacotes ZIP; use fetch_package".into()))
    }

    async fn fetch_details(&self, http: &Http, fam: &FamilyRef) -> Result<Option<RemoteDetails>> {
        let id = check_id(&fam.provider_family_id)?;
        let v = http.get_json(&format!("{}/api/familyinfo/{id}", self.base), 2 * 1024 * 1024).await?;
        Ok(Some(parse_details(&v)?))
    }

    async fn fetch_package(&self, http: &Http, fam: &FamilyRef) -> Result<Option<Package>> {
        let id = check_id(&fam.provider_family_id)?;
        let url = format!("{}/fonts/download/{id}", self.base);
        let bytes = http.get_bytes(&url, crate::archive::MAX_ARCHIVE_BYTES).await?;
        let x = crate::archive::extract_fonts(&bytes)?;
        Ok(Some(Package { url, files: x.fonts, license: x.license }))
    }
}

/// Classificações do Font Squirrel → categorias usadas no app.
pub fn map_category(c: &str) -> &'static str {
    match c {
        "Sans Serif" => "sans-serif",
        "Serif" | "Slab Serif" => "serif",
        "Script" | "Calligraphic" | "Handdrawn" | "Comic" => "handwriting",
        "Monospaced" | "Typewriter" | "Programming" => "monospace",
        _ => "display",
    }
}

pub fn parse_catalog(v: &Value) -> Result<Vec<RemoteFamily>> {
    let arr = v.as_array().ok_or_else(|| Error::Provider("Font Squirrel: lista esperada".into()))?;
    Ok(arr
        .iter()
        .filter_map(|f| {
            let id = f["family_urlname"].as_str()?;
            let name = f["family_name"].as_str()?.trim();
            check_id(id).ok()?;
            Some(RemoteFamily {
                provider_id: "fontsquirrel".into(),
                provider_family_id: id.into(),
                name: name.into(),
                category: f["classification"].as_str().map(|c| map_category(c).to_string()),
                origin: f["foundry_name"].as_str().map(String::from),
                // Marcador estável (id + nº de estilos) para a sincronização incremental.
                version: Some(format!("{}-{}", f["id"].as_str().unwrap_or("?"), f["family_count"].as_str().unwrap_or("?"))),
                license: None, // só conhecida ao baixar o pacote
                license_url: Some(format!("https://www.fontsquirrel.com/license/{id}")),
                last_modified: None,
                subsets: vec![],
                weights: vec![], // vêm do familyinfo, sob demanda
                styles: vec![],
                variable: false,
                axes: vec![],
            })
        })
        .collect())
}

/// Estima peso/estilo a partir do nome do estilo (só para exibir antes do download;
/// os valores reais são lidos de cada arquivo validado).
pub fn style_to_variant(style: &str) -> VariantView {
    let l = style.to_lowercase();
    let italic = l.contains("italic") || l.contains("oblique");
    let weight = [
        ("hairline", 100), ("thin", 100), ("extralight", 200), ("extra light", 200), ("ultralight", 200), ("ultra light", 200),
        ("semibold", 600), ("semi bold", 600), ("demibold", 600), ("demi bold", 600), ("extrabold", 800), ("extra bold", 800),
        ("ultrabold", 800), ("ultra bold", 800), ("heavy", 900), ("black", 900), ("light", 300), ("medium", 500), ("bold", 700),
    ]
    .iter()
    .find(|(k, _)| l.contains(k))
    .map(|(_, w)| *w)
    .unwrap_or(400);
    VariantView { weight, style: if italic { Style::Italic } else { Style::Normal } }
}

pub fn parse_details(v: &Value) -> Result<RemoteDetails> {
    let arr = v.as_array().ok_or_else(|| Error::Provider("Font Squirrel: familyinfo inválido".into()))?;
    let mut d = RemoteDetails::default();
    for f in arr {
        if let Some(st) = f["style_name"].as_str() {
            let vv = style_to_variant(st);
            if !d.variants.contains(&vv) {
                d.variants.push(vv);
            }
        }
        if let (Some(file), Some(md5)) = (f["filename"].as_str(), f["checksum"].as_str()) {
            if md5.len() == 32 && md5.chars().all(|c| c.is_ascii_hexdigit()) {
                d.checksums.insert(file.to_string(), md5.to_ascii_lowercase());
            }
        }
        if d.preview_image.is_none() {
            d.preview_image = f["listing_image"].as_str().filter(|u| u.starts_with("https://www.fontsquirrel.com/")).map(String::from);
        }
    }
    d.variants.sort_by_key(|v| (v.weight, v.style));
    Ok(d)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Respostas REAIS capturadas da API em 2026-11-10 (ver tests/fixtures/README.md).
    const LIST: &str = include_str!("../../tests/fixtures/fontsquirrel/fontlist.json");
    const INFO: &str = include_str!("../../tests/fixtures/fontsquirrel/six-caps.familyinfo.json");

    #[test]
    fn parseia_lista_real() {
        let f = parse_catalog(&serde_json::from_str(LIST).unwrap()).unwrap();
        assert_eq!(f.len(), 4);
        let six = f.iter().find(|x| x.provider_family_id == "six-caps").unwrap();
        assert_eq!(six.name, "Six Caps");
        assert!(six.license.is_none(), "a API não informa licença; não inventamos");
        assert!(six.weights.is_empty());
        let os = f.iter().find(|x| x.provider_family_id == "open-sans").unwrap();
        assert_eq!(os.category.as_deref(), Some("sans-serif"));
    }

    #[test]
    fn parseia_detalhes_reais_com_md5() {
        let d = parse_details(&serde_json::from_str(INFO).unwrap()).unwrap();
        assert_eq!(d.checksums.get("SixCaps.ttf").map(String::as_str), Some("e788d8c87cd314c2f79d9d8db10269b7"));
        assert!(d.preview_image.unwrap().starts_with("https://www.fontsquirrel.com/fbimg/"));
        assert_eq!(d.variants, vec![VariantView { weight: 400, style: Style::Normal }]);
    }

    #[test]
    fn estilos_viram_variantes() {
        assert_eq!(style_to_variant("Light Italic"), VariantView { weight: 300, style: Style::Italic });
        assert_eq!(style_to_variant("Semibold"), VariantView { weight: 600, style: Style::Normal });
        assert_eq!(style_to_variant("ExtraBold"), VariantView { weight: 800, style: Style::Normal });
        assert_eq!(style_to_variant("Bold"), VariantView { weight: 700, style: Style::Normal });
        assert_eq!(style_to_variant("Regular"), VariantView { weight: 400, style: Style::Normal });
    }

    #[test]
    fn recusa_ids_perigosos() {
        for bad in ["../x", "a/b", "", "a?b=1", "a b"] {
            assert!(check_id(bad).is_err(), "{bad}");
        }
    }
}
