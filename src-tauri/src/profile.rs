//! Perfis: "local" (sem conta) e um por conta. Cada perfil tem as próprias
//! pastas (folders.json) e ícones importados (custom/).
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::folders::{now_ms, Entry, Store, FAVORITES};
use crate::icons::CustomMeta;

/// O perfil local fica na raiz dos dados do app (onde sempre esteve).
pub fn local_dir(base: &Path) -> PathBuf {
    base.to_path_buf()
}

pub fn account_dir(base: &Path, user_id: &str) -> PathBuf {
    base.join("accounts").join(user_id)
}

pub fn folders_path(dir: &Path) -> PathBuf {
    dir.join("folders.json")
}

pub fn custom_dir(dir: &Path) -> PathBuf {
    dir.join("custom")
}

fn svg_names(custom: &Path) -> Vec<String> {
    std::fs::read_dir(custom)
        .map(|it| {
            it.flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().is_some_and(|x| x == "svg"))
                .filter_map(|p| p.file_stem().and_then(|s| s.to_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct Summary {
    pub folders: usize,
    pub favorites: usize,
    pub icons: usize,
}

impl Summary {
    pub fn is_empty(&self) -> bool {
        self.folders == 0 && self.favorites == 0 && self.icons == 0
    }
}

/// O que existe num perfil (para perguntar se leva para a conta).
pub fn summary(dir: &Path) -> Summary {
    let store = Store::load(folders_path(dir));
    Summary {
        folders: store.visible().filter(|f| f.id != FAVORITES).count(),
        favorites: store.folder(FAVORITES).map(|f| f.items.len()).unwrap_or(0),
        icons: svg_names(&custom_dir(dir)).len(),
    }
}

/// Junta o perfil `src` dentro do perfil aberto (`dst`), sem apagar nada do destino:
/// pastas com o mesmo nome são unidas, ícones importados com nome repetido e
/// conteúdo diferente ganham um nome novo.
pub fn merge(src: &Path, dst_store: &mut Store, dst_custom: &Path) -> Result<Summary, String> {
    std::fs::create_dir_all(dst_custom).map_err(|e| e.to_string())?;
    let mut done = Summary::default();

    // 1. Ícones importados, guardando renomeações para corrigir as pastas.
    let src_custom = custom_dir(src);
    let mut renamed: HashMap<String, String> = HashMap::new();
    let mut meta = CustomMeta::load(dst_custom);
    let now = now_ms();
    for name in svg_names(&src_custom) {
        let svg = std::fs::read_to_string(src_custom.join(format!("{name}.svg"))).map_err(|e| e.to_string())?;
        let mut target = name.clone();
        let mut n = 2;
        loop {
            let path = dst_custom.join(format!("{target}.svg"));
            match std::fs::read_to_string(&path) {
                Ok(existing) if existing == svg => break, // já existe igual
                Ok(_) => {
                    target = format!("{name}-{n}");
                    n += 1;
                }
                Err(_) => {
                    std::fs::write(&path, &svg).map_err(|e| e.to_string())?;
                    meta.mark_updated(&target, now);
                    done.icons += 1;
                    break;
                }
            }
        }
        if target != name {
            renamed.insert(format!("custom:{name}"), format!("custom:{target}"));
        }
    }
    meta.save(dst_custom)?;

    let fix = |e: &Entry| -> Entry {
        let mut e = e.clone();
        if let Some(new) = renamed.get(&e.icon) {
            e.icon = new.clone();
        }
        e
    };

    // 2. Pastas e favoritos.
    let src_store = Store::load(folders_path(src));
    for folder in src_store.visible() {
        let entries: Vec<Entry> = folder.items.iter().map(fix).collect();
        if folder.id == FAVORITES {
            let have: Vec<String> = dst_store.folder(FAVORITES)?.items.iter().map(|e| e.icon.clone()).collect();
            let new: Vec<Entry> = entries.into_iter().filter(|e| !have.contains(&e.icon)).collect();
            done.favorites += new.len();
            if !new.is_empty() {
                dst_store.add_many(FAVORITES, new)?;
            }
            continue;
        }
        let existing = dst_store.visible().find(|f| f.name.eq_ignore_ascii_case(&folder.name)).map(|f| f.id.clone());
        let id = match existing {
            Some(id) => id,
            None => dst_store.create(&folder.name)?,
        };
        if !entries.is_empty() {
            dst_store.add_many(&id, entries)?;
        }
        done.folders += 1;
    }
    Ok(done)
}
