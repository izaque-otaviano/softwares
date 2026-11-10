//! Shell Tauri: expõe o núcleo `fm-core` à interface. Toda a lógica vive em `fm-core`/`fm-native`;
//! aqui só há comandos finos, eventos de progresso e o ciclo de vida do app.

use fm_core::css::{CssOutput, CssRequest};
use fm_core::db::{Collection, LocalFamily, LogEntry};
use fm_core::model::*;
use fm_core::service::*;
use fm_native::Scope;
use serde::Serialize;
use std::sync::Arc;
use tauri::{ipc::Response, AppHandle, Emitter, Manager, RunEvent, State};

type Fm<'a> = State<'a, Arc<FontManager>>;
type CmdResult<T> = Result<T, fm_core::Error>;

#[derive(Serialize, Clone)]
struct PhaseEvent<'a> {
    key: &'a str,
    #[serde(flatten)]
    phase: Phase,
}

// ---- catálogo -------------------------------------------------------------------------------

#[tauri::command]
fn query_catalog(fm: Fm, query: CatalogQuery) -> CmdResult<CatalogPage> {
    fm.query(&query)
}

#[tauri::command]
fn family_detail(fm: Fm, key: String) -> CmdResult<FamilyDetail> {
    fm.db.family_detail(&key)
}

#[tauri::command]
fn categories(fm: Fm) -> CmdResult<Vec<String>> {
    fm.db.categories()
}

#[tauri::command]
fn list_providers(fm: Fm) -> Vec<ProviderInfo> {
    fm.providers()
}

#[tauri::command]
fn set_provider_enabled(fm: Fm, id: String, enabled: bool) -> CmdResult<()> {
    fm.db.set_provider_enabled(&id, enabled)
}

#[tauri::command]
async fn sync_catalog(app: AppHandle, fm: Fm<'_>, provider: Option<String>) -> CmdResult<Vec<SyncOutcome>> {
    let _ = app.emit("sync", "start");
    let mut out = Vec::new();
    match provider {
        Some(id) => out.push(SyncOutcome::from((id.clone(), fm.sync_provider(&id).await.map_err(|e| e.to_string())))),
        None => out.extend(fm.sync_all().await.into_iter().map(SyncOutcome::from)),
    }
    let _ = app.emit("sync", "done");
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncOutcome {
    provider_id: String,
    report: Option<SyncReport>,
    error: Option<String>,
}
impl From<(String, Result<SyncReport, String>)> for SyncOutcome {
    fn from((provider_id, r): (String, Result<SyncReport, String>)) -> Self {
        match r {
            Ok(report) => Self { provider_id, report: Some(report), error: None },
            Err(e) => Self { provider_id, report: None, error: Some(e) },
        }
    }
}

// ---- ativação --------------------------------------------------------------------------------

#[tauri::command]
async fn activate_font(app: AppHandle, fm: Fm<'_>, key: String, options: Option<ActivateOptions>) -> CmdResult<ActivationReport> {
    let k = key.clone();
    fm.activate(&key, options.unwrap_or_default(), move |phase| {
        let _ = app.emit("activation", PhaseEvent { key: &k, phase });
    })
    .await
}

#[tauri::command]
async fn download_font(app: AppHandle, fm: Fm<'_>, key: String) -> CmdResult<u32> {
    let k = key.clone();
    fm.download(&key, move |phase| {
        let _ = app.emit("activation", PhaseEvent { key: &k, phase });
    })
    .await
}

#[tauri::command]
async fn deactivate_font(fm: Fm<'_>, key: String) -> CmdResult<DeactivationReport> {
    fm.deactivate(&key, None).await
}

#[tauri::command]
async fn activate_collection(app: AppHandle, fm: Fm<'_>, id: i64) -> CmdResult<Vec<BatchItem>> {
    let keys = fm.db.collection_keys(id)?;
    let res = fm
        .activate_many(&keys, Some(format!("collection:{id}")), |k, phase| {
            let _ = app.emit("activation", PhaseEvent { key: k, phase });
        })
        .await;
    Ok(res.into_iter().map(|(key, r)| BatchItem { key, report: r.as_ref().ok().cloned(), error: r.err() }).collect())
}

#[tauri::command]
async fn deactivate_collection(fm: Fm<'_>, id: i64) -> CmdResult<Vec<DeactivationReport>> {
    let mut out = Vec::new();
    for k in fm.db.collection_keys(id)? {
        out.push(fm.deactivate(&k, Some(format!("collection:{id}"))).await?);
    }
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchItem {
    key: String,
    report: Option<ActivationReport>,
    error: Option<String>,
}

#[tauri::command]
async fn deactivate_all(fm: Fm<'_>) -> CmdResult<u32> {
    fm.deactivate_all().await
}

/// Verificação cruzada: um processo novo enxerga a família? (não prova nada sobre apps abertos)
#[tauri::command]
async fn check_visibility(fm: Fm<'_>, family: String) -> CmdResult<Option<bool>> {
    let fm = fm.inner().clone();
    tokio::task::spawn_blocking(move || fm.visible_to_new_processes(&family)).await.map_err(|e| fm_core::Error::Other(e.to_string()))
}

// ---- web / CSS -------------------------------------------------------------------------------

#[tauri::command]
fn generate_css(fm: Fm, key: String, request: CssRequest) -> CmdResult<CssOutput> {
    fm.generate_css(&key, &request)
}

#[tauri::command]
async fn export_self_hosted(fm: Fm<'_>, key: String, request: CssRequest, dest: String) -> CmdResult<Vec<String>> {
    let files = fm.export_self_hosted(&key, &request, dest.into()).await?;
    Ok(files.into_iter().map(|p| p.to_string_lossy().into_owned()).collect())
}

// ---- prévia offline ----------------------------------------------------------------------------

/// Bytes do arquivo em cache (validados por SHA-256) para prévia sem rede via FontFace.
#[tauri::command]
fn cached_font_bytes(fm: Fm, key: String, weight: Option<u16>, italic: Option<bool>) -> CmdResult<Response> {
    let files = fm.db.cache_files_for_family(&key)?;
    let want_style = if italic.unwrap_or(false) { "italic" } else { "normal" };
    let cf = files
        .iter()
        .find(|f| Some(f.weight) == weight && f.style == want_style)
        .or_else(|| files.iter().find(|f| f.style == want_style && f.weight == 400))
        .or_else(|| files.first())
        .ok_or_else(|| fm_core::Error::NotFound("fonte não está em cache".into()))?;
    Ok(Response::new(fm.cache.read_bytes(cf)?))
}

// ---- favoritos / coleções ---------------------------------------------------------------------

#[tauri::command]
fn set_favorite(fm: Fm, key: String, on: bool) -> CmdResult<()> {
    fm.db.set_favorite(&key, on)
}

#[tauri::command]
fn list_collections(fm: Fm) -> CmdResult<Vec<Collection>> {
    fm.db.collections()
}

#[tauri::command]
fn create_collection(fm: Fm, name: String) -> CmdResult<Collection> {
    fm.db.create_collection(&name)
}

#[tauri::command]
fn rename_collection(fm: Fm, id: i64, name: String) -> CmdResult<()> {
    fm.db.rename_collection(id, &name)
}

#[tauri::command]
fn delete_collection(fm: Fm, id: i64) -> CmdResult<()> {
    fm.db.delete_collection(id)
}

#[tauri::command]
fn collection_member(fm: Fm, id: i64, key: String, member: bool) -> CmdResult<()> {
    fm.db.collection_member(id, &key, member)
}

// ---- locais / configurações / diagnóstico -----------------------------------------------------

#[tauri::command]
async fn local_fonts(fm: Fm<'_>, text: Option<String>, offset: u32, limit: u32, rescan: bool) -> CmdResult<(u32, Vec<LocalFamily>)> {
    let fm = fm.inner().clone();
    tokio::task::spawn_blocking(move || {
        if rescan {
            fm.scan_local()?;
        }
        fm.db.local_families(text.as_deref(), offset, limit)
    })
    .await
    .map_err(|e| fm_core::Error::Other(e.to_string()))?
}

#[tauri::command]
fn get_settings(fm: Fm) -> CmdResult<Vec<(String, String)>> {
    // A chave de API nunca volta para a interface em texto claro.
    Ok(fm.db.all_settings()?.into_iter().map(|(k, v)| if k == "google_api_key" { (k, if v.is_empty() { String::new() } else { "••••••••".into() }) } else { (k, v) }).collect())
}

#[tauri::command]
fn set_setting(fm: Fm, key: String, value: String) -> CmdResult<()> {
    const ALLOWED: &[&str] = &["scope", "prefer_variable", "restore_on_startup", "deactivate_on_exit", "theme", "google_api_key", "preview_text", "language"];
    if !ALLOWED.contains(&key.as_str()) {
        return Err(fm_core::Error::Other(format!("configuração desconhecida: {key}")));
    }
    if key == "scope" && !["session", "persistent"].contains(&value.as_str()) {
        return Err(fm_core::Error::Other("escopo inválido".into()));
    }
    fm.db.set_setting(&key, value.trim())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    backend: &'static str,
    os: &'static str,
    default_scope: Scope,
    cache_bytes: u64,
    catalog_count: u32,
}

#[tauri::command]
fn app_info(fm: Fm) -> CmdResult<AppInfo> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        backend: fm.backend_name(),
        os: std::env::consts::OS,
        default_scope: fm.default_scope(),
        cache_bytes: fm.db.cache_total_bytes()?,
        catalog_count: fm.db.catalog_count()?,
    })
}

#[tauri::command]
fn recent_log(fm: Fm, limit: u32) -> CmdResult<Vec<LogEntry>> {
    fm.db.recent_log(limit.min(500))
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("diretório de dados");
            let fm = Arc::new(FontManager::new(dir, Arc::from(fm_native::default_backend())).expect("inicialização do núcleo"));
            app.manage(fm.clone());
            let handle = app.handle().clone();
            // Segundo plano: inventário local, restauração das ativações e 1ª sincronização.
            tauri::async_runtime::spawn(async move {
                let f2 = fm.clone();
                let _ = tokio::task::spawn_blocking(move || f2.scan_local()).await;
                match fm.restore_activations().await {
                    Ok(n) if n > 0 => {
                        let _ = handle.emit("restored", n);
                    }
                    _ => {}
                }
                if fm.db.catalog_count().unwrap_or(0) == 0 {
                    let _ = handle.emit("sync", "start");
                    let _ = fm.sync_all().await;
                    let _ = handle.emit("sync", "done");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            query_catalog,
            family_detail,
            categories,
            list_providers,
            set_provider_enabled,
            sync_catalog,
            activate_font,
            deactivate_font,
            download_font,
            activate_collection,
            deactivate_collection,
            deactivate_all,
            check_visibility,
            generate_css,
            export_self_hosted,
            cached_font_bytes,
            set_favorite,
            list_collections,
            create_collection,
            rename_collection,
            delete_collection,
            collection_member,
            local_fonts,
            get_settings,
            set_setting,
            app_info,
            recent_log,
        ])
        .build(tauri::generate_context!())
        .expect("erro ao construir o app");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            if let Some(fm) = handle.try_state::<Arc<FontManager>>() {
                if fm.db.get_setting("deactivate_on_exit").ok().flatten().as_deref() == Some("true") {
                    let fm = fm.inner().clone();
                    tauri::async_runtime::block_on(async move {
                        let _ = fm.deactivate_all().await;
                    });
                }
            }
        }
    });
}
