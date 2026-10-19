//! Saving as you work: a file with a path is written back to itself a few seconds after the last
//! change, and a file that was never saved is kept as a draft in the app's Drafts folder. Closing
//! a file or the app takes a last checkpoint into its version history first, and a long editing
//! session that goes quiet gets one too.
//!
//! The engine does the planning and the writing; the apps only switch it on (`filesave.enabled`,
//! `drafts_dir`) and call [`Session::filesave_tick`] from their frame loop and
//! [`Session::filesave_flush`] when they quit.
//!
//! - **When:** a changed document is written once [`IDLE_SECS`] pass without another change, at
//!   most every [`MIN_GAP_SECS`], and at the latest [`MAX_WAIT_SECS`] after it first changed (so
//!   continuous editing is still saved). A failed write is tried again after [`RETRY_SECS`].
//! - **How:** the document, its versions and branches are cloned (cheap: they share their data),
//!   then encoded and written on a thread of their own, so a frame never waits for the disk. The
//!   bytes go to a temporary file beside the target, which replaces it only when complete: a
//!   failure at any point leaves the file as it was. The first autosave of a file in a run keeps
//!   the file as it was before in `<file>.bak`.
//! - **Which:** `.figcraft` files in place, and documents without a path in
//!   `<drafts_dir>/<name>-<id>.figcraft` (the document then has that path until Save as moves it
//!   elsewhere). Branch tabs (their edits are in the main file), versions shown in place of the
//!   document and other formats (a `.json` import, say) are left alone.
//! - **Versions:** besides the 30-minute checkpoint the app takes, an edited document that has been
//!   quiet for [`CHECKPOINT_IDLE_SECS`] gets one when its last checkpoint is more than
//!   [`CHECKPOINT_GAP_SECS`] old, and closing a file or quitting takes one if it changed since the
//!   last. Checkpoints stay capped at 20 and versions the user named are never dropped
//!   ([`crate::cmd::file::add_version`]).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, atomic::AtomicU64, atomic::Ordering};
use std::time::Duration;

use figcraft_doc::{Document, NodeId};
use figcraft_format::{Branch, Version};

use crate::{DocState, Session};

/// Seconds without a change before the document is written.
pub const IDLE_SECS: f64 = 2.5;
/// The least time between two writes of a document.
pub const MIN_GAP_SECS: f64 = 8.0;
/// The most a changed document waits, however busy the editing.
pub const MAX_WAIT_SECS: f64 = 30.0;
/// How long after a failed write the next try is.
pub const RETRY_SECS: f64 = 30.0;
/// Quiet time after which an edited document gets a checkpoint.
pub const CHECKPOINT_IDLE_SECS: f64 = 60.0;
/// The least time between two of those checkpoints.
pub const CHECKPOINT_GAP_SECS: f64 = 300.0;
/// How long closing the app waits for a write in flight.
const FLUSH_WAIT: Duration = Duration::from_secs(15);
/// Drafts' file extension (the same as any file's).
const EXT: &str = "figcraft";
/// What the temporary file beside a target is called after the target.
const TMP_SUFFIX: &str = "autosave-tmp";

/// Where a document stands, for the interface ("Saving…", "Couldn't save").
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SaveStatus {
    /// Changed and waiting for the quiet moment.
    Pending,
    /// Being written.
    Saving,
    /// The last write failed (the reason); another try follows.
    Failed(String),
}

struct Track {
    seen_revision: u64,
    /// When (the caller's clock) the revision last changed.
    changed_at: f64,
    /// When the document first became unsaved, while it is.
    dirty_since: Option<f64>,
    last_write: f64,
    checkpoint_at: f64,
    retry_at: f64,
    /// The draft file this document has, once it has one.
    draft: Option<PathBuf>,
}

impl Track {
    fn new(revision: u64, now: f64) -> Self {
        Self {
            seen_revision: revision,
            changed_at: now,
            dirty_since: None,
            last_write: f64::NEG_INFINITY,
            checkpoint_at: now,
            retry_at: f64::NEG_INFINITY,
            draft: None,
        }
    }
}

/// A write on its way: everything it needs, owned.
struct Job {
    uid: u64,
    revision: u64,
    path: PathBuf,
    doc: Arc<Document>,
    page: NodeId,
    versions: Vec<Version>,
    branches: Vec<Branch>,
    /// Keep the file as it is in `<file>.bak` first.
    backup: bool,
}

struct Done {
    uid: u64,
    revision: u64,
    doc: Arc<Document>,
    result: Result<(), String>,
}

/// Where a document goes when it isn't a file on this computer: the browser's storage. The web
/// version installs one ([`FileSave::sink`]); it keeps the document (encoded however it likes)
/// and says why it couldn't.
pub type Sink = Box<dyn FnMut(&mut DocState) -> Result<(), String> + Send>;

/// The state of saving as you work (a field of [`Session`]).
pub struct FileSave {
    /// On when an app that wants it says so (headless sessions, the CLI and MCP never write files
    /// they weren't asked to). The `autosave` preference must be on too.
    pub enabled: bool,
    /// Where documents without a path are kept; none: they stay in memory.
    pub drafts_dir: Option<PathBuf>,
    /// Write on a thread of its own (else inside the call: tests, and where there are no threads).
    pub threaded: bool,
    /// Keeps documents somewhere other than a file: with one, nothing is written to a path or to
    /// the drafts folder, and the same timing (quiet moment, closing, quitting) hands each
    /// changed document to it.
    pub sink: Option<Sink>,
    /// How long a document must be quiet before it is written, and the least time between two
    /// writes of it (seconds; [`IDLE_SECS`], [`MIN_GAP_SECS`] unless an app wants it otherwise).
    pub idle_secs: f64,
    pub min_gap_secs: f64,
    /// Failures to tell the user about, taken by the next tick.
    notes: Vec<String>,
    track: HashMap<u64, Track>,
    status: HashMap<u64, SaveStatus>,
    in_flight: HashSet<u64>,
    backed_up: HashSet<PathBuf>,
    tx: Sender<Done>,
    rx: Receiver<Done>,
}

impl Default for FileSave {
    fn default() -> Self {
        let (tx, rx) = channel();
        Self {
            enabled: false,
            drafts_dir: None,
            threaded: cfg!(not(target_arch = "wasm32")),
            sink: None,
            idle_secs: IDLE_SECS,
            min_gap_secs: MIN_GAP_SECS,
            notes: Vec::new(),
            track: HashMap::new(),
            status: HashMap::new(),
            in_flight: HashSet::new(),
            backed_up: HashSet::new(),
            tx,
            rx,
        }
    }
}

/// Counter for temporary file names.
static TMP_N: AtomicU64 = AtomicU64::new(0);

/// Write `bytes` to `path` through a temporary file beside it: the file is replaced only by the
/// complete bytes, and a failure at any step leaves it as it was (and no temporary file behind).
/// `before_rename` runs after the bytes are on disk and before they take the file's place (a hook
/// for tests to fail there).
pub fn write_atomic(path: &Path, bytes: &[u8], backup: bool, before_rename: impl FnOnce() -> std::io::Result<()>) -> std::io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!(".{name}.{}.{TMP_SUFFIX}", TMP_N.fetch_add(1, Ordering::Relaxed)));
    let result = (|| {
        {
            use std::io::Write as _;
            let mut f = std::fs::File::create(&tmp)?;
            f.write_all(bytes)?;
            // On disk before it replaces the file, so a power cut leaves one or the other.
            f.sync_all()?;
        }
        if backup && path.is_file() {
            // (A failure to back up doesn't stop the save: the old file is still replaced whole.)
            let _ = std::fs::copy(path, backup_path(path));
        }
        before_rename()?;
        std::fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

/// `<file>.bak`: the file as it was before the first autosave of a run.
pub fn backup_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_os_string();
    s.push(".bak");
    PathBuf::from(s)
}

/// A file name made from a document's name: letters, digits, spaces, `-` and `_`, at most 40 characters.
fn slug(name: &str) -> String {
    let s: String = name.chars().map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_') { c } else { ' ' }).take(40).collect();
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.is_empty() { "Untitled".into() } else { s }
}

/// The name a draft shows: its file's name without the extension and the id after the last dash.
pub fn draft_title(path: &Path) -> String {
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    match stem.rsplit_once('-') {
        Some((name, id)) if !name.is_empty() && !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit()) => name.to_string(),
        _ => stem,
    }
}

/// Whether the document has something to lose: changed this session (before or after a save).
fn edited(ds: &DocState) -> bool {
    ds.is_dirty() || !ds.history.undo.is_empty()
}

fn is_figcraft(path: &str) -> bool {
    Path::new(path).extension().is_some_and(|e| e.eq_ignore_ascii_case(EXT))
}

/// Encode and write; never panics (a panic becomes the error).
fn run(job: Job) -> Done {
    let Job { uid, revision, path, doc, page, versions, branches, backup } = job;
    let snapshot = doc.clone();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut d = (*doc).clone();
        d.current_page = Some(page);
        let thumb = crate::cmd::file::thumbnail(&d);
        let bytes = figcraft_format::save_bytes_with_history(&d, thumb.as_deref(), &versions, &branches).map_err(|e| e.to_string())?;
        write_atomic(&path, &bytes, backup, || Ok(())).map_err(|e| format!("{}: {e}", path.display()))
    }))
    .unwrap_or_else(|_| Err("saving failed unexpectedly".into()));
    Done { uid, revision, doc: snapshot, result }
}

impl FileSave {
    /// A new draft path for `name` in the drafts folder.
    fn new_draft(&self, name: &str) -> Option<PathBuf> {
        let dir = self.drafts_dir.as_ref()?;
        let slug = slug(name);
        let id = crate::cmd::file::unique_id(|id| dir.join(format!("{slug}-{id}.{EXT}")).exists());
        Some(dir.join(format!("{slug}-{id}.{EXT}")))
    }

    fn set_status(&mut self, uid: u64, status: Option<SaveStatus>) {
        match status {
            Some(s) => {
                self.status.insert(uid, s);
            }
            None => {
                self.status.remove(&uid);
            }
        }
    }

    /// Plan one document: take a checkpoint when it is due, and return the write when it is. `wake`:
    /// seconds until something else is due.
    fn plan(&mut self, ds: &mut DocState, now: f64, prefer_now: bool, wake: &mut Option<f64>) -> Option<Job> {
        let uid = ds.uid;
        let (idle, gap) = (self.idle_secs, self.min_gap_secs);
        if ds.branch_of.is_some() || ds.preview.is_some() || ds.text_preview.is_some() {
            self.set_status(uid, None);
            return None;
        }
        let tr = self.track.entry(uid).or_insert_with(|| Track::new(ds.revision, now));
        if tr.seen_revision != ds.revision {
            tr.seen_revision = ds.revision;
            tr.changed_at = now;
        }
        let mut soon = |secs: f64| *wake = Some(wake.map_or(secs, |w: f64| w.min(secs)));
        // A long editing session gone quiet.
        if edited(ds) && ds.changed_since_checkpoint() {
            let due = (tr.changed_at + CHECKPOINT_IDLE_SECS).max(tr.checkpoint_at + CHECKPOINT_GAP_SECS);
            if now >= due {
                crate::cmd::file::add_version(ds, "Autosave", "", true);
                tr.checkpoint_at = now;
            } else {
                soon(due - now);
            }
        }
        if !ds.is_dirty() {
            tr.dirty_since = None;
            self.set_status(uid, None);
            return None;
        }
        if self.in_flight.contains(&uid) {
            self.set_status(uid, Some(SaveStatus::Saving));
            return None;
        }
        // Kept by the sink (the browser) rather than written to a file.
        if self.sink.is_some() {
            let tr = self.track.entry(uid).or_insert_with(|| Track::new(ds.revision, now));
            let since = *tr.dirty_since.get_or_insert(now);
            let due = ((tr.changed_at + idle).min(since + MAX_WAIT_SECS)).max(tr.last_write + gap).max(tr.retry_at);
            if !prefer_now && now < due {
                if !matches!(self.status.get(&uid), Some(SaveStatus::Failed(_))) {
                    self.status.insert(uid, SaveStatus::Pending);
                }
                *wake = Some(wake.map_or(due - now, |w| w.min(due - now)));
                return None;
            }
            tr.last_write = now;
            let result = match self.sink.as_mut() {
                Some(sink) => sink(ds),
                None => Ok(()),
            };
            match result {
                Ok(()) => {
                    ds.mark_saved();
                    self.set_status(uid, None);
                }
                Err(e) => {
                    if let Some(t) = self.track.get_mut(&uid) {
                        t.retry_at = now + RETRY_SECS;
                    }
                    if !matches!(self.status.get(&uid), Some(SaveStatus::Failed(_))) {
                        self.notes.push(format!("Couldn't keep {}: {e}", ds.doc.name));
                    }
                    self.status.insert(uid, SaveStatus::Failed(e));
                }
            }
            return None;
        }
        // Where it goes.
        let (path, draft) = match ds.path.as_deref() {
            Some(p) if is_figcraft(p) => (PathBuf::from(p), false),
            Some(_) => {
                self.set_status(uid, None);
                return None;
            }
            None => {
                let known = self.track.get(&uid).and_then(|t| t.draft.clone());
                match known.or_else(|| self.new_draft(&ds.doc.name)) {
                    Some(p) => (p, true),
                    None => {
                        self.set_status(uid, None);
                        return None;
                    }
                }
            }
        };
        let tr = self.track.entry(uid).or_insert_with(|| Track::new(ds.revision, now));
        let since = *tr.dirty_since.get_or_insert(now);
        let due = ((tr.changed_at + idle).min(since + MAX_WAIT_SECS)).max(tr.last_write + gap).max(tr.retry_at);
        if !prefer_now && now < due {
            if !matches!(self.status.get(&uid), Some(SaveStatus::Failed(_))) {
                self.status.insert(uid, SaveStatus::Pending);
            }
            *wake = Some(wake.map_or(due - now, |w| w.min(due - now)));
            return None;
        }
        tr.last_write = now;
        if draft {
            tr.draft = Some(path.clone());
            ds.path = Some(path.to_string_lossy().into_owned());
        }
        let backup = !draft && self.backed_up.insert(path.clone());
        self.status.insert(uid, SaveStatus::Saving);
        self.in_flight.insert(uid);
        Some(Job {
            uid,
            revision: ds.revision,
            path,
            doc: ds.doc.clone(),
            page: ds.page,
            versions: ds.versions.clone(),
            branches: ds.branches.clone(),
            backup,
        })
    }

    fn launch(&self, job: Job) {
        if self.threaded {
            let tx = self.tx.clone();
            let slot = Arc::new(std::sync::Mutex::new(Some(job)));
            let moved = slot.clone();
            let spawned = std::thread::Builder::new().name("filesave".into()).spawn(move || {
                let job = moved.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take();
                if let Some(job) = job {
                    let _ = tx.send(run(job));
                }
            });
            if spawned.is_ok() {
                return;
            }
            // No thread to be had: write here.
            let job = slot.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take();
            if let Some(job) = job {
                let _ = self.tx.send(run(job));
            }
        } else {
            let _ = self.tx.send(run(job));
        }
    }
}

impl Session {
    /// Saving as you work is running: an app switched it on and the user hasn't turned it off.
    pub fn filesave_active(&self) -> bool {
        self.filesave.enabled && self.prefs.autosave
    }

    /// `path` is a draft: a file in the drafts folder.
    pub fn is_draft(&self, path: &str) -> bool {
        self.filesave.drafts_dir.as_deref().is_some_and(|d| Path::new(path).parent() == Some(d))
    }

    /// Where the document with `uid` stands while its changes aren't on disk (none: nothing pending).
    pub fn save_status(&self, uid: u64) -> Option<&SaveStatus> {
        self.filesave.status.get(&uid)
    }

    /// Take in the writes that finished: documents written as they were are saved; ones that
    /// changed meanwhile stay unsaved (and are written again).
    fn filesave_apply(&mut self) {
        while let Ok(done) = self.filesave.rx.try_recv() {
            self.filesave.in_flight.remove(&done.uid);
            let Some(i) = self.docs.iter().position(|d| d.uid == done.uid) else {
                self.filesave.set_status(done.uid, None);
                continue;
            };
            match done.result {
                Ok(()) => {
                    let Some(ds) = self.docs.get_mut(i) else { continue };
                    if ds.revision == done.revision {
                        ds.mark_saved();
                    } else {
                        // Changed (or saved by hand) meanwhile: what was written is the older
                        // state, so what is there now still has to go.
                        ds.mark_saved_snapshot(done.doc);
                    }
                    let status = if ds.is_dirty() { Some(SaveStatus::Pending) } else { None };
                    self.filesave.set_status(done.uid, status);
                }
                Err(e) => {
                    let first = !matches!(self.filesave.status.get(&done.uid), Some(SaveStatus::Failed(_)));
                    if let Some(t) = self.filesave.track.get_mut(&done.uid) {
                        t.retry_at = t.last_write + RETRY_SECS;
                    }
                    if first {
                        let name = self.docs.get(i).map(|d| d.doc.name.clone()).unwrap_or_default();
                        self.message = Some(format!("Couldn't save {name}: {e}"));
                    }
                    self.filesave.set_status(done.uid, Some(SaveStatus::Failed(e)));
                }
            }
        }
    }

    /// Save what changed and has been quiet long enough, and take due checkpoints; the apps call
    /// it every frame with their clock (seconds). Returns when to call it again at the latest
    /// (seconds; none: nothing is waiting).
    pub fn filesave_tick(&mut self, now: f64) -> Option<f64> {
        self.filesave_apply();
        if let Some(m) = self.filesave.notes.pop() {
            self.message = Some(m);
        }
        if !self.filesave_active() || !now.is_finite() {
            return None;
        }
        let mut wake = None;
        let mut jobs = Vec::new();
        for i in 0..self.docs.len() {
            let Self { docs, filesave, .. } = self;
            if let Some(ds) = docs.get_mut(i)
                && let Some(job) = filesave.plan(ds, now, false, &mut wake)
            {
                jobs.push(job);
            }
        }
        for job in jobs {
            self.filesave.launch(job);
        }
        self.filesave_apply();
        if let Some(m) = self.filesave.notes.pop() {
            self.message = Some(m);
        }
        if !self.filesave.in_flight.is_empty() {
            // Look again soon for the result.
            wake = Some(wake.map_or(0.2, |w| w.min(0.2)));
        }
        wake.map(|w| w.max(0.05))
    }

    /// Wait for the writes in flight (they are done when this returns, or the wait ran out).
    fn filesave_settle(&mut self) {
        let deadline = web_time::Instant::now() + FLUSH_WAIT;
        while !self.filesave.in_flight.is_empty() && web_time::Instant::now() < deadline {
            if let Ok(done) = self.filesave.rx.recv_timeout(Duration::from_millis(50)) {
                // Put it back for `filesave_apply` (the one place that knows what a result means).
                let _ = self.filesave.tx.send(done);
            }
            self.filesave_apply();
        }
        self.filesave_apply();
    }

    /// Write document `i` now, after a checkpoint of what changed since the last (closing a file,
    /// quitting). Nothing happens when saving as you work is off or the document has no place to
    /// go. `Err`: why it couldn't be written.
    pub(crate) fn filesave_flush_doc(&mut self, i: usize) -> Result<(), String> {
        if !self.filesave_active() {
            return Ok(());
        }
        self.filesave_settle();
        let Self { docs, filesave, .. } = self;
        let Some(ds) = docs.get_mut(i) else { return Ok(()) };
        if ds.branch_of.is_some() || ds.text_preview.is_some() {
            return Ok(());
        }
        ds.end_preview();
        if edited(ds) && ds.changed_since_checkpoint() {
            crate::cmd::file::add_version(ds, "Autosave", "", true);
        }
        let mut wake = None;
        let Some(job) = filesave.plan(ds, f64::MAX / 4.0, true, &mut wake) else { return Ok(()) };
        filesave.launch_inline(job);
        self.filesave_apply();
        match self.docs.get(i).and_then(|d| self.filesave.status.get(&d.uid)) {
            Some(SaveStatus::Failed(e)) => Err(e.clone()),
            _ => Ok(()),
        }
    }

    /// [`Self::filesave_flush_doc`] for every document: the names of those that couldn't be written.
    pub fn filesave_flush(&mut self) -> Vec<String> {
        let mut failed = Vec::new();
        for i in 0..self.docs.len() {
            if self.filesave_flush_doc(i).is_err()
                && let Some(d) = self.docs.get(i)
            {
                failed.push(d.doc.name.clone());
            }
        }
        failed
    }

    /// Forget what saving as you work knows of a closed document.
    pub(crate) fn filesave_forget(&mut self, uid: u64) {
        self.filesave.track.remove(&uid);
        self.filesave.status.remove(&uid);
    }

    /// The drafts, newest first: (path, title, modified in Unix seconds).
    pub fn drafts(&self) -> Vec<(PathBuf, String, u64)> {
        let Some(dir) = self.filesave.drafts_dir.as_deref() else { return Vec::new() };
        let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
        let mut out: Vec<(PathBuf, String, u64)> = entries
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|x| x == EXT) && e.file_type().is_ok_and(|t| t.is_file()))
            .map(|e| {
                let modified = e
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs());
                (e.path(), draft_title(&e.path()), modified)
            })
            .collect();
        out.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.0.cmp(&b.0)));
        out
    }
}

impl FileSave {
    fn launch_inline(&self, job: Job) {
        let _ = self.tx.send(run(job));
    }
}

/// Delete temporary files a crash left in `dir` (a draft or file being written when the app died).
pub fn clean_stale(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.file_name().is_some_and(|n| n.to_string_lossy().ends_with(TMP_SUFFIX)) && p.is_file() {
            let _ = std::fs::remove_file(p);
        }
    }
}
