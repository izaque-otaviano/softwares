//! Licenças lidas de pacotes, aceites do usuário e detalhes remotos obtidos sob demanda.

use super::{now, Db};
use crate::error::Result;
use crate::model::VariantView;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SourceLicense {
    pub license: String,
    pub file_name: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteDetailsRow {
    pub preview_image: Option<String>,
    pub checksums: BTreeMap<String, String>,
}

impl Db {
    /// Guarda a licença lida do pacote e a reflete em `family_sources.license`.
    pub fn set_source_license(&self, source_id: i64, lic: &SourceLicense) -> Result<()> {
        let mut c = self.lock();
        let tx = c.transaction()?;
        tx.execute(
            "INSERT INTO source_licenses(source_id,license,file_name,text,read_at) VALUES(?1,?2,?3,?4,?5)
             ON CONFLICT(source_id) DO UPDATE SET license=?2,file_name=?3,text=?4,read_at=?5",
            params![source_id, lic.license, lic.file_name, lic.text, now()],
        )?;
        tx.execute("UPDATE family_sources SET license=?2 WHERE id=?1", params![source_id, lic.license])?;
        tx.commit()?;
        Ok(())
    }

    pub fn source_license(&self, source_id: i64) -> Result<Option<SourceLicense>> {
        Ok(self
            .lock()
            .query_row("SELECT license,file_name,text FROM source_licenses WHERE source_id=?1", [source_id], |r| {
                Ok(SourceLicense { license: r.get(0)?, file_name: r.get(1)?, text: r.get(2)? })
            })
            .optional()?)
    }

    pub fn accept_license(&self, family_key: &str, provider_id: &str, license: &str) -> Result<()> {
        self.lock().execute(
            "INSERT INTO license_acceptances(family_key,provider_id,license,accepted_at) VALUES(?1,?2,?3,?4)
             ON CONFLICT(family_key,provider_id) DO UPDATE SET license=?3,accepted_at=?4",
            params![family_key, provider_id, license, now()],
        )?;
        Ok(())
    }

    /// O aceite só vale para a MESMA licença: se o pacote mudar de licença, pergunta de novo.
    pub fn license_accepted(&self, family_key: &str, provider_id: &str, license: &str) -> Result<bool> {
        Ok(self.lock().query_row(
            "SELECT EXISTS(SELECT 1 FROM license_acceptances WHERE family_key=?1 AND provider_id=?2 AND license=?3)",
            params![family_key, provider_id, license],
            |r| r.get(0),
        )?)
    }

    pub fn remote_details(&self, source_id: i64) -> Result<Option<RemoteDetailsRow>> {
        Ok(self
            .lock()
            .query_row("SELECT preview_image,checksums FROM remote_details WHERE source_id=?1", [source_id], |r| {
                Ok(RemoteDetailsRow { preview_image: r.get(0)?, checksums: serde_json::from_str(&r.get::<_, String>(1)?).unwrap_or_default() })
            })
            .optional()?)
    }

    /// Grava detalhes obtidos sob demanda e as variantes reais declaradas pelo provedor.
    pub fn set_remote_details(&self, source_id: i64, d: &RemoteDetailsRow, variants: &[VariantView]) -> Result<()> {
        let mut c = self.lock();
        let tx = c.transaction()?;
        tx.execute(
            "INSERT INTO remote_details(source_id,preview_image,checksums,fetched_at) VALUES(?1,?2,?3,?4)
             ON CONFLICT(source_id) DO UPDATE SET preview_image=?2,checksums=?3,fetched_at=?4",
            params![source_id, d.preview_image, serde_json::to_string(&d.checksums)?, now()],
        )?;
        if !variants.is_empty() {
            tx.execute("DELETE FROM source_variants WHERE source_id=?1", [source_id])?;
            for v in variants {
                tx.execute("INSERT OR IGNORE INTO source_variants(source_id,weight,style) VALUES(?1,?2,?3)", params![source_id, v.weight, v.style.as_str()])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}
