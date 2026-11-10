//! Inventário de fontes locais (instaladas no sistema ou pelo usuário), separado do catálogo remoto.
//! Somente leitura: nunca modifica nem remove nada.

use crate::db::Db;
use crate::error::Result;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MAX_PARSE_BYTES: u64 = 96 * 1024 * 1024;

type Row = (String, String, Option<String>, Option<u16>, bool, i64, i64);

fn is_font_ext(p: &Path) -> bool {
    matches!(p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref(), Some("ttf" | "otf" | "ttc" | "otc"))
}

fn faces_of(path: &Path, size: i64, mtime: i64) -> Vec<Row> {
    let Ok(bytes) = std::fs::read(path) else { return vec![] };
    let n = ttf_parser::fonts_in_collection(&bytes).unwrap_or(1).min(64);
    let mut out = Vec::new();
    for i in 0..n {
        let Ok(face) = ttf_parser::Face::parse(&bytes, i) else { continue };
        let name = |ids: &[u16]| face.names().into_iter().filter(|n| ids.contains(&n.name_id) && n.is_unicode()).find_map(|n| n.to_string());
        let Some(family) = name(&[16, 1]) else { continue };
        out.push((path.to_string_lossy().into_owned(), family, name(&[17, 2]), Some(face.weight().to_number()), face.is_italic(), size, mtime));
    }
    out
}

/// Varre `dirs` (exceto `skip`), atualizando o banco de forma incremental (tamanho + mtime).
/// Retorna (arquivos analisados, removidos).
pub fn scan(db: &Db, dirs: &[PathBuf], skip: &[PathBuf]) -> Result<(usize, usize)> {
    let known = db.local_known()?;
    let mut seen = std::collections::HashSet::new();
    let mut upserts: Vec<Row> = Vec::new();
    for dir in dirs.iter().filter(|d| d.is_dir()) {
        for e in WalkDir::new(dir).follow_links(false).into_iter().filter_entry(|e| !skip.iter().any(|s| e.path().starts_with(s)) && e.file_name() != "fontmanager") {
            let Ok(e) = e else { continue };
            if !e.file_type().is_file() || !is_font_ext(e.path()) {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            let size = meta.len() as i64;
            let mtime = meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);
            let p = e.path().to_string_lossy().into_owned();
            seen.insert(p.clone());
            if known.get(&p) == Some(&(size, mtime)) || size as u64 > MAX_PARSE_BYTES {
                continue;
            }
            upserts.extend(faces_of(e.path(), size, mtime));
        }
    }
    let removed: Vec<String> = known.keys().filter(|k| !seen.contains(*k)).cloned().collect();
    db.local_apply(&upserts, &removed)?;
    Ok((upserts.len(), removed.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn varre_incrementalmente_e_ignora_cache() {
        let tmp = tempfile::tempdir().unwrap();
        let fonts = tmp.path().join("fonts");
        let skip = tmp.path().join("cache");
        std::fs::create_dir_all(&fonts).unwrap();
        std::fs::create_dir_all(&skip).unwrap();
        let ttf = include_bytes!("../tests/fixtures/Tiny5-Regular.ttf");
        std::fs::write(fonts.join("a.ttf"), ttf).unwrap();
        std::fs::write(fonts.join("lixo.ttf"), b"nao e fonte").unwrap();
        std::fs::write(fonts.join("nota.txt"), b"x").unwrap();
        std::fs::write(skip.join("b.ttf"), ttf).unwrap();
        let db = Db::open_in_memory().unwrap();
        let (n, _) = scan(&db, &[fonts.clone(), skip.clone()], &[skip.clone()]).unwrap();
        assert_eq!(n, 1);
        assert!(db.is_system_family("tiny5").unwrap());
        // Nova varredura sem mudanças não reanalisa.
        assert_eq!(scan(&db, &[fonts.clone()], &[skip]).unwrap(), (0, 0));
        std::fs::remove_file(fonts.join("a.ttf")).unwrap();
        assert_eq!(scan(&db, &[fonts], &[]).unwrap().1, 1);
        assert!(!db.is_system_family("Tiny5").unwrap());
    }
}
