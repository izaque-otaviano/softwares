//! Backend Windows.
//!
//! * `AddFontResourceExW(path, 0, NULL)` – flags **sem** `FR_PRIVATE`/`FR_NOT_ENUM`, portanto a fonte
//!   fica disponível para todos os processos da sessão interativa (até logoff/reinício).
//! * `RemoveFontResourceExW` – decrementa a contagem de referências do SO por chamada.
//! * `WM_FONTCHANGE` – difundido com `SendMessageTimeoutW(HWND_BROADCAST, …, SMTO_ABORTIFHUNG)`
//!   para que janelas travadas não bloqueiem o app.
//! * Persistência por usuário (Windows 10 1809+): valor em
//!   `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts` com o **caminho completo** do arquivo,
//!   sem copiar para `C:\Windows\Fonts` e sem exigir privilégios de administrador.

use crate::*;
use std::os::windows::ffi::OsStrExt;
use std::process::Command;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{LPARAM, WPARAM};
use windows::Win32::Graphics::Gdi::{AddFontResourceExW, RemoveFontResourceExW, FONT_RESOURCE_CHARACTERISTICS};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
    REG_OPTION_NON_VOLATILE, REG_SZ,
};
use windows::Win32::UI::WindowsAndMessaging::{
    SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_FONTCHANGE,
};

const FONTS_KEY: &str = r"Software\Microsoft\Windows NT\CurrentVersion\Fonts";
// Prefixo que identifica valores criados por este app, para nunca tocar em valores alheios.
const VALUE_PREFIX: &str = "FontManager: ";

pub struct WindowsBackend;

fn wide(s: impl AsRef<std::ffi::OsStr>) -> Vec<u16> {
    s.as_ref().encode_wide().chain(std::iter::once(0)).collect()
}

fn value_name(req: &RegisterRequest) -> String {
    let kind = match req.path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) {
        Some(ref e) if e == "otf" => "OpenType",
        _ => "TrueType",
    };
    // Remove caracteres que não pertencem a um nome de valor de fonte.
    let clean: String = req.display_name.chars().filter(|c| !c.is_control() && *c != '\\').collect();
    format!("{VALUE_PREFIX}{clean} ({kind})")
}

fn broadcast_fontchange() -> Notification {
    let mut result = 0usize;
    // SendMessageTimeoutW devolve 0 em falha/timeout; mesmo assim a maioria das janelas já recebeu.
    let r = unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_FONTCHANGE,
            WPARAM(0),
            LPARAM(0),
            SMTO_ABORTIFHUNG,
            2000,
            Some(&mut result),
        )
    };
    if r.0 != 0 {
        Notification::Broadcast
    } else {
        Notification::NotSent
    }
}

fn set_registry(name: &str, path: &Path) -> Result<()> {
    unsafe {
        let mut key = HKEY::default();
        let sub = wide(FONTS_KEY);
        let rc = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(sub.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        );
        if rc.0 != 0 {
            return Err(NativeError::RegisterFailed(format!("RegCreateKeyExW: erro {}", rc.0)));
        }
        let vname = wide(name);
        let data = wide(path);
        let bytes = std::slice::from_raw_parts(data.as_ptr() as *const u8, data.len() * 2);
        let rc = RegSetValueExW(key, PCWSTR(vname.as_ptr()), None, REG_SZ, Some(bytes));
        let _ = RegCloseKey(key);
        if rc.0 != 0 {
            return Err(NativeError::RegisterFailed(format!("RegSetValueExW: erro {}", rc.0)));
        }
    }
    Ok(())
}

fn delete_registry(name: &str) -> Result<()> {
    unsafe {
        let mut key = HKEY::default();
        let sub = wide(FONTS_KEY);
        let rc = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(sub.as_ptr()),
            None,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_SET_VALUE,
            None,
            &mut key,
            None,
        );
        if rc.0 != 0 {
            return Err(NativeError::UnregisterFailed(format!("RegCreateKeyExW: erro {}", rc.0)));
        }
        let vname = wide(name);
        let rc = RegDeleteValueW(key, PCWSTR(vname.as_ptr()));
        let _ = RegCloseKey(key);
        // ERROR_FILE_NOT_FOUND (2) = já removido: tudo bem.
        if rc.0 != 0 && rc.0 != 2 {
            return Err(NativeError::UnregisterFailed(format!("RegDeleteValueW: erro {}", rc.0)));
        }
    }
    Ok(())
}

impl FontBackend for WindowsBackend {
    fn name(&self) -> &'static str {
        "windows-gdi"
    }

    fn register(&self, req: &RegisterRequest) -> Result<RegisterReport> {
        ensure_file(&req.path)?;
        let p = wide(&req.path);
        // flags = 0: nem FR_PRIVATE nem FR_NOT_ENUM → visível a outros processos.
        let added = unsafe { AddFontResourceExW(PCWSTR(p.as_ptr()), FONT_RESOURCE_CHARACTERISTICS(0), None) };
        if added <= 0 {
            return Err(NativeError::RegisterFailed(
                "AddFontResourceExW retornou 0 (arquivo inválido ou formato não reconhecido pelo GDI)".into(),
            ));
        }
        if req.scope == Scope::Persistent {
            if let Err(e) = set_registry(&value_name(req), &req.path) {
                // Não deixa a fonte "meio registrada": desfaz o registro de sessão.
                unsafe {
                    let _ = RemoveFontResourceExW(PCWSTR(p.as_ptr()), 0, None);
                }
                return Err(e);
            }
        }
        let notification = broadcast_fontchange();
        Ok(RegisterReport {
            registered: true,
            notification,
            faces: Some(added as u32),
            detail: match req.scope {
                Scope::Session => "AddFontResourceExW (sessão)".into(),
                Scope::Persistent => "AddFontResourceExW + HKCU\\…\\Fonts (persistente por usuário)".into(),
            },
        })
    }

    fn unregister(&self, req: &RegisterRequest) -> Result<UnregisterReport> {
        let p = wide(&req.path);
        // Cada AddFontResourceEx incrementa a contagem do SO. Como o arquivo vive no cache
        // gerenciado por este app, removemos até zerar (teto de segurança: 16) — assim um
        // reinício do app dentro da mesma sessão não deixa registros residuais.
        let mut ok = false;
        for _ in 0..16 {
            if unsafe { RemoveFontResourceExW(PCWSTR(p.as_ptr()), 0, None) }.as_bool() {
                ok = true;
            } else {
                break;
            }
        }
        if req.scope == Scope::Persistent {
            delete_registry(&value_name(req))?;
        }
        let notification = broadcast_fontchange();
        if !ok {
            return Err(NativeError::UnregisterFailed(
                "RemoveFontResourceExW retornou FALSE (a fonte não estava registrada neste processo)".into(),
            ));
        }
        Ok(UnregisterReport { unregistered: true, notification, detail: "RemoveFontResourceExW".into() })
    }

    fn visible_to_new_processes(&self, family: &str) -> Option<bool> {
        // Processo separado → enumeração independente do nosso estado interno.
        let script = "Add-Type -AssemblyName System.Drawing; \
            (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }";
        let out = Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", script]).output().ok()?;
        if !out.status.success() {
            return None;
        }
        let want = family.to_lowercase();
        Some(String::from_utf8_lossy(&out.stdout).lines().any(|l| l.trim().to_lowercase() == want))
    }

    fn system_font_dirs(&self) -> Vec<PathBuf> {
        let mut v = Vec::new();
        if let Some(w) = std::env::var_os("WINDIR") {
            v.push(PathBuf::from(w).join("Fonts"));
        }
        if let Some(l) = std::env::var_os("LOCALAPPDATA") {
            v.push(PathBuf::from(l).join(r"Microsoft\Windows\Fonts"));
        }
        v
    }
}
