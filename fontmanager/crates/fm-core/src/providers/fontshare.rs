//! Fontshare (Indian Type Foundry).
//!
//! **Integração não implementada – limitação documentada.**
//! O Fontshare não publica uma API pública documentada e estável para terceiros: o site distribui
//! as fontes por download manual de pacotes ZIP sob a "ITF Free Font License", cujos termos
//! precisam ser aceitos pelo usuário no próprio site. Consumir endpoints internos do site ou
//! automatizar downloads sem esse aceite equivaleria a scraping que pode violar os termos de uso,
//! o que o projeto proíbe. A arquitetura está pronta: quando existir API/licença que autorize
//! catálogo, cache e instalação, basta implementar `fetch_catalog` e `resolve_files` aqui.
//! Enquanto isso, o usuário pode baixar o ZIP no site e instalar o arquivo como fonte local
//! (aparece em "Fontes locais" depois de instalada no sistema).

use super::*;

pub struct Fontshare;

pub const REASON: &str = "Sem API pública documentada nem licença que autorize cache/instalação automatizados; \
    baixe o pacote no site do Fontshare e instale manualmente.";

#[async_trait]
impl FontProvider for Fontshare {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: "fontshare".into(),
            name: "Fontshare".into(),
            has_catalog: false,
            can_install_files: false,
            has_cdn: false,
            status: ProviderStatus::NotAvailable,
            note: Some(REASON.into()),
        }
    }

    async fn fetch_catalog(&self, _http: &Http, _cfg: &ProviderConfig) -> Result<Vec<RemoteFamily>> {
        Err(crate::error::Error::Unavailable(REASON.into()))
    }

    async fn resolve_files(&self, _http: &Http, _fam: &FamilyRef) -> Result<Vec<RemoteFile>> {
        Err(crate::error::Error::Unavailable(REASON.into()))
    }
}
