//! Camada nativa de registro de fontes.
//!
//! Cada sistema operacional tem um backend que implementa [`FontBackend`]:
//!
//! * **Windows** – `AddFontResourceExW` (sem `FR_PRIVATE`, para que outros processos vejam a fonte),
//!   `RemoveFontResourceExW`, difusão de `WM_FONTCHANGE` e, no escopo persistente, o registro por
//!   usuário em `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts`.
//! * **macOS** – `CTFontManagerRegisterFontsForURL` / `CTFontManagerUnregisterFontsForURL` do Core Text,
//!   com escopo `Session` ou `User` (persistente). O próprio Core Text emite
//!   `kCTFontManagerRegisteredFontsChangedNotification`.
//! * **Linux** – backend de desenvolvimento/CI (fontconfig + `fc-cache`), não é alvo de distribuição.
//!
//! Três estados distintos são mantidos separados em [`RegisterReport`]:
//! 1. fonte registrada no SO (`registered`);
//! 2. notificação de mudança emitida (`notification`);
//! 3. reconhecimento pelo aplicativo — **nunca** inferido aqui: não existe API pública para isso.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows_impl;

#[derive(Debug, thiserror::Error)]
pub enum NativeError {
    #[error("arquivo de fonte inexistente: {0}")]
    MissingFile(PathBuf),
    #[error("o sistema recusou o registro da fonte: {0}")]
    RegisterFailed(String),
    #[error("falha ao remover o registro da fonte: {0}")]
    UnregisterFailed(String),
    #[error("falha de E/S: {0}")]
    Io(#[from] std::io::Error),
    #[error("operação não suportada neste sistema: {0}")]
    Unsupported(&'static str),
}

pub type Result<T> = std::result::Result<T, NativeError>;

/// Duração do registro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Scope {
    /// Vale até o logoff/reinício (Windows: só `AddFontResourceEx`; macOS: `kCTFontManagerScopeSession`).
    Session,
    /// Persiste entre sessões, por usuário (Windows: chave HKCU; macOS: `kCTFontManagerScopeUser`).
    Persistent,
}

/// Resultado da notificação de mudança de fontes ao sistema.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Notification {
    /// Windows: `WM_FONTCHANGE` difundido; alguns janelas podem ter expirado (timeout).
    Broadcast,
    /// macOS: emitida pelo Core Text no registro (não há API de difusão manual).
    EmittedBySystem,
    /// Linux: `fc-cache` executado.
    CacheRefreshed,
    /// Nenhuma notificação foi possível.
    NotSent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub path: PathBuf,
    pub scope: Scope,
    /// Nome de exibição único (ex.: "Inter Bold"), usado como chave no registro do Windows.
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterReport {
    /// Estado 1: o SO aceitou o registro.
    pub registered: bool,
    /// Estado 2: houve notificação de mudança.
    pub notification: Notification,
    /// Quantas fontes (faces) o SO reportou adicionar, quando disponível.
    pub faces: Option<u32>,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnregisterReport {
    pub unregistered: bool,
    pub notification: Notification,
    pub detail: String,
}

pub trait FontBackend: Send + Sync {
    fn name(&self) -> &'static str;
    fn register(&self, req: &RegisterRequest) -> Result<RegisterReport>;
    fn unregister(&self, req: &RegisterRequest) -> Result<UnregisterReport>;
    /// Pergunta, a partir de um **processo novo**, se a família é enumerada pelo SO.
    /// `None` = não foi possível verificar. Isto NÃO prova que um app já aberto reconhece a fonte.
    fn visible_to_new_processes(&self, family: &str) -> Option<bool>;
    /// Diretórios onde o SO guarda fontes (para inventário local).
    fn system_font_dirs(&self) -> Vec<PathBuf>;
}

/// Backend do sistema atual.
pub fn default_backend() -> Box<dyn FontBackend> {
    #[cfg(windows)]
    {
        Box::new(windows_impl::WindowsBackend)
    }
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacBackend)
    }
    #[cfg(target_os = "linux")]
    {
        Box::new(linux::LinuxBackend::default())
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        compile_error!("sistema operacional não suportado")
    }
}

#[cfg(target_os = "linux")]
pub use linux::LinuxBackend;

pub(crate) fn ensure_file(path: &Path) -> Result<()> {
    if path.is_file() {
        Ok(())
    } else {
        Err(NativeError::MissingFile(path.to_path_buf()))
    }
}
