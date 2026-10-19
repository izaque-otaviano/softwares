//! The browser's copy of your work.
//!
//! The web version has no files on disk, so every open document is kept in the browser's own
//! storage as it changes, and comes back when the page is loaded again. This module is the logic,
//! apart from any browser: it talks to a [`Storage`] (a key to bytes map; IndexedDB in the page,
//! memory in the tests), and the browser shell in `web.rs` plugs it into the engine as the
//! [`Sink`](figcraft_engine::filesave::Sink) that the engine's save-as-you-work timing calls.
//!
//! Layout of the storage:
//! - `doc:<id>`: one record per document: `FCB1`, the length of the metadata (u32, little endian),
//!   the metadata (JSON: id, name, modified) and the `.figcraft` bytes with the version history.
//!   The metadata is in the record so a listing needs no second index to keep in step.
//! - `session:<instance>`: which documents the page instance (one browser tab, told apart by a
//!   token the tab keeps for its lifetime) has open and which one is shown, to restore after a
//!   reload. A second tab has its own, so two tabs never fight over what is open.
//!
//! Two tabs with the same document open both write its record: the last write wins, and a record is
//! always written whole, so what is read back is one tab's version or the other's, never a mix.
//! Everything read from storage is untrusted: records that don't parse are left out and said so.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, PoisonError};

use figcraft_engine::{DocState, Session};
use serde_json::{Value, json};

/// The most one document may take (bytes of its `.figcraft`).
pub const MAX_RECORD_BYTES: usize = 128 * 1024 * 1024;
/// The most documents kept.
pub const MAX_FILES: usize = 200;
/// Session records older than this (seconds) are forgotten: their tabs are long gone.
pub const SESSION_MAX_AGE: u64 = 30 * 24 * 3600;
const DOC: &str = "doc:";
const SESSION: &str = "session:";
const MAGIC: &[u8; 4] = b"FCB1";
const MAX_META: usize = 64 * 1024;
const MAX_NAME_CHARS: usize = 200;

/// Why the browser wouldn't keep something.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StoreError {
    /// The browser's storage is full (or the site's quota is used up).
    Full,
    /// No storage at all, or it refused (a private window, blocked site data) with this reason.
    Unavailable(String),
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Full => f.write_str("the browser's storage is full: download a copy of your files and delete some from this browser"),
            StoreError::Unavailable(why) if why.is_empty() => {
                f.write_str("the browser won't keep files here (a private window or blocked site data?): download a copy to keep your work")
            }
            StoreError::Unavailable(why) => write!(f, "the browser won't keep files here ({why}): download a copy to keep your work"),
        }
    }
}

/// A key to bytes map that keeps what it is given (or says why it can't).
pub trait Storage {
    fn get(&self, key: &str) -> Option<Vec<u8>>;
    fn put(&mut self, key: &str, bytes: Vec<u8>) -> Result<(), StoreError>;
    fn remove(&mut self, key: &str);
    fn keys(&self) -> Vec<String>;
    /// Look at the bytes of `key` without copying them: false when there is no such key.
    fn peek(&self, key: &str, f: &mut dyn FnMut(&[u8])) -> bool {
        match self.get(key) {
            Some(b) => {
                f(&b);
                true
            }
            None => false,
        }
    }
}

/// Storage in memory, for tests: clones share their contents (two browser tabs on one store), and
/// it can be given a size limit or broken.
#[cfg(test)]
#[derive(Clone, Default)]
pub struct MemoryStorage {
    pub map: Arc<Mutex<BTreeMap<String, Vec<u8>>>>,
    /// The most bytes it takes in all.
    pub quota: Option<usize>,
    /// Refuse everything (a private window).
    pub broken: bool,
}

#[cfg(test)]
impl Storage for MemoryStorage {
    fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.map.lock().unwrap_or_else(PoisonError::into_inner).get(key).cloned()
    }

    fn put(&mut self, key: &str, bytes: Vec<u8>) -> Result<(), StoreError> {
        if self.broken {
            return Err(StoreError::Unavailable("storage is blocked".into()));
        }
        let mut map = self.map.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(quota) = self.quota {
            let others: usize = map.iter().filter(|(k, _)| k.as_str() != key).map(|(_, v)| v.len()).sum();
            if others + bytes.len() > quota {
                return Err(StoreError::Full);
            }
        }
        map.insert(key.to_string(), bytes);
        Ok(())
    }

    fn remove(&mut self, key: &str) {
        self.map.lock().unwrap_or_else(PoisonError::into_inner).remove(key);
    }

    fn keys(&self) -> Vec<String> {
        self.map.lock().unwrap_or_else(PoisonError::into_inner).keys().cloned().collect()
    }

    fn peek(&self, key: &str, f: &mut dyn FnMut(&[u8])) -> bool {
        match self.map.lock().unwrap_or_else(PoisonError::into_inner).get(key) {
            Some(b) => {
                f(b);
                true
            }
            None => false,
        }
    }
}

/// What a record says about its document.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Meta {
    pub id: String,
    pub name: String,
    /// When it was written (Unix seconds).
    pub modified: u64,
}

/// An id is what a record's key is made of: short, letters, digits, `-` and `_`.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// A document's record: `meta` and the file's `bytes`.
pub fn encode_record(meta: &Meta, bytes: &[u8]) -> Vec<u8> {
    let name: String = meta.name.chars().take(MAX_NAME_CHARS).collect();
    let json = json!({"id": meta.id, "name": name, "modified": meta.modified}).to_string();
    let mut out = Vec::with_capacity(8 + json.len() + bytes.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&u32::try_from(json.len()).unwrap_or(0).to_le_bytes());
    out.extend_from_slice(json.as_bytes());
    out.extend_from_slice(bytes);
    out
}

/// The metadata and file bytes of a record, or `None` when it isn't one (cut short, another
/// format, damaged metadata): never a panic, whatever the bytes.
pub fn decode_record(raw: &[u8]) -> Option<(Meta, &[u8])> {
    let rest = raw.strip_prefix(MAGIC.as_slice())?;
    let (len, rest) = rest.split_first_chunk::<4>()?;
    let len = usize::try_from(u32::from_le_bytes(*len)).ok().filter(|l| *l <= MAX_META)?;
    let json = rest.get(..len)?;
    let bytes = rest.get(len..)?;
    let v: Value = serde_json::from_slice(json).ok()?;
    let id = v.get("id")?.as_str().filter(|i| valid_id(i))?.to_string();
    let name = v.get("name")?.as_str()?.chars().filter(|c| !c.is_control()).take(MAX_NAME_CHARS).collect();
    let modified = v.get("modified")?.as_u64()?;
    Some((Meta { id, name, modified }, bytes))
}

/// One file in the listing.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entry {
    pub meta: Meta,
    /// The record's size.
    pub bytes: usize,
}

/// What [`Library::restore`] brought back.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Restored {
    pub opened: usize,
    /// Files in the session that couldn't be read (their names, or ids when the name is lost).
    pub skipped: Vec<String>,
}

/// The documents kept in a browser, for one page instance.
pub struct Library<S> {
    storage: S,
    /// Told this page's tab apart from others (kept by the tab across reloads).
    instance: String,
    /// Open documents and the record each one is kept in.
    bound: BTreeMap<u64, String>,
    counter: u64,
    problem: Option<StoreError>,
    /// The session record last written (tabs and the active one), to write it only when it changes.
    written_session: Option<(Vec<String>, Option<String>)>,
}

impl<S: Storage> Library<S> {
    /// A library over `storage` for the page instance `instance` (letters, digits, `-`, `_`).
    pub fn new(storage: S, instance: &str) -> Self {
        let instance = if valid_id(instance) { instance.to_string() } else { "page".into() };
        Self { storage, instance, bound: BTreeMap::new(), counter: 0, problem: None, written_session: None }
    }

    pub fn storage(&self) -> &S {
        &self.storage
    }

    #[cfg(test)]
    pub fn storage_mut(&mut self) -> &mut S {
        &mut self.storage
    }

    /// What went wrong keeping files last (cleared by the next write that works).
    pub fn problem(&self) -> Option<&StoreError> {
        self.problem.as_ref()
    }

    /// Record a failure the storage reported later than the write (the browser's storage answers
    /// asynchronously), or `None` once a later write went through.
    pub fn set_problem(&mut self, problem: Option<StoreError>) {
        self.problem = problem;
    }

    /// The files kept, newest first. Records that don't read are left out.
    pub fn files(&self) -> Vec<Entry> {
        let mut out: Vec<Entry> = self
            .storage
            .keys()
            .iter()
            .filter(|k| k.starts_with(DOC))
            .filter_map(|k| {
                let mut entry = None;
                self.storage.peek(k, &mut |raw| {
                    if let Some((meta, _)) = decode_record(raw) {
                        // A record under another id's key isn't trusted.
                        entry = (format!("{DOC}{}", meta.id) == *k).then_some(Entry { meta, bytes: raw.len() });
                    }
                });
                entry
            })
            .collect();
        out.sort_by(|a, b| b.meta.modified.cmp(&a.meta.modified).then_with(|| a.meta.id.cmp(&b.meta.id)));
        out
    }

    /// The `.figcraft` bytes of file `id`.
    pub fn read(&self, id: &str) -> Option<Vec<u8>> {
        if !valid_id(id) {
            return None;
        }
        let raw = self.storage.get(&format!("{DOC}{id}"))?;
        decode_record(&raw).filter(|(m, _)| m.id == id).map(|(_, b)| b.to_vec())
    }

    /// Forget file `id` (an open document is kept on and written again at its next change).
    pub fn remove(&mut self, id: &str) {
        if valid_id(id) {
            self.storage.remove(&format!("{DOC}{id}"));
        }
    }

    /// The open document `uid` is the file `id` from now on.
    pub fn adopt(&mut self, id: &str, uid: u64) {
        if valid_id(id) {
            self.bound.insert(uid, id.to_string());
        }
    }

    /// The open document that is file `id`.
    pub fn uid_of(&self, id: &str) -> Option<u64> {
        self.bound.iter().find(|(_, i)| i.as_str() == id).map(|(u, _)| *u)
    }

    /// A record id no file has.
    fn new_id(&mut self, now: u64) -> String {
        loop {
            self.counter += 1;
            let id = format!("{now:x}-{:x}", self.counter);
            if self.storage.get(&format!("{DOC}{id}")).is_none() {
                return id;
            }
        }
    }

    /// Keep `ds` (the engine's save-as-you-work calls this, at the quiet moment and when a file
    /// closes or the page unloads). The file's first write gives it its record; `now` is Unix
    /// seconds.
    pub fn store(&mut self, ds: &DocState, now: u64) -> Result<(), String> {
        let id = match self.bound.get(&ds.uid) {
            Some(id) => id.clone(),
            None => {
                if self.files().len() >= MAX_FILES {
                    return Err(format!("{MAX_FILES} files are kept in this browser already: delete some first"));
                }
                let id = self.new_id(now);
                self.bound.insert(ds.uid, id.clone());
                id
            }
        };
        let mut doc = (*ds.doc).clone();
        doc.current_page = Some(ds.page);
        // (No thumbnail: the list shows names, and encoding runs on the page's only thread.)
        let bytes = figcraft_format::save_bytes_with_history(&doc, None, &ds.versions, &ds.branches).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_RECORD_BYTES {
            return Err("this file is too large to keep in the browser: download a copy".into());
        }
        let record = encode_record(&Meta { id: id.clone(), name: ds.doc.name.clone(), modified: now }, &bytes);
        match self.storage.put(&format!("{DOC}{id}"), record) {
            Ok(()) => {
                self.problem = None;
                Ok(())
            }
            Err(e) => {
                self.problem = Some(e.clone());
                Err(e.to_string())
            }
        }
    }

    /// Write which documents this page has open and which is shown, when that changed. Call it
    /// after the frame's work; it costs a comparison when nothing did.
    pub fn sync_session(&mut self, s: &Session, now: u64) {
        let tabs: Vec<String> = s.docs.iter().filter(|d| d.branch_of.is_none()).filter_map(|d| self.bound.get(&d.uid).cloned()).collect();
        let active = s.ds().ok().and_then(|d| self.bound.get(&d.uid).cloned());
        let state = (tabs, active);
        if self.written_session.as_ref() == Some(&state) {
            return;
        }
        let record = json!({"tabs": state.0, "active": state.1, "modified": now}).to_string().into_bytes();
        match self.storage.put(&format!("{SESSION}{}", self.instance), record) {
            Ok(()) => self.written_session = Some(state),
            // (The files themselves are what matters: a session record that can't be written is
            // retried at the next change.)
            Err(e) => log::warn!("couldn't note the open files in the browser: {e}"),
        }
    }

    /// Open again the documents this page instance had open (after a reload). A new, untouched
    /// document the session started with makes room for them.
    pub fn restore(&mut self, s: &mut Session) -> Restored {
        let mut out = Restored::default();
        let Some(raw) = self.storage.get(&format!("{SESSION}{}", self.instance)) else { return out };
        let Ok(v) = serde_json::from_slice::<Value>(&raw) else { return out };
        let ids: Vec<String> = v
            .get("tabs")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|i| i.as_str().filter(|i| valid_id(i)).map(str::to_string)).take(MAX_FILES).collect())
            .unwrap_or_default();
        let active = v.get("active").and_then(Value::as_str).map(str::to_string);
        let untouched = |d: &DocState| !d.is_dirty() && d.history.undo.is_empty() && d.path.is_none() && d.versions.is_empty();
        let mut opened = Vec::new();
        for id in ids {
            if self.uid_of(&id).is_some() {
                continue;
            }
            let loaded = self.read(&id).and_then(|b| figcraft_format::load_bytes_with_versions(&b).ok());
            let Some(loaded) = loaded else {
                out.skipped.push(self.files().into_iter().find(|e| e.meta.id == id).map_or(id, |e| e.meta.name));
                continue;
            };
            let ds = DocState::new(loaded.doc, None).with_versions(loaded.versions).with_branches(loaded.branches);
            self.bound.insert(ds.uid, id.clone());
            opened.push((id, ds));
        }
        if opened.is_empty() {
            return out;
        }
        if s.docs.len() == 1 && s.docs.first().is_some_and(untouched) {
            s.docs.clear();
        }
        let mut active_at = None;
        for (id, ds) in opened {
            if active.as_deref() == Some(id.as_str()) {
                active_at = Some(s.docs.len());
            }
            s.docs.push(ds);
            out.opened += 1;
        }
        s.active = active_at.unwrap_or(s.docs.len().saturating_sub(1));
        out
    }

    /// Forget sessions of tabs long gone, and records that aren't ours at all. Call it once at
    /// startup.
    pub fn prune(&mut self, now: u64) {
        for key in self.storage.keys() {
            let Some(instance) = key.strip_prefix(SESSION) else { continue };
            if instance == self.instance {
                continue;
            }
            let age = self
                .storage
                .get(&key)
                .and_then(|raw| serde_json::from_slice::<Value>(&raw).ok())
                .and_then(|v| v.get("modified").and_then(Value::as_u64))
                .map(|t| now.saturating_sub(t));
            // Unreadable, or old.
            if age.is_none_or(|a| a > SESSION_MAX_AGE) {
                self.storage.remove(&key);
            }
        }
    }
}

/// A [`Library`] shared by the engine's sink and the shell (the engine's session is `Send`).
pub type Shared<S> = Arc<Mutex<Library<S>>>;

/// Lock a shared library (a panic elsewhere doesn't take the files with it).
pub fn lock<S>(l: &Shared<S>) -> std::sync::MutexGuard<'_, Library<S>> {
    l.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Make `library` the place the session's documents are kept: the engine hands each changed
/// document to it at the quiet moment, and when a file is closed or the page goes away.
pub fn install<S: Storage + Send + 'static>(session: &mut Session, library: &Shared<S>) {
    let library = library.clone();
    session.filesave.enabled = true;
    session.filesave.sink = Some(Box::new(move |ds| lock(&library).store(ds, figcraft_engine::cmd::comment::now_secs())));
}
