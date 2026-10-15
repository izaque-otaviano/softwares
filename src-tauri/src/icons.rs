use std::collections::{BTreeSet, HashMap};
use std::path::Path;

use regex::Regex;
use resvg::{tiny_skia, usvg};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

pub const CUSTOM: &str = "custom";

#[derive(Deserialize)]
pub struct Icon {
    #[serde(rename = "n")]
    pub name: String,
    #[serde(rename = "b")]
    pub body: String,
    #[serde(rename = "s")]
    pub style: String,
    pub w: f32,
    pub h: f32,
    /// Traço editável: o corpo tem `stroke-width` que podemos reescrever.
    #[serde(rename = "e", default)]
    pub editable: u8,
    /// Variantes prontas por espessura (Phosphor).
    #[serde(rename = "v", default)]
    pub weights: HashMap<String, String>,
}

impl Icon {
    pub fn has_weight(&self) -> bool {
        self.editable == 1 || !self.weights.is_empty()
    }
}

#[derive(Deserialize)]
pub struct Set {
    pub prefix: String,
    pub label: String,
    pub license: String,
    pub icons: Vec<Icon>,
}

pub struct Library {
    pub sets: Vec<Set>,
}

#[derive(Deserialize, Default)]
pub struct RenderOptions {
    /// Cor final (hex). Sem cor, fica `currentColor`.
    pub color: Option<String>,
    /// Espessura do traço numa grade de 24px.
    pub stroke: Option<f32>,
    /// Lado maior do SVG final em px. Sem tamanho, usa o da grade original.
    pub size: Option<u32>,
}

static STROKE_WIDTH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"stroke-width="[^"]*""#).unwrap());
static COLOR_ATTR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(fill|stroke)="(#[0-9a-fA-F]{3,8}|black|white)""#).unwrap());

impl Library {
    pub fn load(dir: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let index: Vec<String> = serde_json::from_slice(&std::fs::read(dir.join("index.json"))?)?;
        let mut sets = Vec::with_capacity(index.len() + 1);
        for prefix in index {
            let data = std::fs::read(dir.join(format!("{prefix}.json")))?;
            sets.push(serde_json::from_slice(&data)?);
        }
        Ok(Self { sets })
    }

    pub fn find(&self, id: &str) -> Option<(&Set, &Icon)> {
        let (prefix, name) = id.split_once(':')?;
        let set = self.sets.iter().find(|s| s.prefix == prefix)?;
        let icon = set.icons.iter().find(|i| i.name == name)?;
        Some((set, icon))
    }

    pub fn svg(&self, id: &str, opts: &RenderOptions) -> Option<String> {
        let (_, icon) = self.find(id)?;
        Some(render(icon, opts))
    }

    /// Recarrega "Meus ícones" a partir da pasta de ícones importados.
    pub fn reload_custom(&mut self, dir: &Path) {
        self.sets.retain(|s| s.prefix != CUSTOM);
        let mut icons = Vec::new();
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.extension().is_some_and(|e| e == "svg") {
                    continue;
                }
                let Some(name) = path.file_stem().and_then(|s| s.to_str()) else { continue };
                let Ok(text) = std::fs::read_to_string(&path) else { continue };
                if let Some(icon) = parse_custom(name, &text) {
                    icons.push(icon);
                }
            }
        }
        icons.sort_by(|a, b| a.name.cmp(&b.name));
        self.sets.insert(
            0,
            Set { prefix: CUSTOM.into(), label: "Meus ícones".into(), license: "Seu".into(), icons },
        );
    }
}

pub fn render(icon: &Icon, opts: &RenderOptions) -> String {
    let mut body = icon.body.clone();
    if let Some(stroke) = opts.stroke {
        if icon.editable == 1 {
            let value = stroke * icon.w / 24.0;
            body = STROKE_WIDTH.replace_all(&body, format!(r#"stroke-width="{value}""#)).into_owned();
        } else if !icon.weights.is_empty() {
            // Escolhe a variante mais próxima; "2" é o corpo padrão.
            let mut best = ("2", &icon.body);
            for (k, v) in &icon.weights {
                let d = (k.parse::<f32>().unwrap_or(2.0) - stroke).abs();
                if d < (best.0.parse::<f32>().unwrap() - stroke).abs() {
                    best = (k.as_str(), v);
                }
            }
            body = best.1.clone();
        }
    }
    if let Some(color) = &opts.color {
        if icon.style != "color" {
            body = body.replace("currentColor", color);
        }
    }
    let (w, h) = (icon.w, icon.h);
    let color_attr = match &opts.color {
        Some(c) if icon.style != "color" => format!(r#" color="{c}""#),
        _ => String::new(),
    };
    // O viewBox fica na grade original; só width/height mudam, então o traço escala junto.
    let (out_w, out_h) = match opts.size {
        Some(size) => {
            let scale = size as f32 / w.max(h);
            ((w * scale).round(), (h * scale).round())
        }
        None => (w, h),
    };
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{out_w}" height="{out_h}" viewBox="0 0 {w} {h}"{color_attr}>{body}</svg>"#
    )
}

pub fn rasterize(svg: &str, size: u32) -> Result<tiny_skia::Pixmap, String> {
    let tree = usvg::Tree::from_str(svg, &usvg::Options::default()).map_err(|e| e.to_string())?;
    let ts = tree.size();
    let scale = size as f32 / ts.width().max(ts.height());
    let (w, h) = ((ts.width() * scale).round() as u32, (ts.height() * scale).round() as u32);
    let mut pixmap = tiny_skia::Pixmap::new(w.max(1), h.max(1)).ok_or("Tamanho inválido")?;
    resvg::render(&tree, tiny_skia::Transform::from_scale(scale, scale), &mut pixmap.as_mut());
    Ok(pixmap)
}

/// Limpa um SVG externo (Illustrator, Figma…) e salva na pasta de importados.
/// Ícones de uma cor só passam a usar `currentColor`, então aceitam troca de cor.
/// Devolve o nome com que o ícone foi salvo (id = "custom:<nome>").
pub fn import_svg(src: &Path, dir: &Path) -> Result<String, String> {
    let data = std::fs::read(src).map_err(|e| e.to_string())?;
    let tree = usvg::Tree::from_data(&data, &usvg::Options::default()).map_err(|e| e.to_string())?;
    let mut clean = tree.to_string(&usvg::WriteOptions::default());

    let colors: BTreeSet<String> = COLOR_ATTR.captures_iter(&clean).map(|c| c[2].to_lowercase()).collect();
    if colors.len() == 1 {
        clean = COLOR_ATTR.replace_all(&clean, r#"$1="currentColor""#).into_owned();
    }

    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("icone");
    let base: String = stem
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let base = if base.is_empty() { "icone".to_string() } else { base };
    let mut name = base.clone();
    let mut n = 2;
    while dir.join(format!("{name}.svg")).exists() {
        name = format!("{base}-{n}");
        n += 1;
    }
    std::fs::write(dir.join(format!("{name}.svg")), clean).map_err(|e| e.to_string())?;
    let mut meta = CustomMeta::load(dir);
    meta.mark_updated(&name, crate::folders::now_ms());
    meta.save(dir)?;
    Ok(name)
}

fn parse_custom(name: &str, text: &str) -> Option<Icon> {
    static VIEWBOX: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)""#).unwrap());
    static SIZE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"\swidth="([\d.]+)[a-z]*"\s+height="([\d.]+)[a-z]*""#).unwrap());
    let start = text.find("<svg")?;
    let open_end = start + text[start..].find('>')? + 1;
    // O usvg grava só width/height; SVGs antigos podem ter viewBox.
    let tag = &text[start..open_end];
    let caps = VIEWBOX.captures(tag).or_else(|| SIZE.captures(tag))?;
    let (w, h) = (caps[1].parse().ok()?, caps[2].parse().ok()?);
    let close = text.rfind("</svg>")?;
    let body = text[open_end..close].trim().to_string();

    let style = if !body.contains("currentColor") {
        "color"
    } else if body.contains(r#"stroke="currentColor""#) && !body.contains(r#"fill="currentColor""#) {
        "line"
    } else {
        "fill"
    };
    let editable = (style == "line" && body.contains("stroke-width=")) as u8;
    Some(Icon { name: name.into(), body, style: style.into(), w, h, editable, weights: HashMap::new() })
}

/// Datas de mudança dos ícones importados, para a sincronização saber qual versão é mais nova.
#[derive(Serialize, Deserialize, Default)]
pub struct CustomMeta {
    #[serde(default)]
    pub updated: HashMap<String, i64>,
    /// Apagados ficam registrados para o apagamento chegar aos outros computadores.
    #[serde(default)]
    pub deleted: HashMap<String, i64>,
}

impl CustomMeta {
    fn path(dir: &Path) -> std::path::PathBuf {
        dir.join(".meta.json")
    }

    pub fn load(dir: &Path) -> Self {
        std::fs::read(Self::path(dir)).ok().and_then(|d| serde_json::from_slice(&d).ok()).unwrap_or_default()
    }

    pub fn save(&self, dir: &Path) -> Result<(), String> {
        std::fs::write(Self::path(dir), serde_json::to_vec(self).unwrap()).map_err(|e| e.to_string())
    }

    pub fn mark_updated(&mut self, name: &str, at: i64) {
        self.deleted.remove(name);
        self.updated.insert(name.into(), at);
    }

    pub fn mark_deleted(&mut self, name: &str, at: i64) {
        self.updated.remove(name);
        self.deleted.insert(name.into(), at);
    }
}
