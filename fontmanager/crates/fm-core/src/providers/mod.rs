//! Arquitetura de adaptadores: cada provedor implementa [`FontProvider`]. Para adicionar um
//! provedor basta implementar o trait e registrá-lo em [`Registry::new`] — o núcleo não muda.

use crate::error::Result;
use crate::http::Http;
use crate::model::*;
use async_trait::async_trait;
use std::sync::Arc;

pub mod bunny;
pub mod fontshare;
pub mod fontsource;
pub mod google;

#[derive(Debug, Clone, Default)]
pub struct ProviderConfig {
    /// Chave da API Developer do Google Fonts (opcional, gratuita). Sem ela o catálogo vem do Fontsource.
    pub google_api_key: Option<String>,
}

/// O que o adaptador precisa saber da família para resolver arquivos.
#[derive(Debug, Clone)]
pub struct FamilyRef {
    pub name: String,
    pub provider_family_id: String,
    pub variants: Vec<VariantView>,
    pub variable: bool,
}

#[async_trait]
pub trait FontProvider: Send + Sync {
    fn info(&self) -> ProviderInfo;

    /// Lista as famílias do provedor (metadados; sem URLs de arquivo).
    async fn fetch_catalog(&self, http: &Http, cfg: &ProviderConfig) -> Result<Vec<RemoteFamily>>;

    /// Resolve URLs de arquivos TTF/OTF/WOFF2 para as variantes pedidas.
    async fn resolve_files(&self, http: &Http, fam: &FamilyRef) -> Result<Vec<RemoteFile>>;
}

pub struct Registry {
    providers: Vec<Arc<dyn FontProvider>>,
}

impl Registry {
    pub fn new() -> Self {
        Self {
            providers: vec![
                Arc::new(fontsource::Fontsource),
                Arc::new(google::GoogleFonts),
                Arc::new(bunny::BunnyFonts),
                Arc::new(fontshare::Fontshare),
            ],
        }
    }
    pub fn with(providers: Vec<Arc<dyn FontProvider>>) -> Self {
        Self { providers }
    }
    pub fn all(&self) -> &[Arc<dyn FontProvider>] {
        &self.providers
    }
    pub fn get(&self, id: &str) -> Option<Arc<dyn FontProvider>> {
        self.providers.iter().find(|p| p.info().id == id).cloned()
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

// ---- utilitários de parsing tolerante -----------------------------------------------------------

pub(crate) fn num(v: &serde_json::Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

pub(crate) fn str_list(v: Option<&serde_json::Value>) -> Vec<String> {
    v.and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default()
}
