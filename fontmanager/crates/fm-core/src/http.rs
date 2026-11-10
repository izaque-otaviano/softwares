//! Cliente HTTP restrito: só HTTPS, só origens permitidas (inclusive em redirecionamentos),
//! com timeouts e limite de tamanho por resposta.

use crate::error::{Error, Result};
use futures_util::StreamExt;
use std::sync::Arc;
use std::time::Duration;
use url::Url;

/// Origens que o app aceita contatar. Nada fora desta lista é baixado.
pub const ALLOWED_HOSTS: &[&str] = &[
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "www.googleapis.com",
    "api.fontsource.org",
    "cdn.jsdelivr.net",
    "data.jsdelivr.com",
    "fonts.bunny.net",
    "www.fontsquirrel.com",
];

pub const MAX_FONT_BYTES: u64 = 30 * 1024 * 1024;
pub const MAX_CATALOG_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_TEXT_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Clone)]
pub struct Http {
    client: reqwest::Client,
    policy: Arc<Policy>,
}

#[derive(Debug)]
struct Policy {
    hosts: Vec<String>,
    /// Somente testes: permite http://127.0.0.1.
    allow_loopback_http: bool,
}

impl Policy {
    fn check(&self, url: &Url) -> Result<()> {
        let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
        if self.allow_loopback_http && url.scheme() == "http" && (host == "127.0.0.1" || host == "localhost") {
            return Ok(());
        }
        if url.scheme() != "https" {
            return Err(Error::ForbiddenOrigin(format!("esquema {} não permitido", url.scheme())));
        }
        if !url.username().is_empty() || url.password().is_some() {
            return Err(Error::ForbiddenOrigin("credenciais na URL".into()));
        }
        if self.hosts.iter().any(|h| h == &host) {
            Ok(())
        } else {
            Err(Error::ForbiddenOrigin(host))
        }
    }
}

impl Http {
    pub fn new() -> Result<Self> {
        Self::build(ALLOWED_HOSTS.iter().map(|s| s.to_string()).collect(), false)
    }

    /// Somente para testes com servidor local.
    pub fn for_tests() -> Result<Self> {
        Self::build(ALLOWED_HOSTS.iter().map(|s| s.to_string()).collect(), true)
    }

    fn build(hosts: Vec<String>, allow_loopback_http: bool) -> Result<Self> {
        let policy = Arc::new(Policy { hosts, allow_loopback_http });
        let p2 = policy.clone();
        let redirect = reqwest::redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= 4 {
                return attempt.error("redirecionamentos demais");
            }
            match p2.check(attempt.url()) {
                Ok(()) => attempt.follow(),
                Err(e) => attempt.error(e.to_string()),
            }
        });
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(90))
            .redirect(redirect)
            // Sem User-Agent de navegador: o Google Fonts responde com TTF para clientes desconhecidos.
            .user_agent("FontManager/0.1")
            .build()?;
        Ok(Self { client, policy })
    }

    pub fn check_url(&self, url: &str) -> Result<Url> {
        let u = Url::parse(url).map_err(|e| Error::ForbiddenOrigin(format!("URL inválida: {e}")))?;
        self.policy.check(&u)?;
        Ok(u)
    }

    /// Baixa no máximo `max` bytes; aborta assim que o limite é excedido.
    pub async fn get_bytes(&self, url: &str, max: u64) -> Result<Vec<u8>> {
        let u = self.check_url(url)?;
        let resp = self.client.get(u).send().await?;
        let status = resp.status();
        if !status.is_success() {
            return Err(Error::Http(format!("HTTP {status}")));
        }
        // 202 sem conteúdo = o site pediu uma verificação de navegador (proteção anti-robôs).
        // Não tentamos contornar: o app se identifica honestamente e informa o bloqueio.
        if status == reqwest::StatusCode::ACCEPTED && resp.content_length().unwrap_or(0) == 0 {
            return Err(Error::Unavailable(
                "o site recusou o acesso automático deste app (HTTP 202 sem conteúdo, proteção anti-robôs)".into(),
            ));
        }
        if let Some(len) = resp.content_length() {
            if len > max {
                return Err(Error::TooLarge(format!("{len} bytes > {max}")));
            }
        }
        let mut out = Vec::new();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            if out.len() as u64 + chunk.len() as u64 > max {
                return Err(Error::TooLarge(format!("resposta excede {max} bytes")));
            }
            out.extend_from_slice(&chunk);
        }
        Ok(out)
    }

    pub async fn get_text(&self, url: &str) -> Result<String> {
        let b = self.get_bytes(url, MAX_TEXT_BYTES).await?;
        String::from_utf8(b).map_err(|_| Error::Http("resposta não é UTF-8".into()))
    }

    pub async fn get_json(&self, url: &str, max: u64) -> Result<serde_json::Value> {
        let b = self.get_bytes(url, max).await?;
        Ok(serde_json::from_slice(&b)?)
    }
}
