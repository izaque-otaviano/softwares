//! Gerador de código web ("Usar na Web"). Toda seleção é validada contra as variantes reais
//! registradas nas origens da família antes de gerar qualquer URL.

use crate::dedup::license_allows_self_hosting;
use crate::error::{Error, Result};
use crate::model::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Cdn {
    Google,
    Bunny,
    Fontsource,
    /// Arquivos locais, para hospedar no próprio servidor.
    SelfHosted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CssRequest {
    pub cdn: Cdn,
    pub weights: Vec<u16>,
    pub styles: Vec<Style>,
    pub variable: bool,
    pub display: String,
    pub subsets: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfHostFile {
    pub weight: u16,
    pub style: Style,
    pub variable: bool,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CssOutput {
    pub link_html: Option<String>,
    pub import_css: Option<String>,
    pub font_family_rule: String,
    pub font_face_css: Option<String>,
    pub react: String,
    pub nextjs: String,
    pub notes: Vec<String>,
    /// Quando `SelfHosted`: arquivos que precisam ser exportados junto do CSS.
    pub self_host_files: Vec<SelfHostFile>,
}

pub const DISPLAYS: [&str; 5] = ["auto", "block", "swap", "fallback", "optional"];

fn generic_for(category: Option<&str>) -> &'static str {
    match category {
        Some("serif") => "serif",
        Some("monospace") => "monospace",
        Some("handwriting") => "cursive",
        _ => "sans-serif",
    }
}

/// Seleciona as origens que sustentam o CDN pedido.
fn sources_for<'a>(cdn: Cdn, sources: &'a [SourceView]) -> Vec<&'a SourceView> {
    sources
        .iter()
        .filter(|s| match cdn {
            Cdn::Google | Cdn::Bunny => s.provider_id == "google" || s.origin.as_deref() == Some("google"),
            Cdn::Fontsource => s.provider_id == "fontsource",
            Cdn::SelfHosted => true,
        })
        .collect()
}

pub fn generate(name: &str, category: Option<&str>, sources: &[SourceView], req: &CssRequest) -> Result<CssOutput> {
    if !DISPLAYS.contains(&req.display.as_str()) {
        return Err(Error::Other(format!("font-display inválido: {}", req.display)));
    }
    let srcs = sources_for(req.cdn, sources);
    if srcs.is_empty() {
        return Err(Error::Unavailable(format!("{name} não está disponível neste CDN")));
    }
    let styles: Vec<Style> = if req.styles.is_empty() { vec![Style::Normal] } else { req.styles.clone() };

    // Variantes reais = união das origens compatíveis.
    let real: std::collections::HashSet<(u16, Style)> =
        srcs.iter().flat_map(|s| s.variants.iter().map(|v| (v.weight, v.style))).collect();
    let mut weights = req.weights.clone();
    weights.sort_unstable();
    weights.dedup();
    if weights.is_empty() {
        return Err(Error::Other("selecione ao menos um peso".into()));
    }
    let mut missing = Vec::new();
    for w in &weights {
        for s in &styles {
            if !real.contains(&(*w, *s)) {
                missing.push(format!("{w} {}", s.as_str()));
            }
        }
    }
    if !missing.is_empty() {
        return Err(Error::Other(format!("variantes inexistentes para {name}: {}", missing.join(", "))));
    }
    let mut notes = Vec::new();
    let mut variable_axis: Option<(u16, u16)> = None;
    if req.variable {
        let var_src = srcs.iter().find(|s| s.variable).ok_or_else(|| Error::Other(format!("{name} não possui versão variável neste provedor")))?;
        variable_axis = Some(match var_src.axes.iter().find(|a| a.tag == "wght") {
            Some(a) => (a.min as u16, a.max as u16),
            None => {
                notes.push("Eixos não informados pelo provedor: intervalo de peso inferido a partir dos pesos listados.".into());
                (*weights.first().unwrap(), *weights.last().unwrap())
            }
        });
        if let Some(a) = var_src.axes.iter().find(|a| a.tag == "wght") {
            if weights.iter().any(|w| (*w as f64) < a.min || (*w as f64) > a.max) {
                return Err(Error::Other(format!("pesos fora do eixo wght ({}–{})", a.min, a.max)));
            }
        }
    }
    let generic = generic_for(category);
    let family_rule = format!("font-family: '{name}', {generic};");
    let has_italic = styles.contains(&Style::Italic);

    let mut out = CssOutput {
        link_html: None,
        import_css: None,
        font_family_rule: family_rule,
        font_face_css: None,
        react: String::new(),
        nextjs: String::new(),
        notes,
        self_host_files: vec![],
    };

    match req.cdn {
        Cdn::Google | Cdn::Bunny => {
            let (host, api) = if req.cdn == Cdn::Google {
                ("https://fonts.googleapis.com", "Google Fonts")
            } else {
                ("https://fonts.bunny.net", "Bunny Fonts")
            };
            let vars: Vec<VariantView> =
                weights.iter().flat_map(|w| styles.iter().map(move |s| VariantView { weight: *w, style: *s })).collect();
            let mut url = crate::providers::google::css2_url(name, &vars, req.variable)?;
            if let Some((lo, hi)) = variable_axis {
                // Usa o intervalo completo do eixo (não só os pesos marcados).
                url = rewrite_range(&url, name, has_italic, lo, hi);
            }
            let url = url.replacen("https://fonts.googleapis.com", host, 1);
            let full = format!("{url}&display={}", req.display);
            out.link_html = Some(match req.cdn {
                Cdn::Google => format!(
                    "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link href=\"{full}\" rel=\"stylesheet\">"
                ),
                _ => format!("<link rel=\"preconnect\" href=\"https://fonts.bunny.net\">\n<link href=\"{full}\" rel=\"stylesheet\">"),
            });
            out.import_css = Some(format!("@import url('{full}');"));
            if !req.subsets.is_empty() {
                out.notes.push(format!("{api} divide os subsets automaticamente com unicode-range; a seleção de subsets não altera a URL."));
            }
            out.react = format!(
                "// index.html (ou o <head> do app): cole o <link> acima.\n// CSS/Tailwind:\n.titulo {{\n  {}\n}}\n\n// JSX:\n<h1 style={{{{ fontFamily: \"'{name}', {generic}\" }}}}>Olá</h1>",
                out.font_family_rule
            );
            out.nextjs = if req.cdn == Cdn::Google { nextjs_google(name, &weights, &styles, req) } else { nextjs_link(&full, name, generic) };
        }
        Cdn::Fontsource => {
            let fs = srcs[0];
            let id = &fs.provider_family_id;
            let allowed: Vec<&String> = fs.subsets.iter().collect();
            let subsets: Vec<String> = if req.subsets.is_empty() { vec!["latin".into()] } else { req.subsets.clone() };
            for s in &subsets {
                if !allowed.is_empty() && !allowed.contains(&s) {
                    return Err(Error::Other(format!("subset inexistente: {s}")));
                }
            }
            let mut css = String::new();
            for subset in &subsets {
                if req.variable {
                    let (lo, hi) = variable_axis.unwrap();
                    for st in &styles {
                        let b = format!("https://cdn.jsdelivr.net/fontsource/fonts/{id}:vf@latest/{subset}-wght-{}", st.as_str());
                        css.push_str(&font_face(name, *st, &format!("{lo} {hi}"), &req.display, &format!("url({b}.woff2) format('woff2-variations')")));
                    }
                } else {
                    for w in &weights {
                        for st in &styles {
                            let b = format!("https://cdn.jsdelivr.net/fontsource/fonts/{id}@latest/{subset}-{w}-{}", st.as_str());
                            css.push_str(&font_face(name, *st, &w.to_string(), &req.display, &format!("url({b}.woff2) format('woff2'), url({b}.woff) format('woff')")));
                        }
                    }
                }
            }
            if subsets.len() > 1 {
                out.notes.push("Vários subsets sem unicode-range: o navegador pode baixar todos. Prefira só os necessários.".into());
            }
            out.font_face_css = Some(css);
            let pkg = if req.variable { format!("@fontsource-variable/{id}") } else { format!("@fontsource/{id}") };
            let imports: String = if req.variable {
                format!("import '{pkg}';\n")
            } else {
                weights.iter().flat_map(|w| styles.iter().map(move |s| (w, s))).map(|(w, s)| if *s == Style::Italic { format!("import '{pkg}/{w}-italic.css';\n") } else { format!("import '{pkg}/{w}.css';\n") }).collect()
            };
            out.react = format!("npm install {pkg}\n\n// src/main.tsx (ou index.js)\n{imports}\n// CSS\n.titulo {{\n  {}\n}}", out.font_family_rule);
            out.nextjs = format!("npm install {pkg}\n\n// app/layout.tsx\n{imports}\nexport default function RootLayout({{ children }}) {{\n  return (\n    <html lang=\"pt-BR\">\n      <body style={{{{ fontFamily: \"'{name}', {generic}\" }}}}>{{children}}</body>\n    </html>\n  );\n}}");
        }
        Cdn::SelfHosted => {
            let lic = srcs.iter().find_map(|s| s.license.as_deref());
            if !license_allows_self_hosting(lic) {
                return Err(Error::Unavailable(format!(
                    "a licença ({}) não está na lista que permite redistribuir/hospedar os arquivos; use um CDN ou confira a licença",
                    lic.unwrap_or("desconhecida")
                )));
            }
            let slug = crate::cache::slug(name);
            let mut css = String::new();
            for st in &styles {
                if req.variable {
                    let (lo, hi) = variable_axis.unwrap();
                    let file = format!("{slug}-variable-{}.ttf", st.as_str());
                    css.push_str(&font_face(name, *st, &format!("{lo} {hi}"), &req.display, &format!("url('/fonts/{file}') format('truetype')")));
                    out.self_host_files.push(SelfHostFile { weight: lo, style: *st, variable: true, file_name: file });
                } else {
                    for w in &weights {
                        let file = format!("{slug}-{w}-{}.ttf", st.as_str());
                        css.push_str(&font_face(name, *st, &w.to_string(), &req.display, &format!("url('/fonts/{file}') format('truetype')")));
                        out.self_host_files.push(SelfHostFile { weight: *w, style: *st, variable: false, file_name: file });
                    }
                }
            }
            out.notes.push(format!("Licença: {}. Mantenha o texto da licença junto dos arquivos.", lic.unwrap_or("desconhecida")));
            out.notes.push("Arquivos TTF: para menor tamanho, converta para WOFF2 antes de publicar.".into());
            out.font_face_css = Some(css);
            out.react = format!("// Copie a pasta exportada para public/fonts/ e importe o CSS gerado (fonts.css):\nimport './fonts.css';\n\n.titulo {{\n  {}\n}}", out.font_family_rule);
            out.nextjs = format!("// app/layout.tsx — com next/font/local\nimport localFont from 'next/font/local';\nconst fonte = localFont({{\n  src: [\n{}  ],\n  display: '{}',\n}});\nexport default function RootLayout({{ children }}) {{\n  return <html lang=\"pt-BR\"><body className={{fonte.className}}>{{children}}</body></html>;\n}}",
                out.self_host_files.iter().map(|f| format!("    {{ path: './fonts/{}', weight: '{}', style: '{}' }},\n", f.file_name, f.weight, f.style.as_str())).collect::<String>(),
                req.display);
        }
    }
    Ok(out)
}

fn font_face(name: &str, style: Style, weight: &str, display: &str, src: &str) -> String {
    format!("@font-face {{\n  font-family: '{name}';\n  font-style: {};\n  font-weight: {weight};\n  font-display: {display};\n  src: {src};\n}}\n", style.as_str())
}

fn rewrite_range(url: &str, name: &str, ital: bool, lo: u16, hi: u16) -> String {
    let fam = name.trim().replace(' ', "+");
    let base = url.split("css2?").next().unwrap_or("");
    if ital {
        format!("{base}css2?family={fam}:ital,wght@0,{lo}..{hi};1,{lo}..{hi}")
    } else {
        format!("{base}css2?family={fam}:wght@{lo}..{hi}")
    }
}

fn nextjs_google(name: &str, weights: &[u16], styles: &[Style], req: &CssRequest) -> String {
    let ident = name.replace(' ', "_");
    let subsets = if req.subsets.is_empty() { "latin".to_string() } else { req.subsets.join("', '") };
    let weight_line = if req.variable { String::new() } else { format!("  weight: [{}],\n", weights.iter().map(|w| format!("'{w}'")).collect::<Vec<_>>().join(", ")) };
    let style_line = if styles.contains(&Style::Italic) { format!("  style: [{}],\n", styles.iter().map(|s| format!("'{}'", s.as_str())).collect::<Vec<_>>().join(", ")) } else { String::new() };
    format!(
        "// app/layout.tsx — next/font baixa e hospeda a fonte no build (sem requisição ao Google no navegador)\nimport {{ {ident} }} from 'next/font/google';\n\nconst fonte = {ident}({{\n  subsets: ['{subsets}'],\n{weight_line}{style_line}  display: '{}',\n}});\n\nexport default function RootLayout({{ children }}) {{\n  return (\n    <html lang=\"pt-BR\" className={{fonte.className}}>\n      <body>{{children}}</body>\n    </html>\n  );\n}}",
        req.display
    )
}

fn nextjs_link(url: &str, name: &str, generic: &str) -> String {
    format!("// app/layout.tsx\nexport default function RootLayout({{ children }}) {{\n  return (\n    <html lang=\"pt-BR\">\n      <head>\n        <link rel=\"stylesheet\" href=\"{url}\" />\n      </head>\n      <body style={{{{ fontFamily: \"'{name}', {generic}\" }}}}>{{children}}</body>\n    </html>\n  );\n}}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(w: u16, s: Style) -> VariantView {
        VariantView { weight: w, style: s }
    }
    fn src(provider: &str, origin: Option<&str>, variable: bool, weights: &[u16], italic: bool) -> SourceView {
        let mut variants = vec![];
        for w in weights {
            variants.push(v(*w, Style::Normal));
            if italic {
                variants.push(v(*w, Style::Italic));
            }
        }
        SourceView {
            provider_id: provider.into(),
            provider_family_id: "inter".into(),
            origin: origin.map(Into::into),
            version: None,
            license: Some("OFL-1.1".into()),
            license_url: None,
            last_modified: None,
            subsets: vec!["latin".into(), "cyrillic".into()],
            variable,
            axes: if variable { vec![Axis { tag: "wght".into(), min: 100.0, max: 900.0, default: 400.0 }] } else { vec![] },
            variants,
        }
    }
    fn req(cdn: Cdn, weights: &[u16], variable: bool) -> CssRequest {
        CssRequest { cdn, weights: weights.to_vec(), styles: vec![Style::Normal], variable, display: "swap".into(), subsets: vec![] }
    }

    #[test]
    fn google_exemplo_do_enunciado() {
        let s = vec![src("fontsource", Some("google"), true, &[400, 500, 700], false)];
        let o = generate("Inter", Some("sans-serif"), &s, &req(Cdn::Google, &[400, 500, 700], false)).unwrap();
        let link = o.link_html.unwrap();
        assert!(link.contains("href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap\""));
        assert!(link.contains("rel=\"stylesheet\""));
        assert_eq!(o.font_family_rule, "font-family: 'Inter', sans-serif;");
        assert!(o.import_css.unwrap().starts_with("@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap')"));
        assert!(o.nextjs.contains("import { Inter } from 'next/font/google'"));
        assert!(o.nextjs.contains("weight: ['400', '500', '700']"));
    }

    #[test]
    fn rejeita_variantes_inexistentes() {
        let s = vec![src("google", None, false, &[400, 700], false)];
        let e = generate("Foo", None, &s, &req(Cdn::Google, &[300], false)).unwrap_err().to_string();
        assert!(e.contains("300 normal"), "{e}");
        let mut r = req(Cdn::Google, &[400], false);
        r.styles = vec![Style::Italic];
        assert!(generate("Foo", None, &s, &r).is_err());
        r.styles = vec![Style::Normal];
        r.display = "x".into();
        assert!(generate("Foo", None, &s, &r).is_err());
    }

    #[test]
    fn variavel_usa_intervalo_do_eixo() {
        let s = vec![src("google", None, true, &[100, 400, 900], false)];
        let o = generate("Inter", None, &s, &req(Cdn::Google, &[400], true)).unwrap();
        assert!(o.link_html.unwrap().contains("Inter:wght@100..900&display=swap"));
        assert!(!o.nextjs.contains("weight:"));
        let static_only = vec![src("google", None, false, &[400], false)];
        assert!(generate("Inter", None, &static_only, &req(Cdn::Google, &[400], true)).is_err());
    }

    #[test]
    fn italico_gera_eixo_ital() {
        let s = vec![src("google", None, false, &[400, 700], true)];
        let mut r = req(Cdn::Google, &[400, 700], false);
        r.styles = vec![Style::Normal, Style::Italic];
        let l = generate("Lora", Some("serif"), &s, &r).unwrap().link_html.unwrap();
        assert!(l.contains("Lora:ital,wght@0,400;0,700;1,400;1,700"));
    }

    #[test]
    fn bunny_so_para_origem_google() {
        let fs_only = vec![src("fontsource", Some("league"), false, &[400], false)];
        assert!(generate("X", None, &fs_only, &req(Cdn::Bunny, &[400], false)).is_err());
        let g = vec![src("fontsource", Some("google"), false, &[400], false)];
        let o = generate("Inter", None, &g, &req(Cdn::Bunny, &[400], false)).unwrap();
        assert!(o.link_html.unwrap().contains("https://fonts.bunny.net/css2?family=Inter:wght@400&display=swap"));
    }

    #[test]
    fn fontsource_gera_font_face_jsdelivr() {
        let s = vec![src("fontsource", Some("google"), true, &[400, 700], false)];
        let o = generate("Inter", None, &s, &req(Cdn::Fontsource, &[400, 700], false)).unwrap();
        let css = o.font_face_css.unwrap();
        assert!(css.contains("https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff2"));
        assert!(css.contains("font-weight: 700;"));
        assert!(o.react.contains("import '@fontsource/inter/400.css'"));
        let vf = generate("Inter", None, &s, &req(Cdn::Fontsource, &[400], true)).unwrap();
        assert!(vf.font_face_css.unwrap().contains("inter:vf@latest/latin-wght-normal.woff2"));
        let mut bad = req(Cdn::Fontsource, &[400], false);
        bad.subsets = vec!["klingon".into()];
        assert!(generate("Inter", None, &s, &bad).is_err());
    }

    #[test]
    fn hospedagem_local_respeita_licenca() {
        let s = vec![src("fontsource", None, false, &[400], false)];
        let o = generate("Inter", None, &s, &req(Cdn::SelfHosted, &[400], false)).unwrap();
        assert_eq!(o.self_host_files[0].file_name, "inter-400-normal.ttf");
        assert!(o.font_face_css.unwrap().contains("url('/fonts/inter-400-normal.ttf') format('truetype')"));
        let mut prop = s.clone();
        prop[0].license = Some("Proprietary".into());
        assert!(generate("Inter", None, &prop, &req(Cdn::SelfHosted, &[400], false)).is_err());
    }
}
