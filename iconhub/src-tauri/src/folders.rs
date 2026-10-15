//! Favoritos e pastas por projeto. Cada item guarda o ícone e os ajustes
//! (cor, espessura, tamanho) do momento em que foi salvo.
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::icons::{self, Library, RenderOptions};

pub const FAVORITES: &str = "favoritos";

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub struct Entry {
    pub icon: String,
    pub color: String,
    pub stroke: Option<f32>,
    pub size: u32,
}

impl Entry {
    pub fn opts(&self) -> RenderOptions {
        RenderOptions { color: Some(self.color.clone()), stroke: self.stroke, size: Some(self.size) }
    }
}

/// Ajustes em lote: cada campo ausente fica como está.
#[derive(Deserialize, Default, Debug)]
pub struct EntryChange {
    pub color: Option<String>,
    /// Some(None) = voltar ao traço original.
    #[serde(default, deserialize_with = "some_or_null")]
    pub stroke: Option<Option<f32>>,
    pub size: Option<u32>,
}

fn some_or_null<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<Option<f32>>, D::Error> {
    Ok(Some(Option::deserialize(d)?))
}

impl EntryChange {
    pub fn apply(&self, mut e: Entry) -> Entry {
        if let Some(c) = &self.color {
            e.color = c.clone();
        }
        if let Some(s) = self.stroke {
            e.stroke = s;
        }
        if let Some(size) = self.size {
            e.size = size;
        }
        e
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub items: Vec<Entry>,
    /// Última mudança (ms desde 1970). A sincronização fica com a versão mais nova.
    #[serde(default)]
    pub updated_at: i64,
    /// Pasta apagada: fica guardada como "lápide" para o apagamento chegar aos outros computadores.
    #[serde(default)]
    pub deleted: bool,
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

pub struct Store {
    path: PathBuf,
    /// Inclui pastas apagadas; use `visible()` para o que aparece na tela.
    pub folders: Vec<Folder>,
}

impl Store {
    pub fn load(path: PathBuf) -> Self {
        let mut folders: Vec<Folder> = std::fs::read(&path)
            .ok()
            .and_then(|d| serde_json::from_slice(&d).ok())
            .unwrap_or_default();
        if !folders.iter().any(|f| f.id == FAVORITES) {
            folders.insert(
                0,
                Folder { id: FAVORITES.into(), name: "Favoritos".into(), items: vec![], updated_at: 0, deleted: false },
            );
        }
        Self { path, folders }
    }

    pub fn visible(&self) -> impl Iterator<Item = &Folder> {
        self.folders.iter().filter(|f| !f.deleted)
    }

    fn save(&self) -> Result<(), String> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        // Grava num temporário e renomeia, para não corromper o arquivo se o app fechar no meio.
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&self.folders).unwrap()).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &self.path).map_err(|e| e.to_string())
    }

    /// Pasta visível, já marcada como alterada agora.
    fn touch(&mut self, id: &str) -> Result<&mut Folder, String> {
        let f = self.folders.iter_mut().find(|f| f.id == id && !f.deleted).ok_or("Pasta não encontrada")?;
        f.updated_at = now_ms();
        Ok(f)
    }

    pub fn folder(&self, id: &str) -> Result<&Folder, String> {
        self.visible().find(|f| f.id == id).ok_or_else(|| "Pasta não encontrada".into())
    }

    pub fn create(&mut self, name: &str) -> Result<String, String> {
        let name = clean_name(name)?;
        if self.visible().any(|f| f.name.eq_ignore_ascii_case(&name)) {
            return Err(format!("Já existe uma pasta chamada “{name}”"));
        }
        let base = slug(&name);
        let mut id = base.clone();
        let mut n = 2;
        // Evita também ids de pastas apagadas, para não ressuscitar a lápide.
        while self.folders.iter().any(|f| f.id == id) {
            id = format!("{base}-{n}");
            n += 1;
        }
        self.folders.push(Folder { id: id.clone(), name, items: vec![], updated_at: now_ms(), deleted: false });
        self.save()?;
        Ok(id)
    }

    pub fn rename(&mut self, id: &str, name: &str) -> Result<(), String> {
        if id == FAVORITES {
            return Err("Favoritos não pode ser renomeada".into());
        }
        let name = clean_name(name)?;
        if self.visible().any(|f| f.id != id && f.name.eq_ignore_ascii_case(&name)) {
            return Err(format!("Já existe uma pasta chamada “{name}”"));
        }
        self.touch(id)?.name = name;
        self.save()
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        if id == FAVORITES {
            return Err("Favoritos não pode ser apagada".into());
        }
        let f = self.touch(id)?;
        f.deleted = true;
        f.items.clear();
        self.save()
    }

    /// Adiciona; um item idêntico (mesmo ícone e ajustes) não é duplicado.
    /// Nos favoritos vale um por ícone: favoritar de novo atualiza os ajustes.
    pub fn add(&mut self, id: &str, entry: Entry) -> Result<(), String> {
        let folder = self.touch(id)?;
        if id == FAVORITES {
            folder.items.retain(|e| e.icon != entry.icon);
        } else if folder.items.contains(&entry) {
            return Ok(());
        }
        folder.items.insert(0, entry);
        self.save()
    }

    /// Adiciona vários de uma vez (uma gravação só), mantendo a ordem.
    pub fn add_many(&mut self, id: &str, entries: Vec<Entry>) -> Result<(), String> {
        let folder = self.touch(id)?;
        for entry in entries.into_iter().rev() {
            if !folder.items.contains(&entry) {
                folder.items.insert(0, entry);
            }
        }
        self.save()
    }

    pub fn remove(&mut self, id: &str, entry: &Entry) -> Result<(), String> {
        let folder = self.touch(id)?;
        folder.items.retain(|e| e != entry);
        self.save()
    }

    /// Remove vários itens de uma vez.
    pub fn remove_many(&mut self, id: &str, entries: &[Entry]) -> Result<(), String> {
        let folder = self.touch(id)?;
        folder.items.retain(|e| !entries.contains(e));
        self.save()
    }

    /// Muda cor, espessura e/ou tamanho dos itens escolhidos, mantendo a posição.
    /// Itens que ficarem idênticos a outro já existente são unidos.
    pub fn update_many(&mut self, id: &str, entries: &[Entry], change: &EntryChange) -> Result<(), String> {
        let folder = self.touch(id)?;
        let mut out: Vec<Entry> = Vec::with_capacity(folder.items.len());
        for e in folder.items.drain(..) {
            let e = if entries.contains(&e) { change.apply(e) } else { e };
            if !out.contains(&e) {
                out.push(e);
            }
        }
        folder.items = out;
        self.save()
    }

    /// Copia para outra pasta (e, se `remove`, tira da pasta de origem).
    pub fn transfer(&mut self, from: &str, to: &str, entries: &[Entry], remove: bool) -> Result<(), String> {
        if from == to {
            return Err("Escolha uma pasta diferente.".into());
        }
        self.folder(from)?;
        self.add_many(to, entries.to_vec())?;
        if remove {
            self.remove_many(from, entries)?;
        }
        Ok(())
    }

    /// Estrela: favorita ou desfavorita. Devolve o estado novo.
    pub fn toggle_favorite(&mut self, entry: Entry) -> Result<bool, String> {
        let fav = self.touch(FAVORITES)?;
        if fav.items.iter().any(|e| e.icon == entry.icon) {
            fav.items.retain(|e| e.icon != entry.icon);
            self.save()?;
            Ok(false)
        } else {
            self.add(FAVORITES, entry)?;
            Ok(true)
        }
    }

    /// Remove de todas as pastas um ícone que deixou de existir (ex.: importado apagado).
    pub fn forget_icon(&mut self, icon: &str) -> Result<(), String> {
        let now = now_ms();
        for f in self.folders.iter_mut().filter(|f| !f.deleted) {
            if f.items.iter().any(|e| e.icon == icon) {
                f.items.retain(|e| e.icon != icon);
                f.updated_at = now;
            }
        }
        self.save()
    }

    /// Aplica pastas que vieram da nuvem (já escolhidas como mais novas).
    pub fn apply_remote(&mut self, incoming: Vec<Folder>) -> Result<(), String> {
        if incoming.is_empty() {
            return Ok(());
        }
        for f in incoming {
            match self.folders.iter_mut().find(|l| l.id == f.id) {
                Some(local) => *local = f,
                None => self.folders.push(f),
            }
        }
        self.save()
    }
}

fn clean_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Dê um nome para a pasta".into());
    }
    Ok(name.chars().take(60).collect())
}

pub fn slug(s: &str) -> String {
    let s: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "pasta".into() } else { s }
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Formats {
    Svg,
    Png,
    Both,
}

/// Monta a lista (nome do arquivo, bytes) de uma pasta. Nomes repetidos ganham a cor
/// e, se ainda assim colidirem, um número.
pub fn files(lib: &Library, folder: &Folder, formats: Formats) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut out = Vec::new();
    let mut used = HashSet::new();
    let icon_count = |icon: &str| folder.items.iter().filter(|e| e.icon == icon).count();

    for entry in &folder.items {
        let Some(svg) = lib.svg(&entry.icon, &entry.opts()) else { continue };
        let name = entry.icon.split(':').nth(1).unwrap_or(&entry.icon);
        let mut base = name.to_string();
        if icon_count(&entry.icon) > 1 {
            base = format!("{base}-{}", entry.color.trim_start_matches('#').to_lowercase());
        }
        let mut stem = base.clone();
        let mut n = 2;
        while used.contains(&stem) {
            stem = format!("{base}-{n}");
            n += 1;
        }
        used.insert(stem.clone());

        if formats != Formats::Png {
            let path = if formats == Formats::Both { format!("svg/{stem}.svg") } else { format!("{stem}.svg") };
            out.push((path, svg.clone().into_bytes()));
        }
        if formats != Formats::Svg {
            let png = icons::rasterize(&svg, entry.size)?.encode_png().map_err(|e| e.to_string())?;
            let path = if formats == Formats::Both { format!("png/{stem}.png") } else { format!("{stem}.png") };
            out.push((path, png));
        }
    }
    if out.is_empty() {
        return Err("A pasta está vazia".into());
    }
    Ok(out)
}

pub fn write_zip(path: &Path, files: &[(String, Vec<u8>)]) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, bytes) in files {
        zip.start_file(name.as_str(), options).map_err(|e| e.to_string())?;
        zip.write_all(bytes).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Cria `<destino>/<nome da pasta>/` (sem sobrescrever uma existente) e grava os arquivos.
pub fn write_dir(parent: &Path, name: &str, files: &[(String, Vec<u8>)]) -> Result<PathBuf, String> {
    let base = slug(name);
    let mut dir = parent.join(&base);
    let mut n = 2;
    while dir.exists() {
        dir = parent.join(format!("{base}-{n}"));
        n += 1;
    }
    for (rel, bytes) in files {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}
