//! Testes de integração do fluxo completo (catálogo → download → validação → registro no SO →
//! desativação) usando o backend REAL do sistema (fontconfig no Linux) e um servidor HTTP local.
//! Não usam Photoshop/Illustrator/Figma/Word; veja docs/TESTING.md.

use async_trait::async_trait;
use fm_core::db::Db;
use fm_core::error::{Error, Result};
use fm_core::http::Http;
use fm_core::model::*;
use fm_core::providers::{FamilyRef, FontProvider, ProviderConfig, Registry};
use fm_core::service::{ActivateOptions, FontManager};
use fm_native::*;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// FONTCONFIG_FILE é global ao processo: os testes que o definem não podem rodar em paralelo.
static FC_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const TTF: &[u8] = include_bytes!("fixtures/Tiny5-Regular.ttf");

async fn serve(body: Vec<u8>) -> String {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = l.local_addr().unwrap().port();
    tokio::spawn(async move {
        loop {
            let Ok((mut s, _)) = l.accept().await else { break };
            let body = body.clone();
            tokio::spawn(async move {
                let mut b = [0u8; 2048];
                let _ = s.read(&mut b).await;
                let _ = s.write_all(format!("HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len()).as_bytes()).await;
                let _ = s.write_all(&body).await;
            });
        }
    });
    format!("http://127.0.0.1:{port}/Tiny5.ttf")
}

struct Fake {
    url: String,
}

#[async_trait]
impl FontProvider for Fake {
    fn info(&self) -> ProviderInfo {
        ProviderInfo { id: "fontsource".into(), name: "Fake".into(), has_catalog: true, can_install_files: true, has_cdn: false, status: ProviderStatus::Ok, note: None }
    }
    async fn fetch_catalog(&self, _: &Http, _: &ProviderConfig) -> Result<Vec<RemoteFamily>> {
        Ok(vec![RemoteFamily {
            provider_id: "fontsource".into(),
            provider_family_id: "tiny5".into(),
            name: "Tiny5".into(),
            category: Some("display".into()),
            origin: Some("other".into()),
            version: Some("1".into()),
            license: Some("OFL-1.1".into()),
            license_url: None,
            last_modified: Some("2024-01-01".into()),
            subsets: vec!["latin".into()],
            weights: vec![400],
            styles: vec![Style::Normal],
            variable: false,
            axes: vec![],
        }])
    }
    async fn resolve_files(&self, _: &Http, _: &FamilyRef) -> Result<Vec<RemoteFile>> {
        Ok(vec![RemoteFile { weight: 400, style: Style::Normal, format: FileFormat::Ttf, subset: None, variable: false, url: self.url.clone() }])
    }
}

/// Backend que sempre recusa o registro (simula arquivo que o SO rejeita).
struct Refusing(Mutex<u32>);
impl FontBackend for Refusing {
    fn name(&self) -> &'static str {
        "refusing"
    }
    fn register(&self, _: &RegisterRequest) -> fm_native::Result<RegisterReport> {
        *self.0.lock().unwrap() += 1;
        Err(NativeError::RegisterFailed("recusado pelo teste".into()))
    }
    fn unregister(&self, _: &RegisterRequest) -> fm_native::Result<UnregisterReport> {
        Ok(UnregisterReport { unregistered: true, notification: Notification::NotSent, detail: String::new() })
    }
    fn visible_to_new_processes(&self, _: &str) -> Option<bool> {
        Some(false)
    }
    fn system_font_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

async fn manager(tmp: &std::path::Path, backend: Arc<dyn FontBackend>) -> FontManager {
    let url = serve(TTF.to_vec()).await;
    let fm = FontManager::assemble(tmp.join("data"), Db::open_in_memory().unwrap(), Http::for_tests().unwrap(), Registry::with(vec![Arc::new(Fake { url })]), backend).unwrap();
    fm.sync_provider("fontsource").await.unwrap();
    fm
}

#[cfg(target_os = "linux")]
fn isolated_fontconfig(tmp: &std::path::Path, dirs: &[&std::path::Path]) {
    let conf = tmp.join("fonts.conf");
    let dirs: String = dirs.iter().map(|d| format!("<dir>{}</dir>", d.display())).collect();
    std::fs::write(&conf, format!("<?xml version=\"1.0\"?><fontconfig><include ignore_missing=\"yes\">/etc/fonts/fonts.conf</include>{dirs}<cachedir>{}</cachedir></fontconfig>", tmp.join("fccache").display())).unwrap();
    std::env::set_var("FONTCONFIG_FILE", &conf);
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread")]
async fn ativa_desativa_com_backend_real_e_referencias() {
    let _g = FC_LOCK.lock().await;
    let tmp = tempfile::tempdir().unwrap();
    let managed = tmp.path().join("managed");
    isolated_fontconfig(tmp.path(), &[&managed]);
    let backend = Arc::new(LinuxBackend::with_dir(managed.clone()));
    let fm = manager(tmp.path(), backend.clone()).await;

    assert_eq!(fm.visible_to_new_processes("Tiny5"), Some(false), "pré-condição: ainda não instalada");

    let phases = Arc::new(Mutex::new(Vec::new()));
    let ph = phases.clone();
    let rep = fm.activate("tiny5", ActivateOptions::default(), move |p| ph.lock().unwrap().push(format!("{p:?}"))).await.unwrap();

    assert_eq!(rep.outcome, "activated");
    assert!(rep.registered_in_os);
    assert_eq!(rep.notification, Notification::CacheRefreshed);
    assert_eq!(rep.visible_to_new_processes, Some(true), "processo novo (fc-list) enxerga a fonte");
    // O terceiro estado nunca é "confirmado" automaticamente.
    assert_eq!(rep.app_recognition, fm_core::service::AppRecognition::NotVerifiable);
    let ph = phases.lock().unwrap().join(" | ");
    for expected in ["Resolving", "Downloading", "Registering", "ActiveInSystem", "WaitingApp"] {
        assert!(ph.contains(expected), "fase ausente {expected}: {ph}");
    }
    assert_eq!(fm.query(&CatalogQuery { limit: 10, ..Default::default() }).unwrap().items[0].state, ActivationState::Active);

    // Segundo dono (coleção) pede a mesma fonte: não registra de novo.
    fm.activate("tiny5", ActivateOptions { owner: Some("collection:1".into()), ..Default::default() }, |_| {}).await.unwrap();

    // Desativar a família mantém o arquivo: a coleção ainda precisa dele.
    let d1 = fm.deactivate("tiny5", None).await.unwrap();
    assert_eq!((d1.unregistered, d1.kept_by_other_owners), (0, 1));
    assert_eq!(fm.visible_to_new_processes("Tiny5"), Some(true));

    // Último dono sai: desregistra de fato.
    let d2 = fm.deactivate("tiny5", Some("collection:1".into())).await.unwrap();
    assert_eq!(d2.unregistered, 1);
    assert_eq!(fm.visible_to_new_processes("Tiny5"), Some(false));
    // O cache é preservado (offline).
    assert_eq!(fm.db.cache_files_for_family("tiny5").unwrap().len(), 1);
    assert!(fm.db.all_activations().unwrap().is_empty());
}

#[cfg(target_os = "linux")]
#[tokio::test(flavor = "multi_thread")]
async fn nao_toca_em_fonte_preexistente_do_usuario() {
    let _g = FC_LOCK.lock().await;
    let tmp = tempfile::tempdir().unwrap();
    let user_fonts = tmp.path().join("user-fonts");
    std::fs::create_dir_all(&user_fonts).unwrap();
    let user_file = user_fonts.join("Tiny5-Regular.ttf");
    std::fs::write(&user_file, TTF).unwrap();
    let managed = tmp.path().join("managed");
    isolated_fontconfig(tmp.path(), &[&managed, &user_fonts]);
    let backend = Arc::new(LinuxBackend::with_dir(managed.clone()));
    let fm = manager(tmp.path(), backend).await;
    fm.db.local_apply(&[(user_file.to_string_lossy().into(), "Tiny5".into(), None, Some(400), false, TTF.len() as i64, 1)], &[]).unwrap();

    let rep = fm.activate("tiny5", ActivateOptions::default(), |_| {}).await.unwrap();
    assert_eq!(rep.outcome, "already_in_system");
    assert!(!rep.registered_in_os);
    assert!(!managed.exists() || std::fs::read_dir(&managed).map(|d| d.count()).unwrap_or(0) == 0, "nada registrado");
    // Desativar algo que o app nunca ativou não remove o arquivo do usuário.
    let d = fm.deactivate("tiny5", None).await.unwrap();
    assert_eq!(d.unregistered, 0);
    assert!(user_file.is_file());
    assert_eq!(fm.query(&CatalogQuery { limit: 10, ..Default::default() }).unwrap().items[0].state, ActivationState::System);
}

#[tokio::test(flavor = "multi_thread")]
async fn nunca_mostra_sucesso_se_o_registro_falhou() {
    let tmp = tempfile::tempdir().unwrap();
    let backend = Arc::new(Refusing(Mutex::new(0)));
    let fm = manager(tmp.path(), backend.clone()).await;
    let phases = Arc::new(Mutex::new(Vec::new()));
    let ph = phases.clone();
    let r = fm.activate("tiny5", ActivateOptions::default(), move |p| ph.lock().unwrap().push(format!("{p:?}"))).await;
    assert!(matches!(r, Err(Error::Native(_))), "{r:?}");
    let ph = phases.lock().unwrap().join(" | ");
    assert!(ph.contains("Error"));
    assert!(!ph.contains("ActiveInSystem") && !ph.contains("WaitingApp"), "{ph}");
    assert!(fm.db.all_activations().unwrap().is_empty());
    assert_eq!(fm.query(&CatalogQuery { limit: 10, ..Default::default() }).unwrap().items[0].state, ActivationState::Inactive);
    assert_eq!(*backend.0.lock().unwrap(), 1);
}

#[tokio::test(flavor = "multi_thread")]
async fn rejeita_download_corrompido_antes_do_registro() {
    let tmp = tempfile::tempdir().unwrap();
    let backend = Arc::new(Refusing(Mutex::new(0)));
    let bad = serve(b"<html>erro</html>".repeat(100)).await;
    let fm = FontManager::assemble(tmp.path().join("d"), Db::open_in_memory().unwrap(), Http::for_tests().unwrap(), Registry::with(vec![Arc::new(Fake { url: bad })]), backend.clone()).unwrap();
    fm.sync_provider("fontsource").await.unwrap();
    assert!(fm.activate("tiny5", ActivateOptions::default(), |_| {}).await.is_err());
    assert_eq!(*backend.0.lock().unwrap(), 0, "o SO nem foi chamado");
}

#[tokio::test(flavor = "multi_thread")]
async fn rejeita_variante_que_nao_existe_no_catalogo() {
    let tmp = tempfile::tempdir().unwrap();
    let backend = Arc::new(Refusing(Mutex::new(0)));
    let fm = manager(tmp.path(), backend.clone()).await;
    let r = fm
        .activate("tiny5", ActivateOptions { variants: Some(vec![VariantView { weight: 900, style: Style::Italic }]), ..Default::default() }, |_| {})
        .await;
    let msg = r.unwrap_err().to_string();
    assert!(msg.contains("900 italic"), "{msg}");
    assert_eq!(*backend.0.lock().unwrap(), 0);
}

#[tokio::test(flavor = "multi_thread")]
async fn baixar_guarda_em_cache_sem_registrar_no_sistema() {
    let tmp = tempfile::tempdir().unwrap();
    let backend = Arc::new(Refusing(Mutex::new(0)));
    let fm = manager(tmp.path(), backend.clone()).await;
    assert_eq!(fm.download("tiny5", |_| {}).await.unwrap(), 1);
    assert_eq!(*backend.0.lock().unwrap(), 0, "baixar não chama o SO");
    let s = &fm.query(&CatalogQuery { limit: 10, ..Default::default() }).unwrap().items[0];
    assert!(s.cached);
    assert_eq!(s.state, ActivationState::Inactive);
}
