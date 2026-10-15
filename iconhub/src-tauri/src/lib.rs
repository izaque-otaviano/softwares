mod folders;
mod icons;
mod menu;
mod profile;
mod search;
mod sync;
#[cfg(test)]
mod tests;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};

use folders::{Entry, Formats, Store};
use icons::{Library, RenderOptions};
use serde::Serialize;
use tauri::Emitter;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    library: RwLock<Library>,
    /// Raiz dos dados do app; o perfil local fica aqui.
    base: PathBuf,
    /// Pasta do perfil aberto (local ou da conta).
    profile: RwLock<PathBuf>,
    folders: Mutex<Store>,
    session: Mutex<Option<sync::Session>>,
    session_path: PathBuf,
    syncing: AtomicBool,
}

impl AppState {
    fn custom_dir(&self) -> PathBuf {
        profile::custom_dir(&self.profile.read().unwrap())
    }

    /// Troca o perfil aberto: pastas, importados e a coleção "Meus ícones".
    fn open_profile(&self, dir: PathBuf) -> std::result::Result<(), String> {
        let custom = profile::custom_dir(&dir);
        std::fs::create_dir_all(&custom).map_err(|e| e.to_string())?;
        *self.folders.lock().unwrap() = Store::load(profile::folders_path(&dir));
        self.library.write().unwrap().reload_custom(&custom);
        *self.profile.write().unwrap() = dir;
        Ok(())
    }
}

type Result<T> = std::result::Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[derive(Serialize)]
struct CollectionInfo {
    prefix: String,
    label: String,
    license: String,
    count: usize,
}

#[tauri::command]
fn collections(state: State<AppState>) -> Vec<CollectionInfo> {
    let lib = state.library.read().unwrap();
    lib.sets
        .iter()
        .map(|s| CollectionInfo {
            prefix: s.prefix.clone(),
            label: s.label.clone(),
            license: s.license.clone(),
            count: s.icons.len(),
        })
        .collect()
}

#[tauri::command]
fn search(state: State<AppState>, query: search::Query) -> search::Page {
    let lib = state.library.read().unwrap();
    search::run(&lib, &query)
}

fn render(state: &State<AppState>, id: &str, opts: &RenderOptions) -> Result<String> {
    state.library.read().unwrap().svg(id, opts).ok_or_else(|| "Ícone não encontrado".into())
}

/// SVG para exibir na tela: espessura aplicada, cor herdada da interface.
#[tauri::command]
fn preview(state: State<AppState>, id: String, stroke: Option<f32>) -> Result<String> {
    render(&state, &id, &RenderOptions { color: None, stroke, size: None })
}

#[tauri::command]
fn copy_svg(state: State<AppState>, id: String, opts: RenderOptions) -> Result<()> {
    let svg = render(&state, &id, &opts)?;
    arboard::Clipboard::new().and_then(|mut c| c.set_text(svg)).map_err(err)
}

#[tauri::command]
fn copy_png(state: State<AppState>, id: String, opts: RenderOptions, size: u32) -> Result<()> {
    let svg = render(&state, &id, &opts)?;
    let pixmap = icons::rasterize(&svg, size)?;
    let mut bytes = Vec::with_capacity((pixmap.width() * pixmap.height() * 4) as usize);
    for p in pixmap.pixels() {
        let c = p.demultiply();
        bytes.extend_from_slice(&[c.red(), c.green(), c.blue(), c.alpha()]);
    }
    let image = arboard::ImageData {
        width: pixmap.width() as usize,
        height: pixmap.height() as usize,
        bytes: bytes.into(),
    };
    arboard::Clipboard::new().and_then(|mut c| c.set_image(image)).map_err(err)
}

/// Gera o arquivo final (SVG ou PNG) e devolve os bytes.
fn export_bytes(state: &State<AppState>, id: &str, opts: &RenderOptions, format: &str, size: u32) -> Result<Vec<u8>> {
    let svg = render(state, id, opts)?;
    if format == "png" {
        icons::rasterize(&svg, size)?.encode_png().map_err(err)
    } else {
        Ok(svg.into_bytes())
    }
}

fn file_name(id: &str, format: &str) -> String {
    let name = id.split(':').nth(1).unwrap_or(id);
    format!("{name}.{format}")
}

#[tauri::command]
async fn save_icon(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    opts: RenderOptions,
    format: String,
    size: u32,
) -> Result<bool> {
    let bytes = export_bytes(&state, &id, &opts, &format, size)?;
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(file_name(&id, &format))
        .add_filter(format.to_uppercase(), &[format.as_str()])
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path.into_path().map_err(err)?;
    std::fs::write(path, bytes).map_err(err)?;
    Ok(true)
}

/// Arrastar para fora: grava o ícone num arquivo temporário e entrega esse
/// arquivo ao sistema, como se viesse do Finder/Explorer.
#[tauri::command]
fn start_drag(
    window: tauri::WebviewWindow,
    state: State<AppState>,
    id: String,
    opts: RenderOptions,
    format: String,
    size: u32,
) -> Result<()> {
    let bytes = export_bytes(&state, &id, &opts, &format, size)?;
    let dir = std::env::temp_dir().join("iconhub-drag");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.join(file_name(&id, &format));
    std::fs::write(&path, bytes).map_err(err)?;

    let svg = render(&state, &id, &opts)?;
    let preview = icons::rasterize(&svg, 64)?.encode_png().map_err(err)?;

    let w = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = drag::start_drag(
                &w,
                drag::DragItem::Files(vec![path]),
                drag::Image::Raw(preview),
                |_, _| {},
                drag::Options::default(),
            );
        })
        .map_err(err)
}

#[derive(Serialize)]
struct Imported {
    /// Ids dos ícones criados ("custom:<nome>").
    ids: Vec<String>,
    /// Sugestão de nome de pasta: a pasta de origem, quando veio de uma.
    suggestion: Option<String>,
}

#[tauri::command]
fn import_files(state: State<AppState>, paths: Vec<String>) -> Result<Imported> {
    let mut ids = Vec::new();
    let mut suggestion = None;
    for p in &paths {
        let path = PathBuf::from(p);
        let files: Vec<PathBuf> = if path.is_dir() {
            if suggestion.is_none() {
                suggestion = path.file_name().map(|n| n.to_string_lossy().into_owned());
            }
            std::fs::read_dir(&path).map_err(err)?.flatten().map(|e| e.path()).collect()
        } else {
            vec![path]
        };
        for f in files {
            if f.extension().is_some_and(|e| e.eq_ignore_ascii_case("svg")) {
                if let Ok(name) = icons::import_svg(&f, &state.custom_dir()) {
                    ids.push(format!("custom:{name}"));
                }
            }
        }
    }
    state.library.write().unwrap().reload_custom(&state.custom_dir());
    Ok(Imported { ids, suggestion })
}

#[tauri::command]
async fn import_dialog(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Imported> {
    let Some(files) = app.dialog().file().add_filter("SVG", &["svg"]).blocking_pick_files() else {
        return Ok(Imported { ids: vec![], suggestion: None });
    };
    let paths = files
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    import_files(state, paths)
}

#[tauri::command]
fn delete_custom(state: State<AppState>, id: String) -> Result<()> {
    let name = id.strip_prefix("custom:").ok_or("Só é possível apagar ícones importados")?;
    std::fs::remove_file(state.custom_dir().join(format!("{name}.svg"))).map_err(err)?;
    let mut meta = icons::CustomMeta::load(&state.custom_dir());
    meta.mark_deleted(name, folders::now_ms());
    meta.save(&state.custom_dir())?;
    state.library.write().unwrap().reload_custom(&state.custom_dir());
    state.folders.lock().unwrap().forget_icon(&id)
}

// ---------- Favoritos e pastas ----------

#[derive(Serialize)]
struct FolderInfo {
    id: String,
    name: String,
    count: usize,
}

#[derive(Serialize)]
struct FolderItem {
    entry: Entry,
    name: String,
    collection: String,
    license: String,
    style: String,
    svg: String,
}

#[tauri::command]
fn folders(state: State<AppState>) -> Vec<FolderInfo> {
    let store = state.folders.lock().unwrap();
    store
        .visible()
        .map(|f| FolderInfo { id: f.id.clone(), name: f.name.clone(), count: f.items.len() })
        .collect()
}

/// A interface chama sempre que as pastas mudam, para o menu Pastas acompanhar.
#[tauri::command]
fn refresh_menu(app: tauri::AppHandle, state: State<AppState>) -> Result<()> {
    let list: Vec<(String, String)> = {
        let store = state.folders.lock().unwrap();
        store.visible().map(|f| (f.id.clone(), f.name.clone())).collect()
    };
    app.set_menu(menu::build(&app, &list).map_err(err)?).map_err(err)?;
    Ok(())
}

#[tauri::command]
fn favorite_ids(state: State<AppState>) -> Vec<String> {
    let store = state.folders.lock().unwrap();
    store.folder(folders::FAVORITES).map(|f| f.items.iter().map(|e| e.icon.clone()).collect()).unwrap_or_default()
}

/// Pastas onde este ícone já está (para marcar no menu "Salvar em pasta").
#[tauri::command]
fn folders_with(state: State<AppState>, icon: String) -> Vec<String> {
    let store = state.folders.lock().unwrap();
    store.visible().filter(|f| f.items.iter().any(|e| e.icon == icon)).map(|f| f.id.clone()).collect()
}

#[tauri::command]
fn folder_items(state: State<AppState>, id: String, text: String) -> Result<Vec<FolderItem>> {
    let store = state.folders.lock().unwrap();
    let lib = state.library.read().unwrap();
    let folder = store.folder(&id)?;
    let text = text.to_lowercase();
    Ok(folder
        .items
        .iter()
        .filter_map(|entry| {
            let (set, icon) = lib.find(&entry.icon)?;
            if !text.is_empty() && !text.split_whitespace().all(|t| icon.name.contains(t)) {
                return None;
            }
            // Na tela, cor e tamanho vêm do CSS (a interface aplica a cor salva e ajusta
            // cores escuras no tema escuro); só a espessura salva vai no desenho.
            let opts = RenderOptions { color: None, stroke: entry.stroke, size: None };
            Some(FolderItem {
                entry: entry.clone(),
                name: icon.name.clone(),
                collection: set.label.clone(),
                license: set.license.clone(),
                style: icon.style.clone(),
                svg: icons::render(icon, &opts),
            })
        })
        .collect())
}

#[tauri::command]
fn toggle_favorite(state: State<AppState>, entry: Entry) -> Result<bool> {
    state.folders.lock().unwrap().toggle_favorite(entry)
}

#[tauri::command]
fn add_to_folder(state: State<AppState>, id: String, entry: Entry) -> Result<()> {
    state.folders.lock().unwrap().add(&id, entry)
}

#[tauri::command]
fn add_many_to_folder(state: State<AppState>, id: String, entries: Vec<Entry>) -> Result<()> {
    state.folders.lock().unwrap().add_many(&id, entries)
}

#[tauri::command]
fn remove_from_folder(state: State<AppState>, id: String, entry: Entry) -> Result<()> {
    state.folders.lock().unwrap().remove(&id, &entry)
}

#[tauri::command]
fn remove_entries(state: State<AppState>, id: String, entries: Vec<Entry>) -> Result<()> {
    state.folders.lock().unwrap().remove_many(&id, &entries)
}

#[tauri::command]
fn update_entries(state: State<AppState>, id: String, entries: Vec<Entry>, change: folders::EntryChange) -> Result<()> {
    state.folders.lock().unwrap().update_many(&id, &entries, &change)
}

#[tauri::command]
fn transfer_entries(state: State<AppState>, from: String, to: String, entries: Vec<Entry>, remove: bool) -> Result<()> {
    state.folders.lock().unwrap().transfer(&from, &to, &entries, remove)
}

/// Copia vários ícones como um bloco de SVGs (um por linha), para colar no Figma.
#[tauri::command]
fn copy_entries_svg(state: State<AppState>, entries: Vec<Entry>) -> Result<usize> {
    let lib = state.library.read().unwrap();
    let svgs: Vec<String> = entries.iter().filter_map(|e| lib.svg(&e.icon, &e.opts())).collect();
    let n = svgs.len();
    arboard::Clipboard::new().and_then(|mut c| c.set_text(svgs.join("\n"))).map_err(err)?;
    Ok(n)
}

#[tauri::command]
fn create_folder(state: State<AppState>, name: String) -> Result<String> {
    state.folders.lock().unwrap().create(&name)
}

#[tauri::command]
fn rename_folder(state: State<AppState>, id: String, name: String) -> Result<()> {
    state.folders.lock().unwrap().rename(&id, &name)
}

#[tauri::command]
fn delete_folder(state: State<AppState>, id: String) -> Result<()> {
    state.folders.lock().unwrap().delete(&id)
}

/// Exporta a pasta inteira (ou só `entries`, quando vier). Devolve o caminho criado, ou nada se cancelou.
#[tauri::command]
async fn export_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    formats: Formats,
    zip: bool,
    entries: Option<Vec<Entry>>,
) -> Result<Option<String>> {
    let (name, files) = {
        let store = state.folders.lock().unwrap();
        let lib = state.library.read().unwrap();
        // Sem pasta (ex.: seleção em Meus ícones): exporta só os itens recebidos.
        let picked = if id.is_empty() {
            let items = entries.clone().ok_or("Nada para exportar")?;
            folders::Folder { id: String::new(), name: "Meus ícones".into(), items, updated_at: 0, deleted: false }
        } else {
            let mut f = store.folder(&id)?.clone();
            if let Some(only) = &entries {
                f.items.retain(|e| only.contains(e));
            }
            f
        };
        (picked.name.clone(), folders::files(&lib, &picked, formats)?)
    };
    let dialog = app.dialog().file();
    let target = if zip {
        let Some(path) = dialog
            .set_file_name(format!("{}.zip", folders::slug(&name)))
            .add_filter("ZIP", &["zip"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = path.into_path().map_err(err)?;
        folders::write_zip(&path, &files)?;
        path
    } else {
        let Some(parent) = dialog.blocking_pick_folder() else { return Ok(None) };
        folders::write_dir(&parent.into_path().map_err(err)?, &name, &files)?
    };
    let _ = app.emit("exported", ());
    Ok(Some(target.to_string_lossy().into_owned()))
}

// ---------- Conta e sincronização ----------

#[derive(Serialize)]
struct Account {
    email: String,
}

#[derive(Serialize)]
struct SignedIn {
    email: String,
    /// Primeira vez desta conta neste computador e há coisas no perfil local:
    /// a interface pergunta se leva para a conta.
    local: Option<profile::Summary>,
}

#[tauri::command]
fn account(state: State<AppState>) -> Option<Account> {
    state.session.lock().unwrap().as_ref().map(|s| Account { email: s.email.clone() })
}

fn set_session(state: &State<'_, AppState>, session: Option<sync::Session>) -> Result<()> {
    sync::save_session(&state.session_path, session.as_ref())?;
    *state.session.lock().unwrap() = session;
    Ok(())
}

#[tauri::command]
async fn sign_in(state: State<'_, AppState>, email: String, password: String, create: bool) -> Result<SignedIn> {
    if email.trim().is_empty() || password.is_empty() {
        return Err("Preencha e-mail e senha.".into());
    }
    let session =
        if create { sync::sign_up(&email, &password).await? } else { sync::sign_in(&email, &password).await? };
    let dir = profile::account_dir(&state.base, &session.user_id);
    let first_time = !dir.exists();
    let summary = profile::summary(&profile::local_dir(&state.base));
    let email = session.email.clone();
    set_session(&state, Some(session))?;
    state.open_profile(dir)?;
    Ok(SignedIn { email, local: (first_time && !summary.is_empty()).then_some(summary) })
}

/// Leva o que está no perfil local para a conta aberta (sem apagar o local).
#[tauri::command]
fn merge_local(state: State<AppState>) -> Result<profile::Summary> {
    if state.session.lock().unwrap().is_none() {
        return Err("Entre na sua conta primeiro.".into());
    }
    let custom = state.custom_dir();
    let done = {
        let mut store = state.folders.lock().unwrap();
        profile::merge(&profile::local_dir(&state.base), &mut store, &custom)?
    };
    state.library.write().unwrap().reload_custom(&custom);
    Ok(done)
}

/// Sai: apaga deste computador os dados da conta (eles continuam na nuvem)
/// e volta para o perfil local.
#[tauri::command]
fn sign_out(state: State<AppState>) -> Result<()> {
    let user = state.session.lock().unwrap().as_ref().map(|s| s.user_id.clone());
    set_session(&state, None)?;
    state.open_profile(profile::local_dir(&state.base))?;
    if let Some(user) = user {
        let dir = profile::account_dir(&state.base, &user);
        if dir.exists() {
            std::fs::remove_dir_all(dir).map_err(err)?;
        }
    }
    Ok(())
}

/// Sessão válida, renovando o acesso quando está perto de vencer.
async fn session(state: &State<'_, AppState>) -> Result<sync::Session> {
    let current = state.session.lock().unwrap().clone().ok_or("Entre na sua conta para sincronizar.")?;
    if !sync::needs_refresh(&current) {
        return Ok(current);
    }
    match sync::refresh(&current).await {
        Ok(fresh) => {
            set_session(state, Some(fresh.clone()))?;
            Ok(fresh)
        }
        Err(e) => {
            if !e.starts_with("Sem conexão") {
                set_session(state, None)?;
            }
            Err(e)
        }
    }
}

#[tauri::command]
async fn change_password(state: State<'_, AppState>, password: String) -> Result<()> {
    let s = session(&state).await?;
    sync::change_password(&s, &password).await
}

#[derive(Serialize)]
struct SyncResult {
    /// Veio algo novo da nuvem: a interface precisa recarregar.
    changed: bool,
}

#[tauri::command]
async fn sync_now(state: State<'_, AppState>) -> Result<SyncResult> {
    if state.syncing.swap(true, Ordering::SeqCst) {
        return Ok(SyncResult { changed: false });
    }
    let result = run_sync(&state).await;
    state.syncing.store(false, Ordering::SeqCst);
    result
}

async fn run_sync(state: &State<'_, AppState>) -> Result<SyncResult> {
    let s = session(state).await?;
    let dir = state.profile.read().unwrap().clone();
    let (remote_folders, remote_icons) = sync::fetch(&s).await?;
    // Se a pessoa saiu da conta durante o download, não mistura com o perfil local.
    if *state.profile.read().unwrap() != dir || state.session.lock().unwrap().is_none() {
        return Ok(SyncResult { changed: false });
    }

    let (push_folders, applied_folders) = {
        let mut store = state.folders.lock().unwrap();
        let (push, apply) = sync::plan_folders(&store.folders, remote_folders);
        let n = apply.len();
        store.apply_remote(apply)?;
        (push, n)
    };

    let local = sync::local_icons(&state.custom_dir());
    let (push_icons, apply_icons) = sync::plan_icons(&local, remote_icons);
    sync::apply_icons(&state.custom_dir(), &apply_icons)?;
    if !apply_icons.is_empty() {
        state.library.write().unwrap().reload_custom(&state.custom_dir());
    }

    sync::push(&s, &push_folders, &push_icons).await?;
    Ok(SyncResult { changed: applied_folders > 0 || !apply_icons.is_empty() })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_menu_event(|app, event| menu::forward(app, event.id().as_ref()))
        .setup(|app| {
            let icons_dir = app.path().resolve("icons", tauri::path::BaseDirectory::Resource)?;
            let base = app.path().app_data_dir()?;
            let session_path = base.join("session.json");
            let session = sync::load_session(&session_path);
            // Com conta, abre o perfil dela; sem conta, o local.
            let dir = match &session {
                Some(s) => profile::account_dir(&base, &s.user_id),
                None => profile::local_dir(&base),
            };
            let custom_dir = profile::custom_dir(&dir);
            std::fs::create_dir_all(&custom_dir)?;
            let mut library = Library::load(&icons_dir)?;
            library.reload_custom(&custom_dir);
            let folders = Store::load(profile::folders_path(&dir));
            let list: Vec<(String, String)> = folders.visible().map(|f| (f.id.clone(), f.name.clone())).collect();
            app.set_menu(menu::build(app.handle(), &list)?)?;
            app.manage(AppState {
                library: RwLock::new(library),
                base,
                profile: RwLock::new(dir),
                folders: Mutex::new(folders),
                session: Mutex::new(session),
                session_path,
                syncing: AtomicBool::new(false),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            collections,
            search,
            preview,
            copy_svg,
            copy_png,
            save_icon,
            start_drag,
            import_files,
            import_dialog,
            delete_custom,
            folders,
            refresh_menu,
            favorite_ids,
            folders_with,
            folder_items,
            toggle_favorite,
            add_to_folder,
            add_many_to_folder,
            remove_from_folder,
            remove_entries,
            update_entries,
            transfer_entries,
            copy_entries_svg,
            create_folder,
            rename_folder,
            delete_folder,
            export_folder,
            account,
            sign_in,
            merge_local,
            sign_out,
            change_password,
            sync_now
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o app");
}
