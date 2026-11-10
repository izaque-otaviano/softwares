//! Testes de integração REAIS contra o sistema operacional em que rodam.
//!
//! Registram uma fonte de verdade (Tiny5, OFL) no escopo de sessão e confirmam, **a partir de um
//! processo separado** (PowerShell/osascript/fc-list), que o SO a enumera; depois desregistram e
//! confirmam que sumiu. Alteram a lista de fontes da sessão atual (de forma reversível), por isso só
//! rodam com `FM_OS_TESTS=1` (a CI define). Não envolvem Photoshop/Illustrator/Figma/Word — ver
//! docs/TESTING.md para o roteiro manual com esses aplicativos.
//!
//!   FM_OS_TESTS=1 cargo test -p fm-native --test os_integration -- --nocapture --test-threads=1

use fm_native::*;
use std::time::{Duration, Instant};

const TTF: &[u8] = include_bytes!("../../fm-core/tests/fixtures/Tiny5-Regular.ttf");

fn enabled() -> bool {
    let on = std::env::var("FM_OS_TESTS").as_deref() == Ok("1");
    if !on {
        eprintln!("(ignorado: defina FM_OS_TESTS=1 para registrar uma fonte de teste no SO)");
    }
    on
}

fn wait_for(backend: &dyn FontBackend, family: &str, want: bool) -> Option<bool> {
    let end = Instant::now() + Duration::from_secs(20);
    loop {
        let v = backend.visible_to_new_processes(family);
        if v == Some(want) || v.is_none() || Instant::now() > end {
            return v;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn request(dir: &std::path::Path, scope: Scope) -> RegisterRequest {
    let path = dir.join("Tiny5-Regular.ttf");
    std::fs::write(&path, TTF).unwrap();
    RegisterRequest { path, scope, display_name: "Tiny5 Regular FMTEST".into() }
}

#[test]
fn registra_e_desregistra_no_escopo_de_sessao() {
    if !enabled() {
        return;
    }
    let backend = default_backend();
    let tmp = tempfile::tempdir().unwrap();
    let req = request(tmp.path(), Scope::Session);
    assert_eq!(backend.visible_to_new_processes("Tiny5"), Some(false), "pré-condição: Tiny5 não deve estar instalada");

    let rep = backend.register(&req).expect("registro");
    println!("[{}] registro: {rep:?}", backend.name());
    assert!(rep.registered);
    assert_ne!(rep.notification, Notification::NotSent, "a notificação de mudança deve ter sido emitida");

    assert_eq!(wait_for(&*backend, "Tiny5", true), Some(true), "um processo novo deve enxergar a fonte registrada");

    let un = backend.unregister(&req).expect("desregistro");
    assert!(un.unregistered);
    assert_eq!(wait_for(&*backend, "Tiny5", false), Some(false), "após desregistrar, nenhum processo novo deve enxergá-la");
    assert!(req.path.is_file(), "o arquivo do usuário/cache nunca é apagado pelo desregistro");
}

#[test]
fn recusa_arquivo_inexistente_e_arquivo_invalido() {
    if !enabled() {
        return;
    }
    let backend = default_backend();
    let tmp = tempfile::tempdir().unwrap();
    let missing = RegisterRequest { path: tmp.path().join("nao-existe.ttf"), scope: Scope::Session, display_name: "x".into() };
    assert!(matches!(backend.register(&missing), Err(NativeError::MissingFile(_))));
    let junk = tmp.path().join("lixo.ttf");
    std::fs::write(&junk, vec![0x41u8; 4096]).unwrap();
    let r = backend.register(&RegisterRequest { path: junk, scope: Scope::Session, display_name: "lixo".into() });
    assert!(r.is_err(), "o SO deve recusar arquivo que não é fonte: {r:?}");
}

#[cfg(windows)]
#[test]
fn escopo_persistente_grava_e_remove_a_chave_do_usuario() {
    if !enabled() {
        return;
    }
    let backend = default_backend();
    let tmp = tempfile::tempdir().unwrap();
    let req = request(tmp.path(), Scope::Persistent);
    backend.register(&req).expect("registro persistente");
    let q = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts", "/v", "FontManager: Tiny5 Regular FMTEST (TrueType)"])
        .output()
        .unwrap();
    let out = String::from_utf8_lossy(&q.stdout).to_string();
    assert!(q.status.success() && out.contains("Tiny5-Regular.ttf"), "valor de registro ausente: {out}");
    backend.unregister(&req).expect("desregistro");
    let q = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts", "/v", "FontManager: Tiny5 Regular FMTEST (TrueType)"])
        .output()
        .unwrap();
    assert!(!q.status.success(), "o valor de registro deveria ter sido removido");
}
