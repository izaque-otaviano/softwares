//! Cache de arquivos, ativações (com contagem de referências) e inventário local.

use super::{now, Db};
use crate::error::{Error, Result};
use fm_native::Scope;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheFile {
    pub id: i64,
    pub family_key: String,
    pub family_name: String,
    pub provider_id: String,
    pub weight: u16,
    pub style: String,
    pub variable: bool,
    /// Distingue arquivos de pacote com o mesmo peso/estilo (ex.: "Condensed Bold"). Vazio nos demais.
    #[serde(default)]
    pub variant_name: String,
    pub format: String,
    pub rel_path: String,
    pub sha256: String,
    pub size: u64,
    pub internal_family: Option<String>,
    pub internal_style: Option<String>,
    pub source_url: String,
    pub license: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationRow {
    pub cache_file_id: i64,
    pub scope: Scope,
    pub display_name: String,
    pub registered_at: String,
    pub notification: String,
    pub backend: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFamily {
    pub family: String,
    pub faces: u32,
    pub sample_path: String,
}

fn scope_str(s: Scope) -> &'static str {
    match s {
        Scope::Session => "session",
        Scope::Persistent => "persistent",
    }
}

const CF_COLS: &str = "id,family_key,family_name,provider_id,weight,style,variable,format,rel_path,sha256,size,internal_family,internal_style,source_url,license,variant_name";

fn cf_row(r: &rusqlite::Row) -> rusqlite::Result<CacheFile> {
    Ok(CacheFile {
        id: r.get(0)?,
        family_key: r.get(1)?,
        family_name: r.get(2)?,
        provider_id: r.get(3)?,
        weight: r.get::<_, i64>(4)? as u16,
        style: r.get(5)?,
        variable: r.get(6)?,
        format: r.get(7)?,
        rel_path: r.get(8)?,
        sha256: r.get(9)?,
        size: r.get::<_, i64>(10)? as u64,
        internal_family: r.get(11)?,
        internal_style: r.get(12)?,
        source_url: r.get(13)?,
        license: r.get(14)?,
        variant_name: r.get(15)?,
    })
}

impl Db {
    pub fn insert_cache_file(&self, f: &CacheFile) -> Result<i64> {
        let c = self.lock();
        c.execute(
            "INSERT INTO cache_files(family_key,family_name,provider_id,weight,style,variable,format,rel_path,sha256,size,internal_family,internal_style,source_url,license,downloaded_at,variant_name)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
             ON CONFLICT(family_key,provider_id,weight,style,variable,variant_name) DO UPDATE SET
               format=?7,rel_path=?8,sha256=?9,size=?10,internal_family=?11,internal_style=?12,source_url=?13,license=?14,downloaded_at=?15",
            params![
                f.family_key, f.family_name, f.provider_id, f.weight, f.style, f.variable, f.format, f.rel_path, f.sha256,
                f.size as i64, f.internal_family, f.internal_style, f.source_url, f.license, now(), f.variant_name
            ],
        )?;
        Ok(c.query_row(
            "SELECT id FROM cache_files WHERE family_key=?1 AND provider_id=?2 AND weight=?3 AND style=?4 AND variable=?5 AND variant_name=?6",
            params![f.family_key, f.provider_id, f.weight, f.style, f.variable, f.variant_name],
            |r| r.get(0),
        )?)
    }

    pub fn find_cache_file(&self, family_key: &str, provider_id: &str, weight: u16, style: &str, variable: bool) -> Result<Option<CacheFile>> {
        Ok(self
            .lock()
            .query_row(
                &format!("SELECT {CF_COLS} FROM cache_files WHERE family_key=?1 AND provider_id=?2 AND weight=?3 AND style=?4 AND variable=?5 AND variant_name=''"),
                params![family_key, provider_id, weight, style, variable],
                cf_row,
            )
            .optional()?)
    }

    pub fn cache_file(&self, id: i64) -> Result<CacheFile> {
        self.lock()
            .query_row(&format!("SELECT {CF_COLS} FROM cache_files WHERE id=?1"), [id], cf_row)
            .optional()?
            .ok_or_else(|| Error::NotFound(format!("arquivo em cache {id}")))
    }

    pub fn cache_files_for_provider(&self, family_key: &str, provider_id: &str) -> Result<Vec<CacheFile>> {
        let c = self.lock();
        let mut s = c.prepare(&format!("SELECT {CF_COLS} FROM cache_files WHERE family_key=?1 AND provider_id=?2 ORDER BY weight,style"))?;
        let v = s.query_map(params![family_key, provider_id], cf_row)?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn cache_files_for_family(&self, family_key: &str) -> Result<Vec<CacheFile>> {
        let c = self.lock();
        let mut s = c.prepare(&format!("SELECT {CF_COLS} FROM cache_files WHERE family_key=?1 ORDER BY weight,style"))?;
        let v = s.query_map([family_key], cf_row)?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn delete_cache_file(&self, id: i64) -> Result<()> {
        // ON DELETE RESTRICT impede apagar arquivo ainda ativado.
        self.lock().execute("DELETE FROM cache_files WHERE id=?1", [id])?;
        Ok(())
    }

    pub fn cache_total_bytes(&self) -> Result<u64> {
        Ok(self.lock().query_row("SELECT COALESCE(SUM(size),0) FROM cache_files", [], |r| r.get::<_, i64>(0))? as u64)
    }

    // ---- ativações com referências -----------------------------------------------------------

    pub fn activation(&self, cache_file_id: i64) -> Result<Option<ActivationRow>> {
        Ok(self
            .lock()
            .query_row(
                "SELECT cache_file_id,scope,display_name,registered_at,notification,backend FROM activations WHERE cache_file_id=?1",
                [cache_file_id],
                act_row,
            )
            .optional()?)
    }

    pub fn all_activations(&self) -> Result<Vec<ActivationRow>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT cache_file_id,scope,display_name,registered_at,notification,backend FROM activations")?;
        let v = s.query_map([], act_row)?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    /// Registra a ativação (se ainda não existe) e adiciona a referência do dono.
    pub fn add_activation_ref(&self, row: &ActivationRow, owner: &str) -> Result<()> {
        let mut c = self.lock();
        let tx = c.transaction()?;
        tx.execute(
            "INSERT OR IGNORE INTO activations(cache_file_id,scope,display_name,registered_at,notification,backend)
             VALUES(?1,?2,?3,?4,?5,?6)",
            params![row.cache_file_id, scope_str(row.scope), row.display_name, row.registered_at, row.notification, row.backend],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO activation_refs(cache_file_id,owner) VALUES(?1,?2)",
            params![row.cache_file_id, owner],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Só adiciona a referência (arquivo já registrado no SO).
    pub fn add_ref_only(&self, cache_file_id: i64, owner: &str) -> Result<()> {
        self.lock().execute(
            "INSERT OR IGNORE INTO activation_refs(cache_file_id,owner) VALUES(?1,?2)",
            params![cache_file_id, owner],
        )?;
        Ok(())
    }

    /// Remove a referência. Devolve quantas referências restam.
    pub fn remove_ref(&self, cache_file_id: i64, owner: &str) -> Result<u32> {
        let c = self.lock();
        c.execute("DELETE FROM activation_refs WHERE cache_file_id=?1 AND owner=?2", params![cache_file_id, owner])?;
        Ok(c.query_row("SELECT COUNT(*) FROM activation_refs WHERE cache_file_id=?1", [cache_file_id], |r| r.get(0))?)
    }

    pub fn drop_activation(&self, cache_file_id: i64) -> Result<()> {
        self.lock().execute("DELETE FROM activations WHERE cache_file_id=?1", [cache_file_id])?;
        Ok(())
    }

    pub fn refs_of_owner(&self, owner: &str) -> Result<Vec<i64>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT cache_file_id FROM activation_refs WHERE owner=?1")?;
        let v = s.query_map([owner], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn ref_count(&self, cache_file_id: i64) -> Result<u32> {
        Ok(self.lock().query_row("SELECT COUNT(*) FROM activation_refs WHERE cache_file_id=?1", [cache_file_id], |r| r.get(0))?)
    }

    // ---- inventário local ---------------------------------------------------------------------

    pub fn local_known(&self) -> Result<std::collections::HashMap<String, (i64, i64)>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT path,size,mtime FROM local_fonts")?;
        let v = s
            .query_map([], |r| Ok((r.get::<_, String>(0)?, (r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))))?
            .collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn local_apply(
        &self,
        upserts: &[(String, String, Option<String>, Option<u16>, bool, i64, i64)],
        removed: &[String],
    ) -> Result<()> {
        let mut c = self.lock();
        let tx = c.transaction()?;
        for (path, fam, style, weight, italic, size, mtime) in upserts {
            tx.execute(
                "INSERT OR REPLACE INTO local_fonts(path,family,style,weight,italic,size,mtime) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![path, fam, style, weight, italic, size, mtime],
            )?;
        }
        for p in removed {
            tx.execute("DELETE FROM local_fonts WHERE path=?1", [p])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn local_families(&self, text: Option<&str>, offset: u32, limit: u32) -> Result<(u32, Vec<LocalFamily>)> {
        let c = self.lock();
        let like = format!("%{}%", text.unwrap_or("").trim().to_lowercase());
        let total: u32 = c.query_row(
            "SELECT COUNT(DISTINCT LOWER(family)) FROM local_fonts WHERE LOWER(family) LIKE ?1",
            [&like],
            |r| r.get(0),
        )?;
        let mut s = c.prepare(
            "SELECT family, COUNT(*), MIN(path) FROM local_fonts WHERE LOWER(family) LIKE ?1
             GROUP BY LOWER(family) ORDER BY family COLLATE NOCASE LIMIT ?2 OFFSET ?3",
        )?;
        let v = s
            .query_map(params![like, limit.clamp(1, 500), offset], |r| {
                Ok(LocalFamily { family: r.get(0)?, faces: r.get(1)?, sample_path: r.get(2)? })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok((total, v))
    }

    pub fn is_system_family(&self, family: &str) -> Result<bool> {
        Ok(self.lock().query_row(
            "SELECT EXISTS(SELECT 1 FROM local_fonts WHERE LOWER(family)=LOWER(?1))",
            [family],
            |r| r.get(0),
        )?)
    }
}

fn act_row(r: &rusqlite::Row) -> rusqlite::Result<ActivationRow> {
    let scope: String = r.get(1)?;
    Ok(ActivationRow {
        cache_file_id: r.get(0)?,
        scope: if scope == "persistent" { Scope::Persistent } else { Scope::Session },
        display_name: r.get(2)?,
        registered_at: r.get(3)?,
        notification: r.get(4)?,
        backend: r.get(5)?,
    })
}
