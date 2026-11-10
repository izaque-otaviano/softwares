//! Persistência SQLite: catálogo remoto, cache, ativações, favoritos, coleções e configurações.

use crate::dedup::{licenses_compatible, normalize_key};
use crate::error::{Error, Result};
use crate::model::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

mod local;
mod user;
pub use local::{ActivationRow, CacheFile, LocalFamily};
pub use user::{Collection, LogEntry};

const MIGRATIONS: &[(&str, &str)] = &[("001_init", include_str!("../../migrations/001_init.sql"))];

#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(p) = path.parent() {
            std::fs::create_dir_all(p)?;
        }
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;")?;
        let db = Db { conn: Arc::new(Mutex::new(conn)) };
        db.migrate()?;
        Ok(db)
    }

    #[doc(hidden)]
    pub fn lock(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|p| p.into_inner())
    }

    fn migrate(&self) -> Result<()> {
        let mut c = self.lock();
        let current: usize = c.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        for (i, (_name, sql)) in MIGRATIONS.iter().enumerate().skip(current) {
            let tx = c.transaction()?;
            tx.execute_batch(sql)?;
            tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))?;
            tx.commit()?;
        }
        Ok(())
    }

    pub fn schema_version(&self) -> Result<usize> {
        Ok(self.lock().query_row("PRAGMA user_version", [], |r| r.get(0))?)
    }

    // ---- provedores ---------------------------------------------------------------------------

    pub fn upsert_provider(&self, id: &str, name: &str, status: ProviderStatus, note: Option<&str>) -> Result<()> {
        let st = serde_json::to_value(status)?.as_str().unwrap_or("ok").to_string();
        self.lock().execute(
            "INSERT INTO providers(id,name,status,status_note) VALUES(?1,?2,?3,?4)
             ON CONFLICT(id) DO UPDATE SET name=?2,status=?3,status_note=?4",
            params![id, name, st, note],
        )?;
        Ok(())
    }

    pub fn provider_last_sync(&self, id: &str) -> Result<Option<String>> {
        Ok(self
            .lock()
            .query_row("SELECT last_sync FROM providers WHERE id=?1", [id], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten())
    }

    pub fn set_provider_enabled(&self, id: &str, enabled: bool) -> Result<()> {
        self.lock().execute("UPDATE providers SET enabled=?2 WHERE id=?1", params![id, enabled])?;
        Ok(())
    }

    pub fn provider_enabled(&self, id: &str) -> Result<bool> {
        Ok(self
            .lock()
            .query_row("SELECT enabled FROM providers WHERE id=?1", [id], |r| r.get::<_, bool>(0))
            .optional()?
            .unwrap_or(true))
    }

    // ---- catálogo -----------------------------------------------------------------------------

    /// Sincronização incremental: só reescreve famílias cujo `last_modified`/`version` mudou,
    /// insere as novas e remove as que o provedor deixou de listar. Tudo numa transação.
    /// Retorna (inseridas, atualizadas, removidas).
    pub fn sync_catalog(&self, provider_id: &str, families: &[RemoteFamily]) -> Result<(usize, usize, usize)> {
        let mut c = self.lock();
        let tx = c.transaction()?;
        let (mut ins, mut upd) = (0, 0);
        let mut seen: Vec<String> = Vec::with_capacity(families.len());

        for f in families {
            seen.push(f.provider_family_id.clone());
            let existing: Option<(i64, i64, Option<String>, Option<String>)> = tx
                .query_row(
                    "SELECT id,family_id,last_modified,version FROM family_sources WHERE provider_id=?1 AND provider_family_id=?2",
                    params![provider_id, f.provider_family_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
                )
                .optional()?;

            if let Some((sid, _fid, lm, ver)) = &existing {
                let unchanged = lm == &f.last_modified && ver == &f.version && f.last_modified.is_some();
                if unchanged {
                    continue;
                }
                write_source(&tx, *sid, f)?;
                upd += 1;
                continue;
            }

            // Nova origem: acha (ou cria) a família deduplicada.
            let base = normalize_key(&f.name);
            if base.is_empty() {
                continue;
            }
            let family_id = resolve_family_id(&tx, &base, f)?;
            tx.execute(
                "INSERT INTO family_sources(family_id,provider_id,provider_family_id) VALUES(?1,?2,?3)",
                params![family_id, provider_id, f.provider_family_id],
            )?;
            let sid = tx.last_insert_rowid();
            write_source(&tx, sid, f)?;
            ins += 1;
        }

        // Remove origens que sumiram do provedor.
        let mut removed = 0;
        {
            let mut stmt = tx.prepare("SELECT id, provider_family_id FROM family_sources WHERE provider_id=?1")?;
            let rows: Vec<(i64, String)> =
                stmt.query_map([provider_id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<_, _>>()?;
            let seen_set: std::collections::HashSet<&String> = seen.iter().collect();
            for (id, pfid) in rows {
                if !seen_set.contains(&pfid) {
                    tx.execute("DELETE FROM family_sources WHERE id=?1", [id])?;
                    removed += 1;
                }
            }
        }
        // Famílias sem nenhuma origem e sem arquivos em cache ou favoritos saem do catálogo.
        tx.execute(
            "DELETE FROM families WHERE id NOT IN (SELECT family_id FROM family_sources)
               AND key NOT IN (SELECT family_key FROM cache_files)",
            [],
        )?;
        // Recalcula o campo "variável" e a categoria da família.
        tx.execute(
            "UPDATE families SET variable = COALESCE((SELECT MAX(variable) FROM family_sources s WHERE s.family_id=families.id),0)",
            [],
        )?;
        tx.execute(
            "INSERT INTO providers(id,name,last_sync) VALUES(?1,?1,?2)
             ON CONFLICT(id) DO UPDATE SET last_sync=?2",
            params![provider_id, now()],
        )?;
        tx.commit()?;
        Ok((ins, upd, removed))
    }

    pub fn catalog_count(&self) -> Result<u32> {
        Ok(self.lock().query_row("SELECT COUNT(*) FROM families", [], |r| r.get(0))?)
    }

    pub fn query_catalog(&self, q: &CatalogQuery) -> Result<CatalogPage> {
        let c = self.lock();
        let mut where_sql = String::from("1=1");
        let mut args: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(t) = q.text.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            let norm = normalize_key(t);
            where_sql.push_str(" AND (f.key LIKE ?  OR LOWER(f.name) LIKE ?)");
            args.push(format!("%{norm}%").into());
            args.push(format!("%{}%", t.to_lowercase().replace('%', "")).into());
        }
        if let Some(cat) = q.category.as_deref().filter(|s| !s.is_empty()) {
            where_sql.push_str(" AND f.category = ?");
            args.push(cat.to_string().into());
        }
        if let Some(p) = q.provider.as_deref().filter(|s| !s.is_empty()) {
            where_sql.push_str(" AND EXISTS (SELECT 1 FROM family_sources s WHERE s.family_id=f.id AND s.provider_id=?)");
            args.push(p.to_string().into());
        }
        if q.variable_only {
            where_sql.push_str(" AND f.variable=1");
        }
        if q.italic_only {
            where_sql.push_str(
                " AND EXISTS (SELECT 1 FROM source_variants v JOIN family_sources s ON s.id=v.source_id WHERE s.family_id=f.id AND v.style='italic')",
            );
        }
        match q.view.as_deref() {
            Some("active") => where_sql.push_str(
                " AND f.key IN (SELECT c.family_key FROM cache_files c JOIN activations a ON a.cache_file_id=c.id)",
            ),
            Some("favorites") => where_sql.push_str(" AND f.key IN (SELECT family_key FROM favorites)"),
            Some("cached") => where_sql.push_str(" AND f.key IN (SELECT family_key FROM cache_files)"),
            Some("collection") => {
                where_sql.push_str(" AND f.key IN (SELECT family_key FROM collection_items WHERE collection_id=?)");
                args.push(q.collection_id.unwrap_or(-1).into());
            }
            _ => {}
        }

        let total: u32 = c.query_row(
            &format!("SELECT COUNT(*) FROM families f WHERE {where_sql}"),
            rusqlite::params_from_iter(args.iter()),
            |r| r.get(0),
        )?;

        // Prefixo exato primeiro, depois ordem alfabética.
        let prefix = q.text.as_deref().map(normalize_key).unwrap_or_default();
        let sql = format!(
            "SELECT f.id,f.key,f.name,f.category,f.variable FROM families f WHERE {where_sql}
             ORDER BY (CASE WHEN ?<>'' AND f.key LIKE ?||'%' THEN 0 ELSE 1 END), f.name COLLATE NOCASE LIMIT ? OFFSET ?"
        );
        let mut a2 = args.clone();
        a2.push(prefix.clone().into());
        a2.push(prefix.into());
        a2.push((q.limit.clamp(1, 500) as i64).into());
        a2.push((q.offset as i64).into());
        let mut stmt = c.prepare(&sql)?;
        let rows: Vec<(i64, String, String, Option<String>, bool)> = stmt
            .query_map(rusqlite::params_from_iter(a2.iter()), |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })?
            .collect::<std::result::Result<_, _>>()?;
        drop(stmt);
        let items = rows
            .into_iter()
            .map(|(id, key, name, cat, var)| summarize(&c, id, key, name, cat, var))
            .collect::<Result<Vec<_>>>()?;
        Ok(CatalogPage { total, items })
    }

    pub fn categories(&self) -> Result<Vec<String>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT DISTINCT category FROM families WHERE category IS NOT NULL ORDER BY 1")?;
        let v = s.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn family_detail(&self, key: &str) -> Result<FamilyDetail> {
        let c = self.lock();
        let (id, name, cat, var): (i64, String, Option<String>, bool) = c
            .query_row("SELECT id,name,category,variable FROM families WHERE key=?1", [key], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })
            .optional()?
            .ok_or_else(|| Error::NotFound(format!("família {key}")))?;
        let summary = summarize(&c, id, key.to_string(), name, cat, var)?;
        let mut stmt = c.prepare(
            "SELECT id,provider_id,provider_family_id,origin,version,license,license_url,last_modified,subsets,axes,variable
             FROM family_sources WHERE family_id=?1 ORDER BY provider_id",
        )?;
        let srcs = stmt
            .query_map([id], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    SourceView {
                        provider_id: r.get(1)?,
                        provider_family_id: r.get(2)?,
                        origin: r.get(3)?,
                        version: r.get(4)?,
                        license: r.get(5)?,
                        license_url: r.get(6)?,
                        last_modified: r.get(7)?,
                        subsets: serde_json::from_str(&r.get::<_, String>(8)?).unwrap_or_default(),
                        axes: serde_json::from_str(&r.get::<_, String>(9)?).unwrap_or_default(),
                        variable: r.get(10)?,
                        variants: vec![],
                    },
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut sources = Vec::new();
        for (sid, mut sv) in srcs {
            let mut vs = c.prepare("SELECT weight,style FROM source_variants WHERE source_id=?1 ORDER BY weight,style")?;
            sv.variants = vs
                .query_map([sid], |r| {
                    Ok(VariantView {
                        weight: r.get::<_, i64>(0)? as u16,
                        style: Style::parse(&r.get::<_, String>(1)?).unwrap_or(Style::Normal),
                    })
                })?
                .collect::<std::result::Result<_, _>>()?;
            sources.push(sv);
        }
        let mut cs = c.prepare("SELECT collection_id FROM collection_items WHERE family_key=?1")?;
        let collections = cs.query_map([key], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        Ok(FamilyDetail { summary, sources, collections })
    }

    /// Id interno de uma origem.
    pub fn source_id(&self, provider_id: &str, family_key: &str) -> Result<Option<i64>> {
        Ok(self
            .lock()
            .query_row(
                "SELECT s.id FROM family_sources s JOIN families f ON f.id=s.family_id WHERE s.provider_id=?1 AND f.key=?2",
                params![provider_id, family_key],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn source_ids_for_family(&self, family_key: &str) -> Result<Vec<(i64, String, String, Option<String>, Option<String>)>> {
        let c = self.lock();
        let mut s = c.prepare(
            "SELECT s.id,s.provider_id,s.provider_family_id,s.origin,s.license FROM family_sources s
             JOIN families f ON f.id=s.family_id WHERE f.key=?1 ORDER BY s.provider_id",
        )?;
        let v = s
            .query_map([family_key], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?
            .collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn store_source_files(&self, source_id: i64, files: &[RemoteFile]) -> Result<()> {
        let mut c = self.lock();
        let tx = c.transaction()?;
        tx.execute("DELETE FROM source_files WHERE source_id=?1", [source_id])?;
        for f in files {
            tx.execute(
                "INSERT OR REPLACE INTO source_files(source_id,weight,style,format,subset,url,variable,resolved_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    source_id,
                    f.weight,
                    f.style.as_str(),
                    f.format.as_str(),
                    f.subset.clone().unwrap_or_default(),
                    f.url,
                    f.variable,
                    now()
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn source_files(&self, source_id: i64) -> Result<Vec<RemoteFile>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT weight,style,format,subset,url,variable FROM source_files WHERE source_id=?1")?;
        let v = s
            .query_map([source_id], |r| {
                let subset: String = r.get(3)?;
                Ok(RemoteFile {
                    weight: r.get::<_, i64>(0)? as u16,
                    style: Style::parse(&r.get::<_, String>(1)?).unwrap_or(Style::Normal),
                    format: FileFormat::parse(&r.get::<_, String>(2)?).unwrap_or(FileFormat::Ttf),
                    subset: if subset.is_empty() { None } else { Some(subset) },
                    url: r.get(4)?,
                    variable: r.get(5)?,
                })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }
}

fn resolve_family_id(tx: &rusqlite::Transaction, base_key: &str, f: &RemoteFamily) -> Result<i64> {
    // Procura uma família existente compatível (mesmo nome e licença não conflitante).
    let mut candidates = vec![base_key.to_string()];
    let mut stmt = tx.prepare("SELECT key FROM families WHERE key LIKE ?1 ESCAPE '\\'")?;
    let like = format!("{}~%", base_key.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    for k in stmt.query_map([like], |r| r.get::<_, String>(0))? {
        candidates.push(k?);
    }
    drop(stmt);
    for key in &candidates {
        let row: Option<i64> = tx.query_row("SELECT id FROM families WHERE key=?1", [key], |r| r.get(0)).optional()?;
        let Some(fid) = row else { continue };
        let mut s = tx.prepare("SELECT license FROM family_sources WHERE family_id=?1")?;
        let lics: Vec<Option<String>> = s.query_map([fid], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        if lics.iter().all(|l| licenses_compatible(l.as_deref(), f.license.as_deref())) {
            return Ok(fid);
        }
    }
    // Nova família (com sufixo se a chave base já está ocupada por outra, incompatível).
    let taken: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM families WHERE key=?1)", [base_key], |r| r.get(0))?;
    let key = if taken { format!("{base_key}~{}", f.provider_id) } else { base_key.to_string() };
    tx.execute(
        "INSERT INTO families(key,name,category,variable) VALUES(?1,?2,?3,?4)",
        params![key, f.name, f.category, f.variable],
    )?;
    Ok(tx.last_insert_rowid())
}

fn write_source(tx: &rusqlite::Transaction, sid: i64, f: &RemoteFamily) -> Result<()> {
    tx.execute(
        "UPDATE family_sources SET origin=?2,version=?3,license=?4,license_url=?5,last_modified=?6,subsets=?7,axes=?8,variable=?9
         WHERE id=?1",
        params![
            sid,
            f.origin,
            f.version,
            f.license,
            f.license_url,
            f.last_modified,
            serde_json::to_string(&f.subsets)?,
            serde_json::to_string(&f.axes)?,
            f.variable
        ],
    )?;
    tx.execute("DELETE FROM source_variants WHERE source_id=?1", [sid])?;
    for w in &f.weights {
        for st in &f.styles {
            tx.execute(
                "INSERT OR IGNORE INTO source_variants(source_id,weight,style) VALUES(?1,?2,?3)",
                params![sid, w, st.as_str()],
            )?;
        }
    }
    // Categoria: preenche se a família ainda não tem.
    if let Some(cat) = &f.category {
        tx.execute(
            "UPDATE families SET category=COALESCE(category,?2) WHERE id=(SELECT family_id FROM family_sources WHERE id=?1)",
            params![sid, cat],
        )?;
    }
    Ok(())
}

fn summarize(c: &Connection, id: i64, key: String, name: String, category: Option<String>, variable: bool) -> Result<FamilySummary> {
    let mut ps = c.prepare("SELECT provider_id,origin,license,variable FROM family_sources WHERE family_id=?1 ORDER BY provider_id")?;
    let srcs: Vec<(String, Option<String>, Option<String>, bool)> =
        ps.query_map([id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<std::result::Result<_, _>>()?;
    let providers = srcs.iter().map(|s| s.0.clone()).collect::<Vec<_>>();
    let license = srcs.iter().find_map(|s| s.2.clone());
    let mut ws = c.prepare(
        "SELECT DISTINCT v.weight, v.style FROM source_variants v JOIN family_sources s ON s.id=v.source_id WHERE s.family_id=?1",
    )?;
    let vars: Vec<(i64, String)> = ws.query_map([id], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<_, _>>()?;
    let mut weights: Vec<u16> = vars.iter().map(|v| v.0 as u16).collect();
    weights.sort_unstable();
    weights.dedup();
    let has_italic = vars.iter().any(|v| v.1 == "italic");

    let (active, cached): (i64, i64) = c.query_row(
        "SELECT (SELECT COUNT(*) FROM cache_files cf JOIN activations a ON a.cache_file_id=cf.id WHERE cf.family_key=?1),
                (SELECT COUNT(*) FROM cache_files WHERE family_key=?1)",
        [&key],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let in_system: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM local_fonts WHERE LOWER(family)=LOWER(?1))",
        [&name],
        |r| r.get(0),
    )?;
    let state = if active > 0 {
        if active < cached {
            ActivationState::Partial
        } else {
            ActivationState::Active
        }
    } else if in_system {
        ActivationState::System
    } else {
        ActivationState::Inactive
    };
    let favorite: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM favorites WHERE family_key=?1)", [&key], |r| r.get(0))?;
    // Prévia via CDN: prioriza espelho do Google, depois Fontsource, depois Bunny.
    let is_google = srcs.iter().any(|s| s.0 == "google" || s.1.as_deref() == Some("google"));
    let preview_cdn = if is_google {
        Some("google".to_string())
    } else if srcs.iter().any(|s| s.0 == "fontsource") {
        Some("fontsource".into())
    } else {
        None
    };
    Ok(FamilySummary {
        key,
        name,
        category,
        providers,
        weights,
        has_italic,
        variable: variable || srcs.iter().any(|s| s.3),
        license,
        favorite,
        state,
        cached: cached > 0,
        installable: is_google
            || cached > 0
            || c.query_row(
                "SELECT EXISTS(SELECT 1 FROM source_files sf JOIN family_sources s ON s.id=sf.source_id WHERE s.family_id=?1 AND sf.format IN ('ttf','otf'))",
                [id],
                |r| r.get(0),
            )?,
        preview_cdn,
    })
}
