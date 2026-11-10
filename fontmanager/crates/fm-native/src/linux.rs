//! Backend Linux (desenvolvimento e CI). Usa um diretório de fontes do usuário gerenciado
//! (`$XDG_DATA_HOME/fonts/fontmanager`), links simbólicos e `fc-cache`.
//! Só mexe em links criados por este backend – nunca em fontes do usuário.

use crate::*;
use std::process::Command;

pub struct LinuxBackend {
    dir: PathBuf,
}

impl Default for LinuxBackend {
    fn default() -> Self {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
            .unwrap_or_else(|| PathBuf::from("/tmp"));
        Self { dir: base.join("fonts").join("fontmanager") }
    }
}

impl LinuxBackend {
    pub fn with_dir(dir: PathBuf) -> Self {
        Self { dir }
    }
    fn link_for(&self, req: &RegisterRequest) -> PathBuf {
        // Nome derivado do caminho de origem: único e sem separadores (sem path traversal).
        let mut h: u64 = 0xcbf29ce484222325;
        for b in req.path.to_string_lossy().bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        let ext = req.path.extension().and_then(|e| e.to_str()).unwrap_or("ttf");
        let ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
        self.dir.join(format!("fm-{h:016x}.{ext}"))
    }
    fn refresh(&self) -> Notification {
        match Command::new("fc-cache").arg("-f").arg(&self.dir).status() {
            Ok(s) if s.success() => Notification::CacheRefreshed,
            _ => Notification::NotSent,
        }
    }
}

impl FontBackend for LinuxBackend {
    fn name(&self) -> &'static str {
        "linux-fontconfig"
    }

    fn register(&self, req: &RegisterRequest) -> Result<RegisterReport> {
        ensure_file(&req.path)?;
        std::fs::create_dir_all(&self.dir)?;
        let link = self.link_for(req);
        if link.symlink_metadata().is_ok() {
            std::fs::remove_file(&link)?;
        }
        std::os::unix::fs::symlink(&req.path, &link)
            .map_err(|e| NativeError::RegisterFailed(e.to_string()))?;
        let notification = self.refresh();
        Ok(RegisterReport {
            registered: true,
            notification,
            faces: None,
            detail: format!("link {} (fontconfig)", link.display()),
        })
    }

    fn unregister(&self, req: &RegisterRequest) -> Result<UnregisterReport> {
        let link = self.link_for(req);
        if link.symlink_metadata().is_ok() {
            std::fs::remove_file(&link).map_err(|e| NativeError::UnregisterFailed(e.to_string()))?;
        }
        Ok(UnregisterReport { unregistered: true, notification: self.refresh(), detail: "link removido".into() })
    }

    fn visible_to_new_processes(&self, family: &str) -> Option<bool> {
        let out = Command::new("fc-list").arg(":").arg("family").output().ok()?;
        if !out.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&out.stdout);
        let want = family.to_lowercase();
        Some(text.lines().any(|l| l.split(',').any(|f| f.trim().to_lowercase() == want)))
    }

    fn system_font_dirs(&self) -> Vec<PathBuf> {
        let mut v = vec![PathBuf::from("/usr/share/fonts"), PathBuf::from("/usr/local/share/fonts")];
        if let Some(h) = std::env::var_os("HOME") {
            v.push(PathBuf::from(&h).join(".fonts"));
            v.push(PathBuf::from(h).join(".local/share/fonts"));
        }
        v
    }
}
