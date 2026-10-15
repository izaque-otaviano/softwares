//! Barra de menus nativa. Os itens mandam um evento "menu" com o id para a interface.
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>, folders: &[(String, String)]) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        let mut b = MenuItemBuilder::with_id(id, label);
        if let Some(a) = accel {
            b = b.accelerator(a);
        }
        b.build(app)
    };

    let app_menu = SubmenuBuilder::new(app, "IconHub")
        .item(&PredefinedMenuItem::about(app, Some("Sobre o IconHub"), None)?)
        .separator()
        .item(&item("account", "Conta e sincronização…", None)?)
        .item(&item("sync", "Sincronizar agora", Some("CmdOrCtrl+Shift+R"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Ocultar IconHub"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Ocultar outros"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Sair do IconHub"))?)
        .build()?;

    let file = SubmenuBuilder::new(app, "Arquivo")
        .item(&item("new-folder", "Nova pasta…", Some("CmdOrCtrl+Shift+N"))?)
        .item(&item("import", "Importar SVG…", Some("CmdOrCtrl+O"))?)
        .item(&item("export", "Exportar pasta…", Some("CmdOrCtrl+E"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Fechar janela"))?)
        .build()?;

    // Necessário no Mac para copiar/colar dentro dos campos de texto.
    let edit = SubmenuBuilder::new(app, "Editar")
        .item(&PredefinedMenuItem::undo(app, Some("Desfazer"))?)
        .item(&PredefinedMenuItem::redo(app, Some("Refazer"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Recortar"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copiar"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Colar"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("Selecionar tudo"))?)
        .build()?;

    let mut folders_menu = SubmenuBuilder::new(app, "Pastas")
        .item(&item("open:", "Todos os ícones", Some("CmdOrCtrl+1"))?)
        .item(&item("open:folder:favoritos", "Favoritos", Some("CmdOrCtrl+2"))?)
        .item(&item("open:custom", "Meus ícones", Some("CmdOrCtrl+3"))?);
    let user: Vec<_> = folders.iter().filter(|(id, _)| id != "favoritos").collect();
    if !user.is_empty() {
        folders_menu = folders_menu.separator();
        for (id, name) in user {
            folders_menu = folders_menu.item(&item(&format!("open:folder:{id}"), name, None)?);
        }
    }
    let folders_menu: Submenu<R> = folders_menu.separator().item(&item("new-folder-2", "Nova pasta…", None)?).build()?;

    let view = SubmenuBuilder::new(app, "Visualizar")
        .item(&item("toggle-sidebar", "Mostrar/ocultar barra lateral", Some("CmdOrCtrl+Alt+S"))?)
        .item(&item("focus-search", "Buscar", Some("CmdOrCtrl+F"))?)
        .separator()
        .item(&item("theme-auto", "Tema automático", None)?)
        .item(&item("theme-light", "Tema claro", None)?)
        .item(&item("theme-dark", "Tema escuro", Some("CmdOrCtrl+Shift+D"))?)
        .build()?;

    let window = SubmenuBuilder::new(app, "Janela")
        .item(&PredefinedMenuItem::minimize(app, Some("Minimizar"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("Zoom"))?)
        .build()?;

    Menu::with_items(app, &[&app_menu, &file, &edit, &folders_menu, &view, &window])
}

pub fn forward<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let id = if id == "new-folder-2" { "new-folder" } else { id };
    let _ = app.emit("menu", id);
}
