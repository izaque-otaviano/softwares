//! Bunny Fonts – CDN compatível com a API CSS do Google Fonts, focada em privacidade
//! (<https://fonts.bunny.net>). Serve **apenas CSS/WOFF2**: não fornece TTF/OTF para ativação.
//! Não possui catálogo próprio neste app: reutiliza o catálogo compartilhado (Fontsource/Google)
//! e só oferece o CDN para famílias de origem Google (o Bunny espelha o catálogo do Google Fonts).
//! Nenhum endpoint de listagem é consultado, para não depender de API não documentada.

use super::*;

pub struct BunnyFonts;

#[async_trait]
impl FontProvider for BunnyFonts {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "bunny".into(),
            name: "Bunny Fonts".into(),
            has_catalog: false,
            can_install_files: false,
            has_cdn: true,
            status: ProviderStatus::Ok,
            note: Some("Somente CDN (CSS/WOFF2). Usa o catálogo compartilhado; não serve arquivos para instalação local.".into()),
        }
    }

    async fn fetch_catalog(&self, _http: &Http, _cfg: &ProviderConfig) -> Result<Vec<RemoteFamily>> {
        Ok(vec![])
    }

    async fn resolve_files(&self, _http: &Http, _fam: &FamilyRef) -> Result<Vec<RemoteFile>> {
        Err(crate::error::Error::Unavailable("Bunny Fonts não distribui TTF/OTF para instalação".into()))
    }
}
