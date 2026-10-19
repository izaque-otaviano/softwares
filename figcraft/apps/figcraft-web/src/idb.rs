//! The browser's storage behind [`Storage`](crate::store::Storage): IndexedDB, or `localStorage`
//! when IndexedDB isn't there (some private windows, old browsers), or nothing at all.
//!
//! The browser answers storage calls later, but the library wants answers now. So everything
//! stored is also held in memory (loaded once at startup): reads come from there, and writes go to
//! the memory copy at once and to the browser in the background, in batches, by [`WebStorage::pump`]
//! (the shell calls it every frame). A write the browser refuses is kept and tried again after
//! [`RETRY_MS`]; what the browser last said (full, blocked) is in [`WebStorage::state`].

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex, PoisonError};

use base64::Engine as _;
use js_sys::Uint8Array;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::store::{Storage, StoreError};

const DB_NAME: &str = "figcraft";
const OBJECT_STORE: &str = "files";
/// `localStorage` keys start with this.
const LOCAL_PREFIX: &str = "figcraft:";
/// The most the in-memory copy (and so what is kept) may hold.
const MAX_TOTAL: usize = 512 * 1024 * 1024;
/// A refused write is tried again after this long.
const RETRY_MS: f64 = 30_000.0;

enum Backend {
    Idb(web_sys::IdbDatabase),
    Local(web_sys::Storage),
}

thread_local! {
    // (The page has one thread; the handles aren't `Send`, so they live here and not in the
    // storage value the engine's session holds.)
    static BACKEND: RefCell<Option<Backend>> = const { RefCell::new(None) };
}

#[derive(Clone)]
enum Op {
    Put(String, Vec<u8>),
    Remove(String),
}

impl Op {
    fn key(&self) -> &str {
        match self {
            Op::Put(k, _) | Op::Remove(k) => k,
        }
    }
}

#[derive(Default)]
struct Queue {
    /// Waiting to be sent to the browser.
    ops: VecDeque<Op>,
    /// Refused by the browser, with when (`Date.now()`): tried again later.
    refused: Vec<(Op, f64)>,
    busy: bool,
    /// What the browser last answered: `Some` while a write is being refused.
    error: Option<StoreError>,
    /// The browser kept something since `error` was last read.
    recovered: bool,
}

/// What the browser said about the writes lately.
#[derive(Debug, PartialEq, Eq)]
pub enum State {
    Quiet,
    Problem(StoreError),
    Recovered,
}

/// The contents of the browser's storage, held in memory and written through.
pub struct WebStorage {
    cache: HashMap<String, Vec<u8>>,
    queue: Arc<Mutex<Queue>>,
    /// Nothing can be stored (no IndexedDB and no `localStorage`): why.
    unavailable: Option<String>,
}

fn queue(q: &Arc<Mutex<Queue>>) -> std::sync::MutexGuard<'_, Queue> {
    q.lock().unwrap_or_else(PoisonError::into_inner)
}

/// Open the browser's storage and read everything in it. Never fails: with no storage the result
/// refuses every write with the reason.
pub async fn open() -> WebStorage {
    let mut storage = WebStorage { cache: HashMap::new(), queue: Arc::new(Mutex::new(Queue::default())), unavailable: None };
    match open_idb().await {
        Ok(db) => match read_idb(&db).await {
            Ok(all) => {
                storage.cache = all;
                BACKEND.with(|b| *b.borrow_mut() = Some(Backend::Idb(db)));
                return storage;
            }
            Err(e) => log::warn!("IndexedDB couldn't be read: {e}"),
        },
        Err(e) => log::warn!("IndexedDB isn't available: {e}"),
    }
    match local_storage() {
        Some(ls) => {
            storage.cache = read_local(&ls);
            BACKEND.with(|b| *b.borrow_mut() = Some(Backend::Local(ls)));
        }
        None => storage.unavailable = Some("no storage in this browser".into()),
    }
    storage
}

fn local_storage() -> Option<web_sys::Storage> {
    web_sys::window()?.local_storage().ok().flatten()
}

fn describe(e: &JsValue) -> String {
    if let Some(d) = e.dyn_ref::<web_sys::DomException>() {
        let name = d.name();
        let msg = d.message();
        return if msg.is_empty() { name } else { format!("{name}: {msg}") };
    }
    e.as_string().unwrap_or_else(|| "unknown error".into())
}

/// A browser error as a [`StoreError`]: running out of room is told apart.
fn store_error(e: &JsValue) -> StoreError {
    let quota = e.dyn_ref::<web_sys::DomException>().is_some_and(|d| {
        let name = d.name();
        name == "QuotaExceededError" || name == "NS_ERROR_DOM_QUOTA_REACHED" || d.code() == 22
    });
    if quota { StoreError::Full } else { StoreError::Unavailable(describe(e)) }
}

/// A promise settled by an IndexedDB request: its result, or its error.
fn request(req: &web_sys::IdbRequest) -> js_sys::Promise {
    let req = req.clone();
    js_sys::Promise::new(&mut move |resolve, reject| {
        let ok_req = req.clone();
        let on_ok = Closure::once_into_js(move |_: web_sys::Event| {
            let _ = resolve.call1(&JsValue::NULL, &ok_req.result().unwrap_or(JsValue::NULL));
        });
        let err_req = req.clone();
        let on_err = Closure::once_into_js(move |_: web_sys::Event| {
            let why = err_req.error().ok().flatten().map_or(JsValue::from_str("the request failed"), JsValue::from);
            let _ = reject.call1(&JsValue::NULL, &why);
        });
        req.set_onsuccess(Some(on_ok.unchecked_ref()));
        req.set_onerror(Some(on_err.unchecked_ref()));
    })
}

/// A promise settled when a transaction has committed (or failed, or been aborted: out of room
/// aborts the whole transaction).
fn transaction(tx: &web_sys::IdbTransaction) -> js_sys::Promise {
    let tx = tx.clone();
    js_sys::Promise::new(&mut move |resolve, reject| {
        let on_done = Closure::once_into_js(move |_: web_sys::Event| {
            let _ = resolve.call0(&JsValue::NULL);
        });
        let (r1, r2) = (reject.clone(), reject);
        let (tx1, tx2) = (tx.clone(), tx.clone());
        let on_err = Closure::once_into_js(move |_: web_sys::Event| {
            let why = tx1.error().map_or(JsValue::from_str("the write failed"), JsValue::from);
            let _ = r1.call1(&JsValue::NULL, &why);
        });
        let on_abort = Closure::once_into_js(move |_: web_sys::Event| {
            let why = tx2.error().map_or(JsValue::from_str("the write was aborted"), JsValue::from);
            let _ = r2.call1(&JsValue::NULL, &why);
        });
        tx.set_oncomplete(Some(on_done.unchecked_ref()));
        tx.set_onerror(Some(on_err.unchecked_ref()));
        tx.set_onabort(Some(on_abort.unchecked_ref()));
    })
}

async fn open_idb() -> Result<web_sys::IdbDatabase, String> {
    let window = web_sys::window().ok_or("no window")?;
    let factory = window.indexed_db().map_err(|e| describe(&e))?.ok_or("no IndexedDB")?;
    let req = factory.open_with_u32(DB_NAME, 1).map_err(|e| describe(&e))?;
    let upgrade = Closure::once_into_js(move |e: web_sys::Event| {
        let db = e
            .target()
            .and_then(|t| t.dyn_into::<web_sys::IdbOpenDbRequest>().ok())
            .and_then(|r| r.result().ok())
            .and_then(|r| r.dyn_into::<web_sys::IdbDatabase>().ok());
        if let Some(db) = db {
            let _ = db.create_object_store(OBJECT_STORE);
        }
    });
    req.set_onupgradeneeded(Some(upgrade.unchecked_ref()));
    let db = JsFuture::from(request(&req)).await.map_err(|e| describe(&e))?;
    db.dyn_into::<web_sys::IdbDatabase>().map_err(|_| "not a database".to_string())
}

async fn read_idb(db: &web_sys::IdbDatabase) -> Result<HashMap<String, Vec<u8>>, String> {
    let tx = db.transaction_with_str(OBJECT_STORE).map_err(|e| describe(&e))?;
    let store = tx.object_store(OBJECT_STORE).map_err(|e| describe(&e))?;
    let keys = JsFuture::from(request(&store.get_all_keys().map_err(|e| describe(&e))?)).await.map_err(|e| describe(&e))?;
    let values = JsFuture::from(request(&store.get_all().map_err(|e| describe(&e))?)).await.map_err(|e| describe(&e))?;
    let (keys, values) = (js_sys::Array::from(&keys), js_sys::Array::from(&values));
    let mut out = HashMap::new();
    let mut total = 0usize;
    for i in 0..keys.length().min(values.length()) {
        let (Some(key), Ok(bytes)) = (keys.get(i).as_string(), values.get(i).dyn_into::<Uint8Array>()) else { continue };
        total = total.saturating_add(bytes.length() as usize);
        if total > MAX_TOTAL {
            return Err("more is stored than this page can hold".into());
        }
        out.insert(key, bytes.to_vec());
    }
    Ok(out)
}

fn read_local(ls: &web_sys::Storage) -> HashMap<String, Vec<u8>> {
    let mut out = HashMap::new();
    let mut total = 0usize;
    for i in 0..ls.length().unwrap_or(0) {
        let Some(key) = ls.key(i).ok().flatten().and_then(|k| k.strip_prefix(LOCAL_PREFIX).map(str::to_string)) else { continue };
        let Some(bytes) =
            ls.get_item(&format!("{LOCAL_PREFIX}{key}")).ok().flatten().and_then(|v| base64::engine::general_purpose::STANDARD.decode(v).ok())
        else {
            continue;
        };
        total = total.saturating_add(bytes.len());
        if total > MAX_TOTAL {
            break;
        }
        out.insert(key, bytes);
    }
    out
}

/// Send `ops` to the browser; the first failure stops the batch.
async fn write(ops: &[Op]) -> Result<(), StoreError> {
    enum Target {
        Idb(web_sys::IdbDatabase),
        Local(web_sys::Storage),
    }
    let target = BACKEND.with(|b| {
        b.borrow().as_ref().map(|b| match b {
            Backend::Idb(db) => Target::Idb(db.clone()),
            Backend::Local(ls) => Target::Local(ls.clone()),
        })
    });
    match target {
        None => Err(StoreError::Unavailable("no storage in this browser".into())),
        Some(Target::Local(ls)) => {
            for op in ops {
                let r = match op {
                    Op::Put(k, v) => ls.set_item(&format!("{LOCAL_PREFIX}{k}"), &base64::engine::general_purpose::STANDARD.encode(v)),
                    Op::Remove(k) => ls.remove_item(&format!("{LOCAL_PREFIX}{k}")),
                };
                r.map_err(|e| store_error(&e))?;
            }
            Ok(())
        }
        Some(Target::Idb(db)) => {
            // One transaction for the batch: all of it or none.
            let fail = |e: JsValue| store_error(&e);
            let tx = db.transaction_with_str_and_mode(OBJECT_STORE, web_sys::IdbTransactionMode::Readwrite).map_err(fail)?;
            let store = tx.object_store(OBJECT_STORE).map_err(fail)?;
            for op in ops {
                match op {
                    Op::Put(k, v) => {
                        store.put_with_key(&Uint8Array::from(v.as_slice()), &JsValue::from_str(k)).map_err(fail)?;
                    }
                    Op::Remove(k) => {
                        store.delete(&JsValue::from_str(k)).map_err(fail)?;
                    }
                }
            }
            JsFuture::from(transaction(&tx)).await.map(|_| ()).map_err(fail)
        }
    }
}

impl WebStorage {
    /// Send what is waiting to the browser, and what it refused earlier when it is time to try
    /// again. Call it every frame: it does nothing while a batch is out or nothing is waiting.
    pub fn pump(&self) {
        let now = js_sys::Date::now();
        let batch: Vec<Op> = {
            let mut q = queue(&self.queue);
            if q.busy {
                return;
            }
            // Refused writes whose time has come go to the back of the line.
            let (due, wait): (Vec<_>, Vec<_>) = std::mem::take(&mut q.refused).into_iter().partition(|(_, at)| now - at >= RETRY_MS);
            q.refused = wait;
            q.ops.extend(due.into_iter().map(|(op, _)| op));
            if q.ops.is_empty() {
                return;
            }
            q.busy = true;
            // Only the newest write of a key matters.
            let mut latest: HashMap<String, Op> = HashMap::new();
            let mut order = Vec::new();
            for op in q.ops.drain(..) {
                if latest.insert(op.key().to_string(), op.clone()).is_none() {
                    order.push(op.key().to_string());
                }
            }
            order.into_iter().filter_map(|k| latest.remove(&k)).collect()
        };
        let queue = self.queue.clone();
        wasm_bindgen_futures::spawn_local(async move {
            let result = write(&batch).await;
            let mut q = self::queue(&queue);
            q.busy = false;
            match result {
                Ok(()) => {
                    q.recovered = q.error.take().is_some() || q.recovered;
                }
                Err(e) => {
                    let at = js_sys::Date::now();
                    // (A batch is all or nothing as far as we can tell: all of it is tried again.)
                    q.refused.extend(batch.into_iter().map(|op| (op, at)));
                    q.error = Some(e);
                }
            }
        });
    }

    /// Writes are waiting for the browser (or were refused and will be tried again).
    pub fn pending(&self) -> bool {
        let q = queue(&self.queue);
        q.busy || !q.ops.is_empty() || !q.refused.is_empty()
    }

    /// What the browser said lately, once each (a problem is reported again only after a write
    /// went through in between).
    pub fn state(&self) -> State {
        let mut q = queue(&self.queue);
        if q.recovered {
            q.recovered = false;
            return State::Recovered;
        }
        match &q.error {
            Some(e) => State::Problem(e.clone()),
            None => State::Quiet,
        }
    }
}

impl Storage for WebStorage {
    fn get(&self, key: &str) -> Option<Vec<u8>> {
        self.cache.get(key).cloned()
    }

    fn put(&mut self, key: &str, bytes: Vec<u8>) -> Result<(), StoreError> {
        if let Some(why) = &self.unavailable {
            return Err(StoreError::Unavailable(why.clone()));
        }
        let others: usize = self.cache.iter().filter(|(k, _)| k.as_str() != key).map(|(_, v)| v.len()).sum();
        if others.saturating_add(bytes.len()) > MAX_TOTAL {
            return Err(StoreError::Full);
        }
        self.cache.insert(key.to_string(), bytes.clone());
        queue(&self.queue).ops.push_back(Op::Put(key.to_string(), bytes));
        Ok(())
    }

    fn remove(&mut self, key: &str) {
        if self.cache.remove(key).is_some() {
            queue(&self.queue).ops.push_back(Op::Remove(key.to_string()));
        }
    }

    fn keys(&self) -> Vec<String> {
        self.cache.keys().cloned().collect()
    }

    fn peek(&self, key: &str, f: &mut dyn FnMut(&[u8])) -> bool {
        match self.cache.get(key) {
            Some(b) => {
                f(b);
                true
            }
            None => false,
        }
    }
}
