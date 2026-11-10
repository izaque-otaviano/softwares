//! Cache em disco de arquivos de fonte: download com limite, validação, escrita atômica,
//! caminhos sem path traversal e verificação de integridade por SHA-256.

use crate::db::{CacheFile, Db};
use crate::error::{Error, Result};
use crate::http::{Http, MAX_FONT_BYTES};
use crate::model::RemoteFile;
use crate::validate::validate_font;
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};

#[derive(Clone)]
pub struct FontCache {
    root: PathBuf,
    http: Http,
    db: Db,
}

/// `[a-z0-9-]` apenas; nunca vazio, nunca com separadores ou pontos.
pub fn slug(s: &str) -> String {
    let mut out: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "x".into()
    } else {
        out.chars().take(64).collect()
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

impl FontCache {
    pub fn new(root: PathBuf, http: Http, db: Db) -> Result<Self> {
        std::fs::create_dir_all(root.join("fonts"))?;
        Ok(Self { root, http, db })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Converte caminho relativo do banco em absoluto, recusando `..`, caminhos absolutos
    /// e qualquer coisa que escape da raiz do cache.
    pub fn abs_path(&self, rel: &str) -> Result<PathBuf> {
        // Valida o texto segmento a segmento (Path::components esconde "." intermediários).
        let bad_seg = |s: &str| s.is_empty() || s == "." || s == ".." || s.contains(['\\', ':', '\0']);
        if rel.is_empty() || rel.split('/').any(bad_seg) {
            return Err(Error::UnsafePath(rel.into()));
        }
        let p = Path::new(rel);
        if p.is_absolute() || p.components().any(|c| !matches!(c, Component::Normal(_))) {
            return Err(Error::UnsafePath(rel.into()));
        }
        let full = self.root.join(p);
        if !full.starts_with(&self.root) {
            return Err(Error::UnsafePath(rel.into()));
        }
        Ok(full)
    }

    fn rel_for(provider: &str, family_key: &str, f: &RemoteFile, ext: &str) -> String {
        let vf = if f.variable { "-vf" } else { "" };
        format!("fonts/{}/{}/{}-{}{}.{}", slug(provider), slug(family_key), f.weight, f.style.as_str(), vf, ext)
    }

    /// Garante que o arquivo está em cache e íntegro; baixa se necessário.
    pub async fn ensure(&self, provider_id: &str, family_key: &str, family_name: &str, license: Option<&str>, f: &RemoteFile) -> Result<CacheFile> {
        if !f.format.installable() {
            return Err(Error::InvalidFont(format!("formato {} não é instalável", f.format.as_str())));
        }
        if let Some(cf) = self.db.find_cache_file(family_key, provider_id, f.weight, f.style.as_str(), f.variable)? {
            if self.verify(&cf).is_ok() {
                return Ok(cf);
            }
            tracing::warn!("cache inválido para {family_key}; baixando de novo");
        }
        let bytes = self.http.get_bytes(&f.url, MAX_FONT_BYTES).await?;
        self.store(provider_id, family_key, family_name, license, f, &bytes)
    }

    /// Valida e grava (atomicamente) bytes já obtidos.
    pub fn store(&self, provider_id: &str, family_key: &str, family_name: &str, license: Option<&str>, f: &RemoteFile, bytes: &[u8]) -> Result<CacheFile> {
        let info = validate_font(bytes, MAX_FONT_BYTES)?;
        let rel = Self::rel_for(provider_id, family_key, f, info.format.as_str());
        let path = self.abs_path(&rel)?;
        let dir = path.parent().ok_or_else(|| Error::UnsafePath(rel.clone()))?;
        std::fs::create_dir_all(dir)?;
        // Arquivo temporário no mesmo diretório + rename = escrita atômica.
        let tmp = dir.join(format!(".tmp-{}-{}", std::process::id(), sha256_hex(rel.as_bytes()).get(..8).unwrap_or("0")));
        {
            use std::io::Write;
            let mut fh = std::fs::File::create(&tmp)?;
            fh.write_all(bytes)?;
            fh.sync_all()?;
        }
        if let Err(e) = std::fs::rename(&tmp, &path) {
            let _ = std::fs::remove_file(&tmp);
            return Err(e.into());
        }
        let cf = CacheFile {
            id: 0,
            family_key: family_key.into(),
            family_name: family_name.into(),
            provider_id: provider_id.into(),
            weight: f.weight,
            style: f.style.as_str().into(),
            variable: f.variable || info.variable,
            format: info.format.as_str().into(),
            rel_path: rel,
            sha256: sha256_hex(bytes),
            size: bytes.len() as u64,
            internal_family: info.family,
            internal_style: info.style,
            source_url: f.url.clone(),
            license: license.map(Into::into),
        };
        let id = self.db.insert_cache_file(&cf)?;
        Ok(CacheFile { id, ..cf })
    }

    /// Reconfere tamanho e SHA-256 do arquivo em disco contra o registrado.
    pub fn verify(&self, cf: &CacheFile) -> Result<PathBuf> {
        let path = self.abs_path(&cf.rel_path)?;
        let bytes = std::fs::read(&path).map_err(|_| Error::NotFound(cf.rel_path.clone()))?;
        if bytes.len() as u64 != cf.size || sha256_hex(&bytes) != cf.sha256 {
            return Err(Error::InvalidFont(format!("integridade falhou: {}", cf.rel_path)));
        }
        Ok(path)
    }

    pub fn read_bytes(&self, cf: &CacheFile) -> Result<Vec<u8>> {
        let path = self.verify(cf)?;
        Ok(std::fs::read(path)?)
    }

    /// Apaga o arquivo do cache. Recusa se ainda houver ativação (FK RESTRICT).
    pub fn evict(&self, cf: &CacheFile) -> Result<()> {
        if self.db.activation(cf.id)?.is_some() {
            return Err(Error::Other("desative a fonte antes de limpar o cache".into()));
        }
        let path = self.abs_path(&cf.rel_path)?;
        let _ = std::fs::remove_file(path);
        self.db.delete_cache_file(cf.id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{FileFormat, Style};
    const TTF: &[u8] = include_bytes!("../tests/fixtures/Tiny5-Regular.ttf");

    fn rf(url: &str) -> RemoteFile {
        RemoteFile { weight: 400, style: Style::Normal, format: FileFormat::Ttf, subset: None, variable: false, url: url.into() }
    }

    /// Servidor HTTP local mínimo (somente testes) que serve `body` para qualquer GET.
    async fn serve(body: Vec<u8>) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = l.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                let Ok((mut s, _)) = l.accept().await else { break };
                let body = body.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 2048];
                    let _ = s.read(&mut buf).await;
                    let head = format!("HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len());
                    let _ = s.write_all(head.as_bytes()).await;
                    let _ = s.write_all(&body).await;
                });
            }
        });
        format!("http://127.0.0.1:{port}/f.ttf")
    }

    fn cache(dir: &Path) -> (FontCache, Db) {
        let db = Db::open_in_memory().unwrap();
        (FontCache::new(dir.to_path_buf(), Http::for_tests().unwrap(), db.clone()).unwrap(), db)
    }

    #[tokio::test]
    async fn baixa_valida_e_guarda_em_cache() {
        let tmp = tempfile::tempdir().unwrap();
        let (c, db) = cache(tmp.path());
        let url = serve(TTF.to_vec()).await;
        let cf = c.ensure("google", "tiny5", "Tiny5", Some("OFL-1.1"), &rf(&url)).await.unwrap();
        assert_eq!(cf.internal_family.as_deref(), Some("Tiny5"));
        assert!(c.abs_path(&cf.rel_path).unwrap().is_file());
        assert_eq!(cf.sha256, sha256_hex(TTF));
        assert_eq!(db.cache_files_for_family("tiny5").unwrap().len(), 1);
        // Segunda chamada usa o cache: funciona mesmo sem servidor (offline).
        let cf2 = c.ensure("google", "tiny5", "Tiny5", None, &rf("http://127.0.0.1:1/offline.ttf")).await.unwrap();
        assert_eq!(cf2.id, cf.id);
        // Nenhum .tmp sobrando.
        let dir = c.abs_path(&cf.rel_path).unwrap().parent().unwrap().to_path_buf();
        assert!(std::fs::read_dir(dir).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().starts_with(".tmp")));
    }

    #[tokio::test]
    async fn rejeita_html_disfarcado_de_fonte() {
        let tmp = tempfile::tempdir().unwrap();
        let (c, db) = cache(tmp.path());
        let url = serve(b"<html>captive portal</html>".repeat(100)).await;
        assert!(c.ensure("google", "x", "X", None, &rf(&url)).await.is_err());
        assert!(db.cache_files_for_family("x").unwrap().is_empty());
    }

    #[tokio::test]
    async fn aborta_download_acima_do_limite() {
        let http = Http::for_tests().unwrap();
        let url = serve(vec![0u8; 100_000]).await;
        assert!(matches!(http.get_bytes(&url, 1000).await, Err(Error::TooLarge(_))));
    }

    #[tokio::test]
    async fn bloqueia_origens_nao_permitidas() {
        let http = Http::new().unwrap();
        for u in ["http://fonts.gstatic.com/a.ttf", "https://evil.example.com/a.ttf", "https://user:pw@fonts.gstatic.com/a", "file:///etc/passwd", "ftp://fonts.gstatic.com/a"] {
            assert!(matches!(http.get_bytes(u, 10).await, Err(Error::ForbiddenOrigin(_))), "{u}");
        }
    }

    #[test]
    fn path_traversal_e_slug() {
        let tmp = tempfile::tempdir().unwrap();
        let (c, _) = cache(tmp.path());
        for bad in ["../x", "/etc/passwd", "fonts/../../x", "a/./b", "C:\\\\x"] {
            assert!(c.abs_path(bad).is_err(), "{bad}");
        }
        assert!(c.abs_path("fonts/google/inter/400-normal.ttf").is_ok());
        assert_eq!(slug("../../Open Sans"), "open-sans");
        assert_eq!(slug("////"), "x");
        assert!(!slug("a/b\\c..d").contains(['/', '\\', '.']));
    }

    #[tokio::test]
    async fn detecta_adulteracao_no_disco() {
        let tmp = tempfile::tempdir().unwrap();
        let (c, _) = cache(tmp.path());
        let url = serve(TTF.to_vec()).await;
        let cf = c.ensure("google", "tiny5", "Tiny5", None, &rf(&url)).await.unwrap();
        let p = c.abs_path(&cf.rel_path).unwrap();
        let mut b = std::fs::read(&p).unwrap();
        b[1000] ^= 0xFF;
        std::fs::write(&p, b).unwrap();
        assert!(c.verify(&cf).is_err());
    }

    #[tokio::test]
    async fn evict_recusa_fonte_ativada() {
        let tmp = tempfile::tempdir().unwrap();
        let (c, db) = cache(tmp.path());
        let url = serve(TTF.to_vec()).await;
        let cf = c.ensure("google", "tiny5", "Tiny5", None, &rf(&url)).await.unwrap();
        db.add_activation_ref(
            &crate::db::ActivationRow { cache_file_id: cf.id, scope: fm_native::Scope::Session, display_name: "Tiny5".into(), registered_at: "t".into(), notification: "n".into(), backend: "t".into() },
            "family:tiny5",
        )
        .unwrap();
        assert!(c.evict(&cf).is_err());
        db.remove_ref(cf.id, "family:tiny5").unwrap();
        db.drop_activation(cf.id).unwrap();
        c.evict(&cf).unwrap();
        assert!(!c.abs_path(&cf.rel_path).unwrap().exists());
    }
}
