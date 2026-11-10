use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Style {
    Normal,
    Italic,
}
impl Style {
    pub fn as_str(self) -> &'static str {
        match self {
            Style::Normal => "normal",
            Style::Italic => "italic",
        }
    }
    pub fn parse(s: &str) -> Option<Style> {
        match s {
            "normal" | "regular" => Some(Style::Normal),
            "italic" | "oblique" => Some(Style::Italic),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Axis {
    pub tag: String,
    pub min: f64,
    pub max: f64,
    pub default: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileFormat {
    Ttf,
    Otf,
    Woff2,
    Woff,
}
impl FileFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            FileFormat::Ttf => "ttf",
            FileFormat::Otf => "otf",
            FileFormat::Woff2 => "woff2",
            FileFormat::Woff => "woff",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "ttf" => Self::Ttf,
            "otf" => Self::Otf,
            "woff2" => Self::Woff2,
            "woff" => Self::Woff,
            _ => return None,
        })
    }
    /// Formatos que o SO consegue registrar.
    pub fn installable(&self) -> bool {
        matches!(self, FileFormat::Ttf | FileFormat::Otf)
    }
}

/// Arquivo remoto de uma variante, resolvido por um provedor.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RemoteFile {
    pub weight: u16,
    pub style: Style,
    pub format: FileFormat,
    pub subset: Option<String>,
    pub variable: bool,
    pub url: String,
}

/// Família como um provedor a descreve (antes da deduplicação).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RemoteFamily {
    pub provider_id: String,
    pub provider_family_id: String,
    pub name: String,
    pub category: Option<String>,
    /// Origem declarada (ex.: "google" quando o Fontsource espelha o Google Fonts).
    pub origin: Option<String>,
    pub version: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub last_modified: Option<String>,
    pub subsets: Vec<String>,
    pub weights: Vec<u16>,
    pub styles: Vec<Style>,
    pub variable: bool,
    pub axes: Vec<Axis>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStatus {
    Ok,
    /// Precisa de configuração (ex.: chave de API).
    NeedsConfig,
    /// Integração não implementada por limitação técnica/legal documentada.
    NotAvailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub has_catalog: bool,
    pub can_install_files: bool,
    pub has_cdn: bool,
    pub status: ProviderStatus,
    pub note: Option<String>,
}

// ---- Visões para a interface ------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceView {
    pub provider_id: String,
    pub provider_family_id: String,
    pub origin: Option<String>,
    pub version: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub last_modified: Option<String>,
    pub subsets: Vec<String>,
    pub variable: bool,
    pub axes: Vec<Axis>,
    pub variants: Vec<VariantView>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct VariantView {
    pub weight: u16,
    pub style: Style,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivationState {
    Inactive,
    /// Ativada por este app.
    Active,
    /// Ativada só parcialmente (algumas variantes).
    Partial,
    /// Já existia no sistema (não gerenciada por este app).
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilySummary {
    pub key: String,
    pub name: String,
    pub category: Option<String>,
    pub providers: Vec<String>,
    pub weights: Vec<u16>,
    pub has_italic: bool,
    pub variable: bool,
    pub license: Option<String>,
    pub favorite: bool,
    pub state: ActivationState,
    pub cached: bool,
    /// Há algum arquivo TTF/OTF obtenível de forma autorizada (para ativar).
    pub installable: bool,
    /// Provedor que serve prévia via CDN: "google" | "fontsource" | "bunny" | null.
    pub preview_cdn: Option<String>,
    /// Identificador a usar na CDN de prévia (nome da família no Google; id no Fontsource).
    pub preview_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyDetail {
    pub summary: FamilySummary,
    pub sources: Vec<SourceView>,
    pub collections: Vec<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogQuery {
    pub text: Option<String>,
    pub category: Option<String>,
    pub provider: Option<String>,
    pub variable_only: bool,
    pub italic_only: bool,
    /// all | active | local | favorites | collection
    pub view: Option<String>,
    pub collection_id: Option<i64>,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogPage {
    pub total: u32,
    pub items: Vec<FamilySummary>,
}
