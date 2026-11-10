//! Backend macOS (Core Text).
//!
//! `CTFontManagerRegisterFontsForURL` com `kCTFontManagerScopeSession` (até o logout) ou
//! `kCTFontManagerScopeUser` (persistente). `kCTFontManagerScopeProcess` **não** é usado, pois só
//! valeria para este processo. O Core Text publica a notificação
//! `kCTFontManagerRegisteredFontsChangedNotification` por conta própria; não existe API pública
//! para difundi-la manualmente.

use crate::*;
use objc2_core_foundation::{CFRetained, CFString, CFURL, CFURLPathStyle};
use objc2_core_text::{CTFontManagerScope, CTFontManagerRegisterFontsForURL, CTFontManagerUnregisterFontsForURL};
use std::process::Command;
use std::ptr;

pub struct MacBackend;

fn scope(s: Scope) -> CTFontManagerScope {
    match s {
        Scope::Session => CTFontManagerScope::Session,
        Scope::Persistent => CTFontManagerScope::Persistent,
    }
}

fn url(path: &Path) -> Result<CFRetained<CFURL>> {
    let s = CFString::from_str(&path.to_string_lossy());
    CFURL::with_file_system_path(None, Some(&s), CFURLPathStyle::CFURLPOSIXPathStyle, false)
        .ok_or_else(|| NativeError::RegisterFailed("CFURL inválida".into()))
}

fn describe_error(err: *mut objc2_core_foundation::CFError) -> String {
    if err.is_null() {
        return "erro desconhecido".into();
    }
    // SAFETY: o ponteiro foi preenchido pelo Core Text (regra "Create": somos donos).
    let e = unsafe { CFRetained::from_raw(ptr::NonNull::new_unchecked(err)) };
    format!("{}", e.description().map(|d| d.to_string()).unwrap_or_default())
}

impl FontBackend for MacBackend {
    fn name(&self) -> &'static str {
        "macos-coretext"
    }

    fn register(&self, req: &RegisterRequest) -> Result<RegisterReport> {
        ensure_file(&req.path)?;
        let u = url(&req.path)?;
        let mut err: *mut objc2_core_foundation::CFError = ptr::null_mut();
        let ok = unsafe { CTFontManagerRegisterFontsForURL(&u, scope(req.scope), &mut err) };
        if !ok {
            return Err(NativeError::RegisterFailed(describe_error(err)));
        }
        Ok(RegisterReport {
            registered: true,
            notification: Notification::EmittedBySystem,
            faces: None,
            detail: format!("CTFontManagerRegisterFontsForURL ({:?})", req.scope),
        })
    }

    fn unregister(&self, req: &RegisterRequest) -> Result<UnregisterReport> {
        let u = url(&req.path)?;
        let mut err: *mut objc2_core_foundation::CFError = ptr::null_mut();
        let ok = unsafe { CTFontManagerUnregisterFontsForURL(&u, scope(req.scope), &mut err) };
        if !ok {
            return Err(NativeError::UnregisterFailed(describe_error(err)));
        }
        Ok(UnregisterReport {
            unregistered: true,
            notification: Notification::EmittedBySystem,
            detail: "CTFontManagerUnregisterFontsForURL".into(),
        })
    }

    fn visible_to_new_processes(&self, family: &str) -> Option<bool> {
        // JXA em processo separado: NSFontManager enumera as famílias do SO.
        let script = "ObjC.import('AppKit'); \
            ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies).join('\\n')";
        let out = Command::new("osascript").args(["-l", "JavaScript", "-e", script]).output().ok()?;
        if !out.status.success() {
            return None;
        }
        let want = family.to_lowercase();
        Some(String::from_utf8_lossy(&out.stdout).lines().any(|l| l.trim().to_lowercase() == want))
    }

    fn system_font_dirs(&self) -> Vec<PathBuf> {
        let mut v = vec![PathBuf::from("/System/Library/Fonts"), PathBuf::from("/Library/Fonts")];
        if let Some(h) = std::env::var_os("HOME") {
            v.push(PathBuf::from(h).join("Library/Fonts"));
        }
        v
    }
}
