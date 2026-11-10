use super::{now, Db};
use crate::error::{Error, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: i64,
    pub ts: String,
    pub kind: String,
    pub family_key: Option<String>,
    pub status: String,
    pub detail: Option<String>,
}

impl Db {
    pub fn set_favorite(&self, key: &str, on: bool) -> Result<()> {
        let c = self.lock();
        if on {
            c.execute("INSERT OR IGNORE INTO favorites(family_key,added_at) VALUES(?1,?2)", params![key, now()])?;
        } else {
            c.execute("DELETE FROM favorites WHERE family_key=?1", [key])?;
        }
        Ok(())
    }

    pub fn favorites(&self) -> Result<Vec<String>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT family_key FROM favorites ORDER BY added_at")?;
        let v = s.query_map([], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn create_collection(&self, name: &str) -> Result<Collection> {
        let name = name.trim();
        if name.is_empty() || name.len() > 80 {
            return Err(Error::Other("nome de coleção inválido".into()));
        }
        let c = self.lock();
        c.execute("INSERT INTO collections(name,created_at) VALUES(?1,?2)", params![name, now()])
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
                    Error::Other("já existe uma coleção com esse nome".into())
                }
                other => other.into(),
            })?;
        Ok(Collection { id: c.last_insert_rowid(), name: name.into(), count: 0 })
    }

    pub fn rename_collection(&self, id: i64, name: &str) -> Result<()> {
        let n = self.lock().execute("UPDATE collections SET name=?2 WHERE id=?1", params![id, name.trim()])?;
        if n == 0 {
            return Err(Error::NotFound(format!("coleção {id}")));
        }
        Ok(())
    }

    pub fn delete_collection(&self, id: i64) -> Result<()> {
        self.lock().execute("DELETE FROM collections WHERE id=?1", [id])?;
        Ok(())
    }

    pub fn collections(&self) -> Result<Vec<Collection>> {
        let c = self.lock();
        let mut s = c.prepare(
            "SELECT c.id,c.name,(SELECT COUNT(*) FROM collection_items i WHERE i.collection_id=c.id)
             FROM collections c ORDER BY c.name COLLATE NOCASE",
        )?;
        let v = s
            .query_map([], |r| Ok(Collection { id: r.get(0)?, name: r.get(1)?, count: r.get(2)? }))?
            .collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn collection_member(&self, id: i64, key: &str, member: bool) -> Result<()> {
        let c = self.lock();
        if member {
            c.execute(
                "INSERT OR IGNORE INTO collection_items(collection_id,family_key,added_at) VALUES(?1,?2,?3)",
                params![id, key, now()],
            )?;
        } else {
            c.execute("DELETE FROM collection_items WHERE collection_id=?1 AND family_key=?2", params![id, key])?;
        }
        Ok(())
    }

    pub fn collection_keys(&self, id: i64) -> Result<Vec<String>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT family_key FROM collection_items WHERE collection_id=?1 ORDER BY added_at")?;
        let v = s.query_map([id], |r| r.get(0))?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self.lock().query_row("SELECT value FROM settings WHERE key=?1", [key], |r| r.get(0)).optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.lock().execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn all_settings(&self) -> Result<Vec<(String, String)>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT key,value FROM settings ORDER BY key")?;
        let v = s.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?.collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }

    pub fn log_op(&self, kind: &str, family_key: Option<&str>, status: &str, detail: &str) {
        let _ = self.lock().execute(
            "INSERT INTO operation_log(ts,kind,family_key,status,detail) VALUES(?1,?2,?3,?4,?5)",
            params![now(), kind, family_key, status, detail],
        );
    }

    pub fn recent_log(&self, limit: u32) -> Result<Vec<LogEntry>> {
        let c = self.lock();
        let mut s = c.prepare("SELECT id,ts,kind,family_key,status,detail FROM operation_log ORDER BY id DESC LIMIT ?1")?;
        let v = s
            .query_map([limit], |r| {
                Ok(LogEntry { id: r.get(0)?, ts: r.get(1)?, kind: r.get(2)?, family_key: r.get(3)?, status: r.get(4)?, detail: r.get(5)? })
            })?
            .collect::<std::result::Result<_, _>>()?;
        Ok(v)
    }
}
