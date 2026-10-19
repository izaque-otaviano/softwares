//! Saving as you work: debounced writes back to the file, atomic replacement, drafts for files
//! never saved, closing and idle checkpoints, and what restoring a version keeps.

use std::path::{Path, PathBuf};

use serde_json::{Value, json};

use crate::filesave::{self, SaveStatus};
use crate::{EngineError, Session};

/// A scratch folder, removed when dropped.
struct Dir(PathBuf);

impl Dir {
    fn new() -> Self {
        static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let d = std::env::temp_dir().join(format!("figcraft-filesave-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        Dir(d)
    }

    fn file(&self, name: &str) -> String {
        self.0.join(name).to_string_lossy().into_owned()
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn session(drafts: Option<&Path>) -> Session {
    let mut s = Session::new();
    s.filesave.enabled = true;
    s.filesave.threaded = false;
    s.filesave.drafts_dir = drafts.map(Path::to_path_buf);
    s
}

fn rect(s: &mut Session, x: f64) {
    s.execute("shape.rectangle", &json!({"x": x, "y": 0, "width": 10, "height": 10})).unwrap();
}

/// How many layers the file at `path` has when opened.
fn layers_in(path: &str) -> usize {
    let mut s = Session::empty();
    s.execute("file.open", &json!({"path": path})).unwrap();
    s.doc().unwrap().nodes().filter(|n| n.name.starts_with("Rectangle")).count()
}

fn versions_in(path: &str) -> Vec<(String, bool)> {
    let bytes = std::fs::read(path).unwrap();
    let loaded = figcraft_format::load_bytes_with_versions(&bytes).unwrap();
    loaded.versions.iter().map(|v| (v.name.clone(), v.auto)).collect()
}

/// How many versions the history has (read without running a command: a command is activity).
fn count(s: &Session) -> usize {
    s.ds().unwrap().versions.len()
}

fn list(s: &mut Session) -> Vec<Value> {
    s.execute("version.list", &json!({})).unwrap().as_array().unwrap().clone()
}

#[test]
fn a_change_is_written_after_a_quiet_moment_and_reopens_the_same() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    assert_eq!(layers_in(&path), 0);
    rect(&mut s, 0.0);
    rect(&mut s, 20.0);
    let uid = s.ds().unwrap().uid;
    // Not yet: the change is waiting for a quiet moment.
    assert!(s.filesave_tick(0.0).is_some());
    assert_eq!(s.save_status(uid), Some(&SaveStatus::Pending));
    s.filesave_tick(1.0);
    assert_eq!(layers_in(&path), 0, "still inside the quiet period");
    assert!(s.ds().unwrap().is_dirty());
    // Quiet for long enough.
    s.filesave_tick(3.0);
    assert_eq!(layers_in(&path), 2);
    assert!(!s.ds().unwrap().is_dirty());
    assert_eq!(s.save_status(uid), None);
    // Nothing changed: nothing is written again.
    let before = std::fs::metadata(&path).unwrap().modified().unwrap();
    s.filesave_tick(50.0);
    assert_eq!(std::fs::metadata(&path).unwrap().modified().unwrap(), before);
}

#[test]
fn a_change_restarts_the_quiet_period_but_continuous_editing_is_still_saved() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    // A change every two seconds never leaves a 2.5 s quiet moment.
    let mut t = 0.0;
    let mut written_at = None;
    while t <= 40.0 {
        rect(&mut s, t);
        s.filesave_tick(t);
        if written_at.is_none() && layers_in(&path) > 0 {
            written_at = Some(t);
        }
        t += 2.0;
    }
    let at = written_at.expect("written during the busy editing");
    assert!((30.0..=32.0).contains(&at), "written at the latest {} s after the first change, was {at}", filesave::MAX_WAIT_SECS);
}

#[test]
fn writes_are_at_least_a_gap_apart() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    assert_eq!(layers_in(&path), 1);
    rect(&mut s, 20.0);
    s.filesave_tick(4.0);
    s.filesave_tick(7.0);
    assert_eq!(layers_in(&path), 1, "{} s have not passed since the last write", filesave::MIN_GAP_SECS);
    s.filesave_tick(11.5);
    assert_eq!(layers_in(&path), 2);
}

#[test]
fn the_first_autosave_keeps_the_file_as_it_was() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    rect(&mut s, 0.0);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    let original = std::fs::read(&path).unwrap();
    rect(&mut s, 20.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    assert_eq!(layers_in(&path), 2);
    let bak = filesave::backup_path(Path::new(&path));
    assert_eq!(std::fs::read(&bak).unwrap(), original, "the .bak is the file before the autosave");
    // Later autosaves leave that backup alone.
    rect(&mut s, 40.0);
    s.filesave_tick(20.0);
    s.filesave_tick(24.0);
    assert_eq!(layers_in(&path), 3);
    assert_eq!(std::fs::read(&bak).unwrap(), original);
}

#[test]
fn an_atomic_write_that_fails_halfway_leaves_the_original_and_no_litter() {
    let dir = Dir::new();
    let path = PathBuf::from(dir.file("a.figcraft"));
    std::fs::write(&path, b"original").unwrap();
    // Dies after the new bytes are on disk, before they replace the file.
    let r = filesave::write_atomic(&path, b"new and longer contents", false, || Err(std::io::Error::other("power cut")));
    assert!(r.is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"original");
    let names: Vec<String> = std::fs::read_dir(&dir.0).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["a.figcraft".to_string()], "the temporary file is removed");
    // A folder that isn't there: an error, nothing created.
    assert!(filesave::write_atomic(&dir.0.join("missing").join("a.figcraft"), b"x", false, || Ok(())).is_err());
    // And the happy path replaces the file whole.
    filesave::write_atomic(&path, b"new and longer contents", true, || Ok(())).unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"new and longer contents");
    assert_eq!(std::fs::read(filesave::backup_path(&path)).unwrap(), b"original");
}

#[test]
fn a_failed_autosave_keeps_the_document_unsaved_says_so_and_tries_again_later() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    // Put a folder where the file is: the replacement fails.
    std::fs::remove_file(&path).unwrap();
    std::fs::create_dir(&path).unwrap();
    let uid = s.ds().unwrap().uid;
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    assert!(matches!(s.save_status(uid), Some(SaveStatus::Failed(_))));
    assert!(s.ds().unwrap().is_dirty());
    assert!(s.message.take().is_some_and(|m| m.contains("Couldn't save")));
    // Not again at once...
    s.filesave_tick(10.0);
    assert!(s.message.is_none());
    // ...but after the retry time, when the problem is gone, it goes through.
    std::fs::remove_dir(&path).unwrap();
    s.filesave_tick(40.0);
    assert_eq!(layers_in(&path), 1);
    assert_eq!(s.save_status(uid), None);
}

#[test]
fn nothing_is_written_when_off_or_not_running() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    s.execute("pref.autosave", &json!({"on": false})).unwrap();
    assert_eq!(s.filesave_tick(0.0), None);
    s.filesave_tick(10.0);
    assert_eq!(layers_in(&path), 0);
    assert_eq!(s.execute("file.autosaveNow", &json!({})).unwrap()["active"], false);
    s.execute("pref.autosave", &json!({"on": true})).unwrap();
    s.filesave.enabled = false;
    s.filesave_tick(20.0);
    assert_eq!(layers_in(&path), 0, "a headless session never writes by itself");
}

#[test]
fn other_formats_and_branch_tabs_and_previews_are_left_alone() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    s.execute("file.saveVersion", &json!({"name": "v"})).unwrap();
    rect(&mut s, 20.0);
    // Shown in place of the document: nothing is written.
    s.execute("version.preview", &json!({"index": 0})).unwrap();
    s.filesave_tick(0.0);
    s.filesave_tick(10.0);
    assert_eq!(layers_in(&path), 0);
    s.execute("version.exitPreview", &json!({})).unwrap();
    // A path that isn't a .figcraft file is never overwritten.
    s.ds_mut().unwrap().path = Some(dir.file("import.json"));
    std::fs::write(dir.file("import.json"), b"{}").unwrap();
    s.filesave_tick(20.0);
    s.filesave_tick(40.0);
    assert_eq!(std::fs::read(dir.file("import.json")).unwrap(), b"{}");
}

#[test]
fn a_file_never_saved_is_kept_as_a_draft_and_reopens() {
    let dir = Dir::new();
    let drafts = dir.0.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = session(Some(&drafts));
    // Nothing done to it: no draft.
    s.filesave_tick(0.0);
    s.filesave_tick(10.0);
    assert!(s.drafts().is_empty());
    s.execute("file.rename", &json!({"name": "Landing page"})).unwrap();
    rect(&mut s, 0.0);
    rect(&mut s, 20.0);
    s.filesave_tick(11.0);
    s.filesave_tick(15.0);
    let found = s.drafts();
    assert_eq!(found.len(), 1);
    let (path, title, _) = &found[0];
    assert_eq!(title, "Landing page");
    assert!(path.starts_with(&drafts));
    let p = path.to_string_lossy().into_owned();
    // The document knows where it is and counts as saved; a second pass reuses the same file.
    assert_eq!(s.ds().unwrap().path.as_deref(), Some(p.as_str()));
    assert!(!s.ds().unwrap().is_dirty());
    rect(&mut s, 40.0);
    s.filesave_tick(30.0);
    s.filesave_tick(34.0);
    assert_eq!(s.drafts().len(), 1);
    assert_eq!(layers_in(&p), 3);
    // After the app is closed and opened again, the draft is there to open.
    let mut again = session(Some(&drafts));
    let list = again.execute("file.drafts", &json!({})).unwrap();
    assert_eq!(list["drafts"][0]["name"], "Landing page");
    assert_eq!(list["drafts"][0]["path"], p.as_str());
    again.execute("file.open", &json!({"path": p})).unwrap();
    assert!(again.prefs.recent_files.is_empty(), "drafts aren't among the recent files");
    assert_eq!(again.doc().unwrap().name, "Landing page");
}

#[test]
fn save_asks_where_a_draft_goes_and_save_as_moves_it() {
    let dir = Dir::new();
    let drafts = dir.0.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = session(Some(&drafts));
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    let draft = s.ds().unwrap().path.clone().unwrap();
    assert!(Path::new(&draft).is_file());
    // Save on a draft is not a silent save into the Drafts folder.
    assert!(matches!(s.execute("file.save", &json!({})), Err(EngineError::Disabled(..))));
    assert!(s.ui_requests.iter().any(|r| r.kind == "dialog.saveAs"));
    // Save as: the file lives where the user chose; the draft is gone.
    let dest = dir.file("Mine.figcraft");
    s.execute("file.saveAs", &json!({"path": dest})).unwrap();
    assert!(!Path::new(&draft).exists());
    assert!(s.drafts().is_empty());
    assert_eq!(s.ds().unwrap().path.as_deref(), Some(dest.as_str()));
    assert_eq!(layers_in(&dest), 1);
    assert_eq!(s.prefs.recent_files, vec![dest]);
    // And from here on Save is a plain save.
    rect(&mut s, 20.0);
    s.execute("file.save", &json!({})).unwrap();
}

#[test]
fn drafts_can_be_listed_and_deleted_but_nothing_else() {
    let dir = Dir::new();
    let drafts = dir.0.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = session(Some(&drafts));
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    let draft = s.ds().unwrap().path.clone().unwrap();
    // Open in a tab: refused.
    assert!(s.execute("file.deleteDraft", &json!({"path": draft})).is_err());
    assert!(Path::new(&draft).exists());
    s.execute("file.close", &json!({})).unwrap();
    assert_eq!(s.execute("file.drafts", &json!({})).unwrap()["drafts"][0]["open"], false);
    // Outside the folder, or a path trick: refused and untouched.
    let outside = dir.file("keep.figcraft");
    std::fs::write(&outside, b"x").unwrap();
    for p in [outside.clone(), format!("{}/../keep.figcraft", drafts.display()), "".into(), "/".into()] {
        assert!(s.execute("file.deleteDraft", &json!({"path": p})).is_err(), "{p}");
    }
    assert!(Path::new(&outside).exists());
    s.execute("file.deleteDraft", &json!({"path": draft})).unwrap();
    assert!(!Path::new(&draft).exists());
    assert!(s.drafts().is_empty());
}

#[test]
fn closing_a_file_takes_a_checkpoint_and_writes_without_asking() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    // A file opened and closed without changes gets no checkpoint.
    s.execute("file.open", &json!({"path": path})).unwrap();
    s.execute("file.close", &json!({})).unwrap();
    assert!(versions_in(&path).is_empty());
    s.execute("file.open", &json!({"path": path})).unwrap_or_default();
    rect(&mut s, 0.0);
    assert!(s.ds().unwrap().is_dirty());
    // Closing: no "unsaved changes" refusal, the file has the work and a checkpoint of it.
    s.execute("file.close", &json!({})).unwrap();
    assert_eq!(layers_in(&path), 1);
    assert_eq!(versions_in(&path), vec![("Autosave".to_string(), true)]);
}

#[test]
fn closing_keeps_asking_when_saving_as_you_work_is_off() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    s.execute("pref.autosave", &json!({"on": false})).unwrap();
    rect(&mut s, 0.0);
    assert!(matches!(s.execute("file.close", &json!({})), Err(EngineError::Disabled(..))));
    assert_eq!(layers_in(&path), 0);
}

#[test]
fn flushing_writes_every_file_with_changes_once() {
    let dir = Dir::new();
    let (a, b) = (dir.file("a.figcraft"), dir.file("b.figcraft"));
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": a})).unwrap();
    s.execute("file.new", &json!({})).unwrap();
    s.execute("file.saveAs", &json!({"path": b})).unwrap();
    rect(&mut s, 0.0);
    s.execute("doc.switch", &json!({"index": 0})).unwrap();
    rect(&mut s, 0.0);
    rect(&mut s, 20.0);
    let r = s.execute("file.autosaveNow", &json!({})).unwrap();
    assert_eq!((r["active"].as_bool(), r["saved"].as_u64(), r["failed"].as_array().map(Vec::len)), (Some(true), Some(2), Some(0)));
    assert_eq!((layers_in(&a), layers_in(&b)), (2, 1));
    assert!(s.docs.iter().all(|d| !d.is_dirty()));
    let r = s.execute("file.autosaveNow", &json!({})).unwrap();
    assert_eq!(r["saved"], 0);
}

#[test]
fn a_quiet_editing_session_gets_a_checkpoint_and_the_caps_hold() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    s.execute("file.saveVersion", &json!({"name": "Milestone"})).unwrap();
    // Edit, go quiet: no checkpoint until a minute of quiet AND five minutes since the last.
    rect(&mut s, 20.0);
    s.filesave_tick(1.0);
    s.filesave_tick(70.0);
    assert_eq!(count(&s), 1, "the last checkpoint is too recent");
    s.filesave_tick(310.0);
    let l = list(&mut s);
    assert_eq!(l.len(), 2);
    assert_eq!((l[1]["name"].as_str(), l[1]["auto"].as_bool()), (Some("Autosave"), Some(true)));
    // The checkpoint was written to the file too.
    assert_eq!(versions_in(&path).len(), 2);
    // No change since: no more.
    s.filesave_tick(1000.0);
    assert_eq!(count(&s), 2);
    // Many sessions of editing: the autosaves stay at 20, the named version stays.
    let mut t = 2000.0;
    for i in 0..40 {
        rect(&mut s, 100.0 + f64::from(i));
        s.filesave_tick(t);
        t += 400.0;
        s.filesave_tick(t);
        t += 400.0;
    }
    let l = list(&mut s);
    assert_eq!(l.iter().filter(|v| v["auto"].as_bool() == Some(true)).count(), crate::cmd::file::MAX_AUTOSAVES);
    assert!(l.iter().any(|v| v["name"] == "Milestone"), "named versions are never dropped");
}

#[test]
fn restoring_a_version_first_keeps_the_present_as_a_version() {
    let mut s = session(None);
    rect(&mut s, 0.0);
    s.execute("file.saveVersion", &json!({"name": "Before"})).unwrap();
    rect(&mut s, 20.0);
    rect(&mut s, 40.0);
    assert_eq!(list(&mut s).len(), 1);
    s.execute("version.restore", &json!({"index": 0})).unwrap();
    let l = list(&mut s);
    assert_eq!(l.len(), 2, "the design as it was is kept");
    assert_eq!(l[1]["auto"], true);
    let layers = |s: &Session| s.doc().unwrap().nodes().filter(|n| n.name.starts_with("Rectangle")).count();
    assert_eq!(layers(&s), 1);
    // Going back to it brings the later work back.
    s.execute("version.restore", &json!({"index": 1})).unwrap();
    assert_eq!(layers(&s), 3);
    // Restoring again straight away adds nothing new.
    let n = list(&mut s).len();
    s.execute("version.restore", &json!({"index": 1})).unwrap();
    assert_eq!(list(&mut s).len(), n);
}

#[test]
fn a_write_on_a_thread_finishes_and_marks_the_file_saved() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.filesave.threaded = true;
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    for _ in 0..200 {
        if !s.ds().unwrap().is_dirty() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
        s.filesave_tick(4.0);
    }
    assert!(!s.ds().unwrap().is_dirty());
    assert_eq!(layers_in(&path), 1);
}

#[test]
fn a_change_while_the_write_is_in_flight_stays_unsaved() {
    let dir = Dir::new();
    let path = dir.file("a.figcraft");
    let mut s = session(None);
    s.execute("file.saveAs", &json!({"path": path})).unwrap();
    rect(&mut s, 0.0);
    // The write is planned from this state...
    s.filesave.threaded = false;
    let doc_then = s.ds().unwrap().doc.clone();
    s.filesave_tick(0.0);
    // ...and the user keeps drawing before its result is taken in.
    rect(&mut s, 20.0);
    s.ds_mut().unwrap().mark_saved_snapshot(doc_then);
    assert!(s.ds().unwrap().is_dirty());
    s.filesave_tick(5.0);
    s.filesave_tick(30.0);
    assert_eq!(layers_in(&path), 2);
    assert!(!s.ds().unwrap().is_dirty());
}

#[test]
fn draft_titles_and_names() {
    assert_eq!(filesave::draft_title(Path::new("/x/Landing page-18f3a.figcraft")), "Landing page");
    assert_eq!(filesave::draft_title(Path::new("/x/Landing-page.figcraft")), "Landing-page");
    assert_eq!(filesave::draft_title(Path::new("/x/-abc.figcraft")), "-abc");
    assert_eq!(filesave::draft_title(Path::new("")), "");
    // Whatever the document is called, its draft is a plain file in the folder.
    let dir = Dir::new();
    let drafts = dir.0.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = session(Some(&drafts));
    s.execute("file.rename", &json!({"name": "../../etc/pass\\wd: *?\"<>|\u{0}\n"})).unwrap();
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    let found = s.drafts();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].0.parent(), Some(drafts.as_path()));
    s.execute("file.rename", &json!({"name": "\u{1F4A5}".repeat(300)})).unwrap();
    let mut s2 = session(Some(&drafts));
    rect(&mut s2, 0.0);
    s2.execute("file.rename", &json!({"name": "\u{1F4A5}".repeat(300)})).unwrap();
    s2.filesave_tick(0.0);
    s2.filesave_tick(3.0);
    assert_eq!(s2.drafts().len(), 2);
}

#[test]
fn a_timer_that_is_not_a_number_does_nothing() {
    let mut s = session(None);
    rect(&mut s, 0.0);
    assert_eq!(s.filesave_tick(f64::NAN), None);
    assert_eq!(s.filesave_tick(f64::INFINITY), None);
}

#[test]
fn opening_hostile_bytes_is_an_error_not_a_panic() {
    use base64::Engine as _;
    let mut s = session(None);
    rect(&mut s, 0.0);
    s.execute("file.saveVersion", &json!({"name": "v"})).unwrap();
    let good = crate::cmd::file::file_bytes(s.ds().unwrap()).unwrap();
    let b64 = |b: &[u8]| base64::engine::general_purpose::STANDARD.encode(b);
    let mut opened = 0;
    // Every cut of the file, and bytes flipped along it: it opens, or says why not.
    for n in (0..good.len()).step_by((good.len() / 60).max(1)) {
        opened += usize::from(s.execute("file.openData", &json!({"data": b64(&good[..n]), "name": "a.figcraft"})).is_ok());
        let mut bad = good.clone();
        if let Some(b) = bad.get_mut(n) {
            *b ^= 0xA5;
        }
        opened += usize::from(s.execute("file.openData", &json!({"data": b64(&bad), "name": "a.figcraft"})).is_ok());
    }
    let r = s.execute("file.openData", &json!({"data": b64(&good), "name": "a.figcraft"})).unwrap();
    assert_eq!(s.ds().unwrap().versions.len(), 1, "the history comes with it: {r}");
    assert!(s.ds().unwrap().path.is_none(), "an opened copy has no path of its own");
    let _ = opened;
    assert!(s.execute("file.openData", &json!({"data": "not base64!!", "name": "a.figcraft"})).is_err());
    assert!(s.execute("file.openData", &json!({"name": "a.figcraft"})).is_err());
}
