//! Google Fonts.
//!
//! * Catálogo oficial: Google Fonts Developer API `GET https://www.googleapis.com/webfonts/v1/webfonts`
//!   (exige uma chave gratuita, informada nas Configurações). Sem chave, o catálogo das famílias do
//!   Google vem do espelho Fontsource (`type: "google"`), e este adaptador continua servindo prévias,
//!   CSS e **arquivos TTF**.
//! * Arquivos TTF: `https://fonts.googleapis.com/css2?family=…` sem User-Agent de navegador devolve
//!   `src: url(https://fonts.gstatic.com/….ttf) format('truetype')`. É o mesmo CSS2 API público.
//! * CDN: `fonts.googleapis.com/css2`.

use super::*;
use crate::error::Error;
use serde_json::Value;

pub struct GoogleFonts;

const WEBFONTS: &str = "https://www.googleapis.com/webfonts/v1/webfonts";

#[async_trait]
impl FontProvider for GoogleFonts {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "google".into(),
            name: "Google Fonts".into(),
            has_catalog: true,
            can_install_files: true,
            has_cdn: true,
            status: ProviderStatus::Ok,
            note: Some("Catálogo oficial exige chave gratuita da Developer API (Configurações); sem ela o catálogo vem do espelho Fontsource.".into()),
        }
    }

    async fn fetch_catalog(&self, http: &Http, cfg: &ProviderConfig) -> Result<Vec<RemoteFamily>> {
        let key = cfg
            .google_api_key
            .as_deref()
            .filter(|k| !k.is_empty())
            .ok_or_else(|| Error::Unavailable("catálogo oficial do Google requer chave de API (opcional)".into()))?;
        if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Err(Error::Provider("chave de API com caracteres inválidos".into()));
        }
        let url = format!("{WEBFONTS}?key={key}&sort=alpha&capability=VF&capability=WOFF2");
        let v = http.get_json(&url, crate::http::MAX_CATALOG_BYTES).await?;
        parse_catalog(&v)
    }

    async fn resolve_files(&self, http: &Http, fam: &FamilyRef) -> Result<Vec<RemoteFile>> {
        let url = css2_url(&fam.name, &fam.variants, fam.variable)?;
        let css = http.get_text(&url).await?;
        let files = parse_css_files(&css);
        if files.is_empty() {
            return Err(Error::Provider(format!("Google Fonts não devolveu arquivos para {}", fam.name)));
        }
        Ok(files)
    }
}

/// Monta a URL da CSS2 API com tuplas ordenadas, como o Google exige. Variantes ausentes → erro.
pub fn css2_url(name: &str, variants: &[VariantView], variable: bool) -> Result<String> {
    let mut v: Vec<&VariantView> = variants.iter().collect();
    v.sort_by_key(|x| (x.style, x.weight));
    v.dedup();
    if v.is_empty() {
        return Err(Error::Provider("nenhuma variante pedida".into()));
    }
    let has_italic = v.iter().any(|x| x.style == Style::Italic);
    let fam = name.trim().replace(' ', "+");
    if fam.is_empty() || !fam.chars().all(|c| c.is_alphanumeric() || c == '+' || c == '-') {
        return Err(Error::Provider("nome de família inválido para URL".into()));
    }
    let tuples: Vec<String> = if variable {
        let (lo, hi) = (v.first().unwrap().weight, v.last().unwrap().weight);
        let styles: Vec<Style> = if has_italic { vec![Style::Normal, Style::Italic] } else { vec![Style::Normal] };
        styles
            .iter()
            .map(|s| if has_italic { format!("{},{lo}..{hi}", (*s == Style::Italic) as u8) } else { format!("{lo}..{hi}") })
            .collect()
    } else {
        v.iter()
            .map(|x| if has_italic { format!("{},{}", (x.style == Style::Italic) as u8, x.weight) } else { x.weight.to_string() })
            .collect()
    };
    let axes = if has_italic { "ital,wght" } else { "wght" };
    Ok(format!("https://fonts.googleapis.com/css2?family={fam}:{axes}@{}", tuples.join(";")))
}

/// Interpreta blocos `@font-face` da CSS2 API.
pub fn parse_css_files(css: &str) -> Vec<RemoteFile> {
    let mut out = Vec::new();
    for block in css.split("@font-face").skip(1) {
        let Some(end) = block.find('}') else { continue };
        let body = &block[..end];
        let prop = |name: &str| -> Option<&str> {
            let i = body.find(&format!("{name}:"))?;
            let rest = &body[i + name.len() + 1..];
            Some(rest[..rest.find(';')?].trim())
        };
        let style = prop("font-style").and_then(Style::parse).unwrap_or(Style::Normal);
        let weights: Vec<u16> = prop("font-weight").map(|w| w.split_whitespace().filter_map(|n| n.parse().ok()).collect()).unwrap_or_default();
        let Some(&weight) = weights.first() else { continue };
        let Some(src) = prop("src") else { continue };
        let Some(s) = src.find("url(") else { continue };
        let url = src[s + 4..].split(')').next().unwrap_or("").trim_matches(|c| c == '"' || c == '\'').to_string();
        let format = if src.contains("truetype") {
            FileFormat::Ttf
        } else if src.contains("opentype") {
            FileFormat::Otf
        } else if src.contains("woff2") {
            FileFormat::Woff2
        } else {
            continue;
        };
        out.push(RemoteFile { weight, style, format, subset: None, variable: weights.len() > 1, url });
    }
    out
}

pub fn parse_catalog(v: &Value) -> Result<Vec<RemoteFamily>> {
    let items = v["items"].as_array().ok_or_else(|| Error::Provider("Google: resposta sem items".into()))?;
    let mut out = Vec::new();
    for f in items {
        let Some(name) = f["family"].as_str() else { continue };
        let mut weights = Vec::new();
        let mut styles = Vec::new();
        for var in str_list(f.get("variants")) {
            let (w, s) = match var.as_str() {
                "regular" => (400, Style::Normal),
                "italic" => (400, Style::Italic),
                other => match other.strip_suffix("italic") {
                    Some(n) => (n.parse().unwrap_or(0), Style::Italic),
                    None => (other.parse().unwrap_or(0), Style::Normal),
                },
            };
            if w == 0 {
                continue;
            }
            if !weights.contains(&w) {
                weights.push(w);
            }
            if !styles.contains(&s) {
                styles.push(s);
            }
        }
        weights.sort_unstable();
        let axes: Vec<Axis> = f["axes"]
            .as_array()
            .map(|a| a.iter().filter_map(|x| Some(Axis { tag: x["tag"].as_str()?.into(), min: num(&x["start"])?, max: num(&x["end"])?, default: num(&x["start"])? })).collect())
            .unwrap_or_default();
        // O formato oficial não inclui licença; todas as famílias do Google Fonts são OFL/Apache/UFL
        // e a licença exata vem do espelho Fontsource quando há dedup. Não inventamos aqui.
        out.push(RemoteFamily {
            provider_id: "google".into(),
            provider_family_id: name.into(),
            name: name.into(),
            category: f["category"].as_str().map(String::from),
            origin: Some("google".into()),
            version: f["version"].as_str().map(String::from),
            license: None,
            license_url: None,
            last_modified: f["lastModified"].as_str().map(String::from),
            subsets: str_list(f.get("subsets")),
            weights,
            styles,
            variable: !axes.is_empty(),
            axes,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn vv(w: u16, s: Style) -> VariantView {
        VariantView { weight: w, style: s }
    }

    #[test]
    fn url_css2_estatica() {
        let u = css2_url("Open Sans", &[vv(700, Style::Normal), vv(400, Style::Normal)], false).unwrap();
        assert_eq!(u, "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700");
        let u = css2_url("Inter", &[vv(400, Style::Italic), vv(400, Style::Normal), vv(700, Style::Normal)], false).unwrap();
        assert_eq!(u, "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,700;1,400");
    }

    #[test]
    fn url_css2_variavel() {
        let u = css2_url("Inter", &[vv(100, Style::Normal), vv(900, Style::Normal)], true).unwrap();
        assert_eq!(u, "https://fonts.googleapis.com/css2?family=Inter:wght@100..900");
        assert!(css2_url("Bad&Name", &[vv(400, Style::Normal)], false).is_err());
        assert!(css2_url("Inter", &[], false).is_err());
    }

    #[test]
    fn parseia_css() {
        let css = "@font-face {\n  font-family: 'Inter';\n  font-style: italic;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/inter/v20/a.ttf) format('truetype');\n}\n@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: 100 900;\n  src: url(https://fonts.gstatic.com/s/inter/v20/b.ttf) format('truetype');\n}";
        let f = parse_css_files(css);
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].style, Style::Italic);
        assert!(!f[0].variable);
        assert!(f[1].variable);
        assert_eq!(f[1].weight, 100);
        assert!(f[1].url.ends_with("b.ttf"));
    }

    #[test]
    fn parseia_catalogo_oficial() {
        let v = json!({"items":[{"family":"Roboto","variants":["100","regular","italic","700italic"],"subsets":["latin"],
            "version":"v30","lastModified":"2022-01-01","category":"sans-serif",
            "axes":[{"tag":"wght","start":100,"end":900}]}]});
        let f = parse_catalog(&v).unwrap();
        assert_eq!(f[0].weights, vec![100, 400, 700]);
        assert_eq!(f[0].styles.len(), 2);
        assert!(f[0].variable);
    }
}
