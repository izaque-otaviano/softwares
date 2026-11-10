//! Integração do Font Squirrel: catálogo → detalhes → pacote ZIP → MD5 → validação → regra de licença
//! → registro. Servidor HTTP local servindo respostas e pacote REAIS capturados da API
//! (tests/fixtures/fontsquirrel). O backend do SO aqui só registra as chamadas: o registro real no SO
//! já é coberto por fm-native/tests/os_integration.rs.

use fm_core::db::Db;
use fm_core::http::Http;
use fm_core::providers::{fontsquirrel::FontSquirrel, Registry};
use fm_core::service::{ActivateOptions, FontManager};
use fm_native::*;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

const SIX_ZIP: &[u8] = include_bytes!("fixtures/fontsquirrel/six-caps.zip");
const SIX_INFO: &str = include_str!("fixtures/fontsquirrel/six-caps.familyinfo.json");

/// Backend que aceita tudo e conta as chamadas.
#[derive(Default)]
struct Recording(Mutex<Vec<String>>);
impl FontBackend for Recording {
    fn name(&self) -> &'static str {
        "recording"
    }
    fn register(&self, r: &RegisterRequest) -> fm_native::Result<RegisterReport> {
        self.0.lock().unwrap().push(format!("+{}", r.path.file_name().unwrap().to_string_lossy()));
        Ok(RegisterReport { registered: true, notification: Notification::Broadcast, faces: Some(1), detail: String::new() })
    }
    fn unregister(&self, r: &RegisterRequest) -> fm_native::Result<UnregisterReport> {
        self.0.lock().unwrap().push(format!("-{}", r.path.file_name().unwrap().to_string_lossy()));
        Ok(UnregisterReport { unregistered: true, notification: Notification::Broadcast, detail: String::new() })
    }
    fn visible_to_new_processes(&self, _: &str) -> Option<bool> {
        None
    }
    fn system_font_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

/// Pacote "Freebie": a fonte OFL Six Caps reempacotada com uma licença Freeware (só para o teste).
fn freeware_zip() -> Vec<u8> {
    let font = zip::ZipArchive::new(std::io::Cursor::new(SIX_ZIP)).unwrap().by_name("SixCaps.ttf").map(|mut f| {
        let mut b = Vec::new();
        std::io::Read::read_to_end(&mut f, &mut b).unwrap();
        b
    }).unwrap();
    let mut buf = std::io::Cursor::new(Vec::new());
    {
        let mut z = zip::ZipWriter::new(&mut buf);
        let o = zip::write::SimpleFileOptions::default();
        z.start_file("SixCaps.ttf", o).unwrap();
        z.write_all(&font).unwrap();
        z.start_file("Freeware License.txt", o).unwrap();
        z.write_all(b"This font was found on the internet and did not come with a license.").unwrap();
        z.finish().unwrap();
    }
    buf.into_inner()
}

async fn serve(routes: HashMap<String, Vec<u8>>) -> (String, Arc<Mutex<bool>>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let up = Arc::new(Mutex::new(true));
    let up2 = up.clone();
    let routes = Arc::new(routes);
    let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = l.local_addr().unwrap().port();
    tokio::spawn(async move {
        loop {
            let Ok((mut s, _)) = l.accept().await else { break };
            let routes = routes.clone();
            let up = *up2.lock().unwrap();
            tokio::spawn(async move {
                let mut b = [0u8; 4096];
                let n = s.read(&mut b).await.unwrap_or(0);
                let req = String::from_utf8_lossy(&b[..n]);
                let path = req.split_whitespace().nth(1).unwrap_or("/").to_string();
                let (status, body) = match (up, routes.get(&path)) {
                    (true, Some(b)) => ("200 OK", b.clone()),
                    (false, _) => ("503 Service Unavailable", b"offline".to_vec()),
                    _ => ("404 Not Found", b"nao encontrado".to_vec()),
                };
                let _ = s.write_all(format!("HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n", body.len()).as_bytes()).await;
                let _ = s.write_all(&body).await;
            });
        }
    });
    (format!("http://127.0.0.1:{port}"), up)
}

async fn setup(tmp: &std::path::Path, bad_md5: bool) -> (FontManager, Arc<Recording>, Arc<Mutex<bool>>) {
    let list = serde_json::json!([
        {"id":"1","family_name":"Six Caps","family_urlname":"six-caps","foundry_name":"Vernon Adams","classification":"Display","family_count":"1"},
        {"id":"2","family_name":"Freebie","family_urlname":"freebie","foundry_name":"Desconhecida","classification":"Display","family_count":"1"}
    ]);
    let info = if bad_md5 { SIX_INFO.replace("e788d8c87cd314c2f79d9d8db10269b7", "00000000000000000000000000000000") } else { SIX_INFO.to_string() };
    let mut routes = HashMap::new();
    routes.insert("/api/fontlist/all".into(), list.to_string().into_bytes());
    routes.insert("/api/familyinfo/six-caps".into(), info.clone().into_bytes());
    routes.insert("/api/familyinfo/freebie".into(), info.into_bytes());
    routes.insert("/fonts/download/six-caps".into(), SIX_ZIP.to_vec());
    routes.insert("/fonts/download/freebie".into(), freeware_zip());
    let (base, up) = serve(routes).await;
    let backend = Arc::new(Recording::default());
    let fm = FontManager::assemble(
        tmp.join("d"),
        Db::open_in_memory().unwrap(),
        Http::for_tests().unwrap(),
        Registry::with(vec![Arc::new(FontSquirrel::with_base(base))]),
        backend.clone(),
    )
    .unwrap();
    let r = fm.sync_provider("fontsquirrel").await.unwrap();
    assert_eq!(r.inserted, 2);
    (fm, backend, up)
}

#[tokio::test(flavor = "multi_thread")]
async fn ofl_ativa_direto_com_md5_e_licenca_lida_do_pacote() {
    let tmp = tempfile::tempdir().unwrap();
    let (fm, backend, _) = setup(tmp.path(), false).await;

    // Antes de baixar: licença desconhecida, prévia e variantes vêm do familyinfo.
    let d = fm.ensure_details("sixcaps").await.unwrap().unwrap();
    assert!(d.preview_image.unwrap().starts_with("https://www.fontsquirrel.com/fbimg/"));
    assert!(fm.db.family_detail("sixcaps").unwrap().summary.license.is_none());

    let rep = fm.activate("sixcaps", ActivateOptions::default(), |_| {}).await.unwrap();
    assert_eq!(rep.outcome, "activated", "{}", rep.message);
    assert_eq!(rep.license.as_deref(), Some("OFL-1.1"));
    assert!(rep.registered_in_os);
    assert_eq!(backend.0.lock().unwrap().as_slice(), ["+sixcaps.ttf"]);
    // A licença lida do pacote passa a valer para a família (e para o gerador de CSS).
    assert_eq!(fm.db.family_detail("sixcaps").unwrap().summary.license.as_deref(), Some("OFL-1.1"));
    let cf = &fm.db.cache_files_for_family("sixcaps").unwrap()[0];
    assert_eq!(cf.internal_family.as_deref(), Some("Six Caps"));
    assert_eq!(cf.license.as_deref(), Some("OFL-1.1"));
}

#[tokio::test(flavor = "multi_thread")]
async fn licenca_fora_de_ofl_apache_exige_confirmacao() {
    let tmp = tempfile::tempdir().unwrap();
    let (fm, backend, _) = setup(tmp.path(), false).await;

    let rep = fm.activate("freebie", ActivateOptions::default(), |_| {}).await.unwrap();
    assert_eq!(rep.outcome, "license_required");
    assert_eq!(rep.license.as_deref(), Some("Freeware"));
    assert!(rep.license_text.unwrap().contains("did not come with a license"));
    assert!(!rep.registered_in_os);
    assert!(backend.0.lock().unwrap().is_empty(), "nada pode ser registrado sem o aceite");
    assert!(fm.db.all_activations().unwrap().is_empty());
    // O pacote já foi baixado (fica disponível offline), mas não ativado.
    assert_eq!(fm.db.cache_files_for_family("freebie").unwrap().len(), 1);

    let rep = fm.activate("freebie", ActivateOptions { accept_license: true, ..Default::default() }, |_| {}).await.unwrap();
    assert_eq!(rep.outcome, "activated");
    assert_eq!(backend.0.lock().unwrap().len(), 1);

    // O aceite fica guardado: desativar e ativar de novo não pergunta outra vez.
    fm.deactivate("freebie", None).await.unwrap();
    let rep = fm.activate("freebie", ActivateOptions::default(), |_| {}).await.unwrap();
    assert_eq!(rep.outcome, "activated");
}

#[tokio::test(flavor = "multi_thread")]
async fn md5_divergente_bloqueia_antes_de_gravar_ou_registrar() {
    let tmp = tempfile::tempdir().unwrap();
    let (fm, backend, _) = setup(tmp.path(), true).await;
    let err = fm.activate("sixcaps", ActivateOptions::default(), |_| {}).await.unwrap_err().to_string();
    assert!(err.contains("MD5"), "{err}");
    assert!(backend.0.lock().unwrap().is_empty());
    assert!(fm.db.cache_files_for_family("sixcaps").unwrap().is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn depois_de_baixar_funciona_offline() {
    let tmp = tempfile::tempdir().unwrap();
    let (fm, backend, up) = setup(tmp.path(), false).await;
    assert_eq!(fm.download("sixcaps", |_| {}).await.unwrap(), 1);
    assert!(backend.0.lock().unwrap().is_empty(), "baixar não registra");
    *up.lock().unwrap() = false; // servidor fora do ar
    let rep = fm.activate("sixcaps", ActivateOptions::default(), |_| {}).await.unwrap();
    assert_eq!(rep.outcome, "activated");
}
