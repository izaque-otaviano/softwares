//! Fontsource – API pública e gratuita: <https://fontsource.org/docs/api/introduction>
//!
//! * `GET https://api.fontsource.org/v1/fonts` – lista (id, family, subsets, weights, styles,
//!   variable, category, license, type, lastModified).
//! * `GET https://api.fontsource.org/v1/fonts/{id}` – detalhe, com `variants[peso][estilo][subset].url`
//!   contendo os formatos disponíveis (`woff2`, `woff`, e `ttf` quando publicado).
//! * CDN: `https://cdn.jsdelivr.net/fontsource/fonts/{id}@latest/{subset}-{peso}-{estilo}.woff2`.
//!
//! Se a variante não tem URL `ttf`/`otf`, ela só serve para prévia/CSS (WOFF2 não é instalável no SO);
//! nesse caso a ativação usa outra origem da mesma família (ex.: Google Fonts).

use super::*;
use serde_json::Value;

pub struct Fontsource;

pub const API: &str = "https://api.fontsource.org/v1";

#[async_trait]
impl FontProvider for Fontsource {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "fontsource".into(),
            name: "Fontsource".into(),
            has_catalog: true,
            can_install_files: true,
            has_cdn: true,
            status: ProviderStatus::Ok,
            note: Some("Arquivos TTF/OTF só quando o Fontsource os publica para a variante; WOFF2 serve apenas para web.".into()),
        }
    }

    async fn fetch_catalog(&self, http: &Http, _cfg: &ProviderConfig) -> Result<Vec<RemoteFamily>> {
        let v = http.get_json(&format!("{API}/fonts"), crate::http::MAX_CATALOG_BYTES).await?;
        parse_catalog(&v)
    }

    async fn resolve_files(&self, http: &Http, fam: &FamilyRef) -> Result<Vec<RemoteFile>> {
        let id = &fam.provider_family_id;
        if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(crate::error::Error::Provider(format!("id Fontsource inválido: {id}")));
        }
        let v = http.get_json(&format!("{API}/fonts/{id}"), 8 * 1024 * 1024).await?;
        parse_detail_files(&v)
    }
}

pub fn parse_catalog(v: &Value) -> Result<Vec<RemoteFamily>> {
    let arr = v.as_array().ok_or_else(|| crate::error::Error::Provider("Fontsource: lista esperada".into()))?;
    let mut out = Vec::with_capacity(arr.len());
    for f in arr {
        let (Some(id), Some(name)) = (f["id"].as_str(), f["family"].as_str()) else { continue };
        let weights: Vec<u16> = f["weights"].as_array().map(|a| a.iter().filter_map(|w| num(w).map(|n| n as u16)).collect()).unwrap_or_default();
        let styles: Vec<Style> = str_list(f.get("styles")).iter().filter_map(|s| Style::parse(s)).collect();
        let (license, license_url) = match &f["license"] {
            Value::String(s) => (Some(s.clone()), None),
            Value::Object(o) => (
                o.get("type").and_then(|x| x.as_str()).map(String::from),
                o.get("url").and_then(|x| x.as_str()).map(String::from),
            ),
            _ => (None, None),
        };
        out.push(RemoteFamily {
            provider_id: "fontsource".into(),
            provider_family_id: id.into(),
            name: name.into(),
            category: f["category"].as_str().map(String::from),
            origin: f["type"].as_str().map(String::from),
            version: f["version"].as_str().map(String::from),
            license,
            license_url,
            last_modified: f["lastModified"].as_str().map(String::from),
            subsets: str_list(f.get("subsets")),
            weights,
            styles: if styles.is_empty() { vec![Style::Normal] } else { styles },
            variable: f["variable"].as_bool().unwrap_or(false),
            axes: parse_axes(&f["axes"]),
        });
    }
    Ok(out)
}

fn parse_axes(v: &Value) -> Vec<Axis> {
    let Some(o) = v.as_object() else { return vec![] };
    let mut axes: Vec<Axis> = o
        .iter()
        .filter_map(|(tag, a)| {
            Some(Axis { tag: tag.clone(), min: num(&a["min"])?, max: num(&a["max"])?, default: num(&a["default"]).unwrap_or(num(&a["min"])?) })
        })
        .collect();
    axes.sort_by(|a, b| a.tag.cmp(&b.tag));
    axes
}

/// Extrai arquivos do detalhe. Para cada (peso, estilo) devolve um arquivo por formato,
/// preferindo o subset padrão (`defSubset`, normalmente `latin`).
pub fn parse_detail_files(v: &Value) -> Result<Vec<RemoteFile>> {
    let def_subset = v["defSubset"].as_str().unwrap_or("latin").to_string();
    let variants = v["variants"].as_object().ok_or_else(|| crate::error::Error::Provider("Fontsource: sem variants".into()))?;
    let mut out = Vec::new();
    for (w, styles) in variants {
        let Ok(weight) = w.parse::<u16>() else { continue };
        let Some(styles) = styles.as_object() else { continue };
        for (st, subsets) in styles {
            let Some(style) = Style::parse(st) else { continue };
            let Some(subsets) = subsets.as_object() else { continue };
            let chosen = subsets.get(&def_subset).map(|s| (def_subset.clone(), s)).or_else(|| subsets.iter().next().map(|(k, s)| (k.clone(), s)));
            let Some((subset, entry)) = chosen else { continue };
            for (fmt, key) in [("ttf", FileFormat::Ttf), ("otf", FileFormat::Otf), ("woff2", FileFormat::Woff2), ("woff", FileFormat::Woff)] {
                if let Some(url) = entry["url"][fmt].as_str() {
                    out.push(RemoteFile { weight, style, format: key, subset: Some(subset.clone()), variable: false, url: url.into() });
                }
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // FIXTURES baseadas no formato documentado da API; NÃO são respostas capturadas ao vivo
    // (api.fontsource.org não é acessível do ambiente de desenvolvimento).
    #[test]
    fn parseia_catalogo() {
        let v = json!([
            {"id":"inter","family":"Inter","subsets":["latin","latin-ext"],"weights":[100,400,700],"styles":["normal","italic"],
             "defSubset":"latin","variable":true,"lastModified":"2024-01-01","category":"sans-serif","license":"OFL-1.1","type":"google"},
            {"id":"open-sans","family":"Open Sans","subsets":["latin"],"weights":[400],"styles":["normal"],"variable":false,
             "category":"sans-serif","license":{"type":"Apache-2.0","url":"https://x"},"type":"google"},
            {"family":"sem id"}
        ]);
        let f = parse_catalog(&v).unwrap();
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].origin.as_deref(), Some("google"));
        assert_eq!(f[0].weights, vec![100, 400, 700]);
        assert!(f[0].variable);
        assert_eq!(f[1].license.as_deref(), Some("Apache-2.0"));
        assert_eq!(f[1].license_url.as_deref(), Some("https://x"));
    }

    #[test]
    fn parseia_arquivos_do_detalhe() {
        let v = json!({"defSubset":"latin","variants":{
            "400":{"normal":{"latin":{"url":{"woff2":"https://cdn.jsdelivr.net/a.woff2","woff":"https://cdn.jsdelivr.net/a.woff","ttf":"https://cdn.jsdelivr.net/a.ttf"}},
                              "cyrillic":{"url":{"woff2":"https://cdn.jsdelivr.net/c.woff2"}}},
                   "italic":{"latin":{"url":{"woff2":"https://cdn.jsdelivr.net/i.woff2"}}}}}});
        let f = parse_detail_files(&v).unwrap();
        assert_eq!(f.len(), 4);
        assert!(f.iter().any(|x| x.format == FileFormat::Ttf && x.url.ends_with("a.ttf")));
        assert!(f.iter().all(|x| x.subset.as_deref() == Some("latin")));
        // Itálico só tem WOFF2: nenhuma opção instalável.
        assert!(!f.iter().any(|x| x.style == Style::Italic && x.format.installable()));
    }

    #[test]
    fn eixos_variaveis() {
        let a = parse_axes(&json!({"wght":{"default":"400","min":"100","max":"900","step":"1"},"opsz":{"default":14,"min":14,"max":32}}));
        assert_eq!(a.len(), 2);
        assert_eq!(a[1].tag, "wght");
        assert_eq!(a[1].max, 900.0);
    }
}
