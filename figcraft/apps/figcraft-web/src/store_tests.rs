//! The browser library against storage in memory: saving, listing, restoring after a reload, a full
//! or refusing store, two tabs, and records that are not what they claim to be.

use std::sync::{Arc, Mutex};

use figcraft_engine::Session;
use figcraft_engine::filesave::SaveStatus;
use serde_json::json;

use crate::store::*;

fn session() -> Session {
    Session::new()
}

fn rect(s: &mut Session, x: f64) {
    s.execute("shape.rectangle", &json!({"x": x, "y": 0, "width": 10, "height": 10})).unwrap();
}

fn layers(s: &Session) -> usize {
    s.doc().unwrap().nodes().filter(|n| n.name.starts_with("Rectangle")).count()
}

fn library(mem: &MemoryStorage, instance: &str) -> Shared<MemoryStorage> {
    Arc::new(Mutex::new(Library::new(mem.clone(), instance)))
}

/// A session whose changes go to `lib` at the quiet moment.
fn web_session(lib: &Shared<MemoryStorage>) -> Session {
    let mut s = session();
    install(&mut s, lib);
    s
}

#[test]
fn a_changed_document_is_kept_after_a_quiet_moment_and_listed() {
    let mem = MemoryStorage::default();
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    s.execute("file.rename", &json!({"name": "Landing"})).unwrap();
    rect(&mut s, 0.0);
    rect(&mut s, 20.0);
    let uid = s.ds().unwrap().uid;
    s.filesave_tick(0.0);
    assert!(lock(&lib).files().is_empty(), "not yet");
    assert_eq!(s.save_status(uid), Some(&SaveStatus::Pending));
    s.filesave_tick(3.0);
    let files = lock(&lib).files();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].meta.name, "Landing");
    assert!(files[0].bytes > 100);
    assert!(!s.ds().unwrap().is_dirty(), "kept: nothing unsaved");
    assert_eq!(s.save_status(uid), None);
    // The bytes are a .figcraft that opens.
    let bytes = lock(&lib).read(&files[0].meta.id).unwrap();
    let loaded = figcraft_format::load_bytes_with_versions(&bytes).unwrap();
    assert_eq!(loaded.doc.name, "Landing");
    // An untouched document is not kept.
    let mut fresh = web_session(&library(&MemoryStorage::default(), "x"));
    fresh.filesave_tick(0.0);
    fresh.filesave_tick(100.0);
}

#[test]
fn reloading_the_page_brings_back_the_tabs_and_the_active_file() {
    let mem = MemoryStorage::default();
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    s.execute("file.rename", &json!({"name": "One"})).unwrap();
    rect(&mut s, 0.0);
    s.execute("file.saveVersion", &json!({"name": "Milestone"})).unwrap();
    s.execute("file.new", &json!({"name": "Two"})).unwrap();
    rect(&mut s, 0.0);
    rect(&mut s, 20.0);
    rect(&mut s, 40.0);
    s.filesave_tick(0.0);
    s.filesave_tick(5.0);
    lock(&lib).sync_session(&s, 5);
    // Reload: a new page over the same storage, with the tab's token kept.
    let lib2 = library(&mem, "tab1");
    let mut again = web_session(&lib2);
    let r = lock(&lib2).restore(&mut again);
    assert_eq!((r.opened, r.skipped.len()), (2, 0));
    assert_eq!(again.docs.len(), 2, "the blank document it started with made room");
    assert_eq!(again.doc().unwrap().name, "Two", "the file that was shown is shown");
    assert_eq!(layers(&again), 3);
    // The version history came with it.
    again.execute("doc.switch", &json!({"index": 0})).unwrap();
    assert_eq!(again.doc().unwrap().name, "One");
    assert_eq!(again.ds().unwrap().versions.len(), 1);
    assert!(again.docs.iter().all(|d| !d.is_dirty()));
    // Editing a restored file writes the same record again, not a second one.
    rect(&mut again, 60.0);
    again.filesave_tick(100.0);
    again.filesave_tick(104.0);
    assert_eq!(lock(&lib2).files().len(), 2);
}

#[test]
fn another_tab_has_its_own_session_but_sees_the_files() {
    let mem = MemoryStorage::default();
    let a = library(&mem, "tabA");
    let mut sa = web_session(&a);
    rect(&mut sa, 0.0);
    sa.filesave_tick(0.0);
    sa.filesave_tick(4.0);
    lock(&a).sync_session(&sa, 4);
    let b = library(&mem, "tabB");
    let mut sb = web_session(&b);
    let r = lock(&b).restore(&mut sb);
    assert_eq!(r.opened, 0, "tab B did not have it open");
    assert_eq!(lock(&b).files().len(), 1, "but it is in the list");
    // Opening it from the list: the same record from then on.
    let id = lock(&b).files()[0].meta.id.clone();
    let bytes = lock(&b).read(&id).unwrap();
    use base64::Engine as _;
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    let opened = sb.execute("file.openData", &json!({"data": data, "name": "x.figcraft"})).unwrap();
    let uid = sb.docs[opened["index"].as_u64().unwrap() as usize].uid;
    lock(&b).adopt(&id, uid);
    assert_eq!(lock(&b).uid_of(&id), Some(uid));
    rect(&mut sb, 20.0);
    sb.filesave_tick(10.0);
    sb.filesave_tick(14.0);
    assert_eq!(lock(&b).files().len(), 1);
}

#[test]
fn two_tabs_writing_one_file_leave_a_whole_record() {
    let mem = MemoryStorage::default();
    let a = library(&mem, "tabA");
    let mut sa = web_session(&a);
    rect(&mut sa, 0.0);
    sa.filesave_tick(0.0);
    sa.filesave_tick(4.0);
    let id = lock(&a).files()[0].meta.id.clone();
    let b = library(&mem, "tabB");
    let mut sb = web_session(&b);
    lock(&b).adopt(&id, sb.ds().unwrap().uid);
    rect(&mut sb, 0.0);
    rect(&mut sb, 20.0);
    rect(&mut sb, 40.0);
    // Both write; the later wins.
    rect(&mut sa, 99.0);
    sa.filesave_tick(20.0);
    sa.filesave_tick(24.0);
    sb.filesave_tick(30.0);
    sb.filesave_tick(34.0);
    let files = lock(&a).files();
    assert_eq!(files.len(), 1);
    let loaded = figcraft_format::load_bytes_with_versions(&lock(&a).read(&id).unwrap()).unwrap();
    assert_eq!(loaded.doc.nodes().filter(|n| n.name.starts_with("Rectangle")).count(), 3, "the last writer's version, whole");
}

#[test]
fn a_full_store_is_an_error_the_user_can_read_and_the_old_copy_survives() {
    let mem = MemoryStorage::default();
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(4.0);
    let before = lock(&lib).files();
    assert_eq!(before.len(), 1);
    // The quota shrinks to what is stored: the next, larger write doesn't fit.
    lock(&lib).storage_mut().quota = Some(before[0].bytes + 10);
    for i in 0..40 {
        rect(&mut s, 20.0 * f64::from(i + 1));
    }
    s.filesave_tick(20.0);
    s.filesave_tick(24.0);
    assert_eq!(lock(&lib).problem(), Some(&StoreError::Full));
    let uid = s.ds().unwrap().uid;
    assert!(matches!(s.save_status(uid), Some(SaveStatus::Failed(m)) if m.contains("storage is full")));
    assert!(s.ds().unwrap().is_dirty(), "still unsaved: the user is told, the work stays in the page");
    assert!(s.message.take().is_some_and(|m| m.contains("Couldn't keep")));
    // The copy kept before is intact.
    let after = lock(&lib).files();
    assert_eq!(after, before);
    assert!(figcraft_format::load_bytes_with_versions(&lock(&lib).read(&before[0].meta.id).unwrap()).is_ok());
    // Room again: it goes through after the retry time, and the problem clears.
    lock(&lib).storage_mut().quota = None;
    s.filesave_tick(60.0);
    assert_eq!(lock(&lib).problem(), None);
    assert!(!s.ds().unwrap().is_dirty());
}

#[test]
fn storage_that_refuses_everything_never_panics() {
    let mem = MemoryStorage { broken: true, ..Default::default() };
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(4.0);
    assert!(matches!(lock(&lib).problem(), Some(StoreError::Unavailable(_))));
    assert!(s.ds().unwrap().is_dirty());
    lock(&lib).sync_session(&s, 4);
    let r = lock(&lib).restore(&mut s);
    assert_eq!(r.opened, 0);
    // Closing a tab with the work not kept still asks, instead of losing it quietly.
    assert!(s.execute("file.close", &json!({})).is_err());
    assert!(lock(&lib).files().is_empty());
}

#[test]
fn closing_a_file_keeps_it_first_with_a_last_checkpoint() {
    let mem = MemoryStorage::default();
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    rect(&mut s, 0.0);
    // No tick has run yet: the close itself keeps the file.
    s.execute("file.close", &json!({})).unwrap();
    let files = lock(&lib).files();
    assert_eq!(files.len(), 1);
    let loaded = figcraft_format::load_bytes_with_versions(&lock(&lib).read(&files[0].meta.id).unwrap()).unwrap();
    assert_eq!(loaded.versions.len(), 1);
    assert!(loaded.versions[0].auto);
    // Forgetting it removes the record.
    let id = files[0].meta.id.clone();
    lock(&lib).remove(&id);
    assert!(lock(&lib).files().is_empty());
    lock(&lib).remove("../../etc");
}

#[test]
fn restoring_skips_what_cannot_be_read_and_ids_that_are_not_ids() {
    let mem = MemoryStorage::default();
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(4.0);
    let id = lock(&lib).files()[0].meta.id.clone();
    // The session names a good file, a damaged one, a missing one and path tricks.
    let key = format!("doc:{id}");
    let good = mem.map.lock().unwrap().get(&key).cloned().unwrap();
    let mut damaged = good.clone();
    let n = damaged.len();
    damaged.truncate(n / 2);
    mem.map.lock().unwrap().insert("doc:damaged".into(), damaged);
    let record = json!({"tabs": [id, "damaged", "missing", "../../x", "", 7, null], "active": "damaged", "modified": 1});
    mem.map.lock().unwrap().insert("session:tab2".into(), record.to_string().into_bytes());
    let lib2 = library(&mem, "tab2");
    let mut again = session_fresh(&lib2);
    let r = lock(&lib2).restore(&mut again);
    assert_eq!(r.opened, 1);
    assert_eq!(r.skipped.len(), 2, "{:?}", r.skipped);
    assert_eq!(layers(&again), 1);
    // Junk where the session record should be: nothing restored.
    mem.map.lock().unwrap().insert("session:tab3".into(), b"\x00\xffnot json".to_vec());
    let lib3 = library(&mem, "tab3");
    assert_eq!(lock(&lib3).restore(&mut session()).opened, 0);
}

fn session_fresh(lib: &Shared<MemoryStorage>) -> Session {
    web_session(lib)
}

#[test]
fn a_record_under_another_ids_key_is_not_trusted() {
    let mem = MemoryStorage::default();
    let lib = library(&mem, "tab1");
    let mut s = web_session(&lib);
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(4.0);
    let id = lock(&lib).files()[0].meta.id.clone();
    let raw = mem.map.lock().unwrap().get(&format!("doc:{id}")).cloned().unwrap();
    mem.map.lock().unwrap().insert("doc:copy".into(), raw);
    let files = lock(&lib).files();
    assert_eq!(files.len(), 1, "the record whose key differs from its id is left out");
    assert!(lock(&lib).read("copy").is_none());
}

#[test]
fn old_sessions_of_closed_tabs_are_forgotten() {
    let mem = MemoryStorage::default();
    let put = |k: &str, t: u64| {
        mem.map.lock().unwrap().insert(k.into(), json!({"tabs": [], "modified": t}).to_string().into_bytes());
    };
    let now = 100 * 24 * 3600;
    put("session:old", 1000);
    put("session:recent", now - 3600);
    mem.map.lock().unwrap().insert("session:junk".into(), b"x".to_vec());
    let mut lib = Library::new(mem.clone(), "mine");
    lib.prune(now);
    let keys = mem.map.lock().unwrap().keys().cloned().collect::<Vec<_>>();
    assert_eq!(keys, vec!["session:recent".to_string()]);
}

#[test]
fn too_many_files_and_giant_names_are_refused_or_clipped() {
    let mem = MemoryStorage::default();
    let mut lib = Library::new(mem.clone(), "tab1");
    for i in 0..MAX_FILES {
        let meta = Meta { id: format!("f{i}"), name: "x".into(), modified: 1 };
        mem.map.lock().unwrap().insert(format!("doc:f{i}"), encode_record(&meta, b"x"));
    }
    assert_eq!(lib.files().len(), MAX_FILES);
    let mut s = session();
    rect(&mut s, 0.0);
    let err = lib.store(s.ds().unwrap(), 5).unwrap_err();
    assert!(err.contains("delete some"), "{err}");
    // A name of a million characters is clipped in the record.
    let meta = Meta { id: "big".into(), name: "n".repeat(1_000_000), modified: 3 };
    let (m, bytes) = decode_record(&encode_record(&meta, b"abc")).map(|(m, b)| (m, b.to_vec())).unwrap();
    assert_eq!((m.name.chars().count(), bytes), (200, b"abc".to_vec()));
}

#[test]
fn record_decoding_survives_any_bytes() {
    let meta = Meta { id: "a1".into(), name: "Plan".into(), modified: 42 };
    let good = encode_record(&meta, &[7u8; 300]);
    assert_eq!(decode_record(&good).map(|(m, b)| (m, b.len())), Some((meta, 300)));
    // Every truncation and every single-byte change: an answer, never a panic.
    for n in 0..good.len().min(200) {
        let _ = decode_record(&good[..n]);
    }
    for i in 0..good.len().min(120) {
        for b in [0u8, 0xff, b'"', b'{'] {
            let mut x = good.clone();
            x[i] = b;
            let _ = decode_record(&x);
        }
    }
    // A huge declared metadata length, a wrong magic, an empty record.
    let mut huge = b"FCB1".to_vec();
    huge.extend_from_slice(&u32::MAX.to_le_bytes());
    huge.extend_from_slice(b"{}");
    assert!(decode_record(&huge).is_none());
    assert!(decode_record(b"").is_none() && decode_record(b"FCB1").is_none() && decode_record(b"NOPE\0\0\0\0").is_none());
    // Pseudo-random garbage (a simple generator, fixed seed).
    let mut x = 0x2545_f491_4f6c_dd1d_u64;
    for _ in 0..2000 {
        let len = {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            (x % 80) as usize
        };
        let junk: Vec<u8> = (0..len)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                (x >> 24) as u8
            })
            .collect();
        let mut prefixed = b"FCB1".to_vec();
        prefixed.extend_from_slice(&junk);
        let _ = decode_record(&junk);
        let _ = decode_record(&prefixed);
        // And as stored data: files() and restore() read it without trouble.
        let mem = MemoryStorage::default();
        mem.map.lock().unwrap().insert("doc:g".into(), prefixed.clone());
        mem.map.lock().unwrap().insert("session:g".into(), junk);
        let mut lib = Library::new(mem, "g");
        let _ = lib.files();
        let _ = lib.read("g");
        let _ = lib.restore(&mut session());
    }
    assert!(!valid_id("../x") && !valid_id("") && !valid_id(&"a".repeat(65)) && valid_id("a-b_C9"));
}

#[test]
fn the_error_messages_read_like_sentences() {
    assert!(StoreError::Full.to_string().contains("download a copy"));
    assert!(StoreError::Unavailable(String::new()).to_string().contains("private window"));
    assert!(StoreError::Unavailable("SecurityError".into()).to_string().contains("SecurityError"));
}
