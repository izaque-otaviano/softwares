//! Persistência SQLite, migrações, deduplicação entre provedores e sincronização incremental.

use fm_core::db::Db;
use fm_core::model::*;

fn fam(provider: &str, id: &str, name: &str, license: Option<&str>, origin: Option<&str>, weights: &[u16], lm: &str) -> RemoteFamily {
    RemoteFamily {
        provider_id: provider.into(),
        provider_family_id: id.into(),
        name: name.into(),
        category: Some("sans-serif".into()),
        origin: origin.map(Into::into),
        version: Some("v1".into()),
        license: license.map(Into::into),
        license_url: None,
        last_modified: Some(lm.into()),
        subsets: vec!["latin".into()],
        weights: weights.to_vec(),
        styles: vec![Style::Normal],
        variable: false,
        axes: vec![],
    }
}

fn db_with_providers() -> Db {
    let db = Db::open_in_memory().unwrap();
    for p in ["google", "fontsource"] {
        db.upsert_provider(p, p, ProviderStatus::Ok, None).unwrap();
    }
    db
}

fn q(text: &str) -> CatalogQuery {
    CatalogQuery { text: Some(text.into()), limit: 50, ..Default::default() }
}

#[test]
fn migracoes_sao_idempotentes_e_com_integridade_referencial() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("t.sqlite");
    let db = Db::open(&path).unwrap();
    assert_eq!(db.schema_version().unwrap(), 2);
    drop(db);
    let db = Db::open(&path).unwrap(); // reabrir não reaplica
    assert_eq!(db.schema_version().unwrap(), 2);
    let fk: i64 = db.lock().query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
    assert_eq!(fk, 1);
    // FK: variante sem origem é rejeitada.
    let r = db.lock().execute("INSERT INTO source_variants(source_id,weight,style) VALUES(999,400,'normal')", []);
    assert!(r.is_err());
}

#[test]
fn mesma_familia_em_dois_provedores_aparece_uma_vez() {
    let db = db_with_providers();
    db.sync_catalog("fontsource", &[fam("fontsource", "inter", "Inter", Some("OFL-1.1"), Some("google"), &[400, 700], "1")]).unwrap();
    db.sync_catalog("google", &[fam("google", "Inter", "Inter", None, Some("google"), &[400, 500, 700], "2")]).unwrap();
    let page = db.query_catalog(&q("inter")).unwrap();
    assert_eq!(page.total, 1);
    let d = db.family_detail("inter").unwrap();
    assert_eq!(d.sources.len(), 2, "origens guardadas separadamente");
    assert_eq!(d.summary.providers, vec!["fontsource", "google"]);
    assert_eq!(d.summary.weights, vec![400, 500, 700], "união das variantes");
    // Variantes por origem permanecem distintas.
    let g = d.sources.iter().find(|s| s.provider_id == "google").unwrap();
    assert_eq!(g.variants.len(), 3);
    let f = d.sources.iter().find(|s| s.provider_id == "fontsource").unwrap();
    assert_eq!(f.variants.len(), 2);
    assert_eq!(f.license.as_deref(), Some("OFL-1.1"));
}

#[test]
fn nomes_parecidos_nao_sao_fundidos_e_licenca_conflitante_separa() {
    let db = db_with_providers();
    db.sync_catalog(
        "fontsource",
        &[
            fam("fontsource", "inter", "Inter", Some("OFL-1.1"), None, &[400], "1"),
            fam("fontsource", "inter-tight", "Inter Tight", Some("OFL-1.1"), None, &[400], "1"),
        ],
    )
    .unwrap();
    assert_eq!(db.query_catalog(&q("inter")).unwrap().total, 2);
    // Outro provedor com a mesma "Inter" mas licença proprietária: não funde.
    db.sync_catalog("google", &[fam("google", "Inter", "Inter", Some("Proprietary"), None, &[400], "1")]).unwrap();
    let page = db.query_catalog(&q("inter")).unwrap();
    assert_eq!(page.total, 3);
    assert!(page.items.iter().any(|f| f.key == "inter~google"));
}

#[test]
fn sincronizacao_incremental() {
    let db = db_with_providers();
    let (i, u, r) = db
        .sync_catalog("fontsource", &[fam("fontsource", "a", "Alpha", None, None, &[400], "1"), fam("fontsource", "b", "Beta", None, None, &[400], "1")])
        .unwrap();
    assert_eq!((i, u, r), (2, 0, 0));
    // Igual: nada reescrito. Alpha mudou; Beta sumiu; Gamma nova.
    let (i, u, r) = db
        .sync_catalog("fontsource", &[fam("fontsource", "a", "Alpha", None, None, &[400, 700], "2"), fam("fontsource", "c", "Gamma", None, None, &[400], "1")])
        .unwrap();
    assert_eq!((i, u, r), (1, 1, 1));
    assert_eq!(db.query_catalog(&q("beta")).unwrap().total, 0);
    assert_eq!(db.family_detail("alpha").unwrap().summary.weights, vec![400, 700]);
    let (i, u, r) = db
        .sync_catalog("fontsource", &[fam("fontsource", "a", "Alpha", None, None, &[400, 700], "2"), fam("fontsource", "c", "Gamma", None, None, &[400], "1")])
        .unwrap();
    assert_eq!((i, u, r), (0, 0, 0));
    assert!(db.provider_last_sync("fontsource").unwrap().is_some());
}

#[test]
fn busca_filtros_e_paginacao_em_catalogo_grande() {
    let db = db_with_providers();
    let many: Vec<RemoteFamily> = (0..5000)
        .map(|i| {
            let mut f = fam("fontsource", &format!("f{i}"), &format!("Familia {i:04}"), Some("OFL-1.1"), Some("google"), &[400], "1");
            f.category = Some(if i % 2 == 0 { "serif" } else { "monospace" }.into());
            f
        })
        .collect();
    let t = std::time::Instant::now();
    db.sync_catalog("fontsource", &many).unwrap();
    let sync = t.elapsed();
    assert_eq!(db.catalog_count().unwrap(), 5000);
    let t = std::time::Instant::now();
    let p = db.query_catalog(&CatalogQuery { text: Some("familia 49".into()), limit: 20, ..Default::default() }).unwrap();
    let query = t.elapsed();
    assert_eq!(p.total, 100);
    assert_eq!(p.items.len(), 20);
    let p2 = db.query_catalog(&CatalogQuery { text: Some("familia 49".into()), limit: 20, offset: 20, ..Default::default() }).unwrap();
    assert_ne!(p.items[0].key, p2.items[0].key);
    assert_eq!(db.query_catalog(&CatalogQuery { category: Some("serif".into()), limit: 1, ..Default::default() }).unwrap().total, 2500);
    assert!(query.as_millis() < 500, "busca lenta: {query:?} (sync {sync:?})");
    println!("sync 5000 famílias: {sync:?}; busca: {query:?}");
}

#[test]
fn favoritos_colecoes_e_configuracoes_persistem_apos_reabrir() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("p.sqlite");
    {
        let db = Db::open(&path).unwrap();
        db.upsert_provider("fontsource", "f", ProviderStatus::Ok, None).unwrap();
        db.sync_catalog("fontsource", &[fam("fontsource", "a", "Alpha", None, None, &[400], "1"), fam("fontsource", "b", "Beta", None, None, &[400], "1")]).unwrap();
        db.set_favorite("alpha", true).unwrap();
        let c = db.create_collection("Projeto X").unwrap();
        assert!(db.create_collection("projeto x").is_err(), "nome único sem distinção de caixa");
        db.collection_member(c.id, "beta", true).unwrap();
        db.set_setting("scope", "persistent").unwrap();
    }
    let db = Db::open(&path).unwrap();
    assert_eq!(db.favorites().unwrap(), vec!["alpha"]);
    let cols = db.collections().unwrap();
    assert_eq!((cols[0].name.as_str(), cols[0].count), ("Projeto X", 1));
    assert_eq!(db.get_setting("scope").unwrap().as_deref(), Some("persistent"));
    let fav = db.query_catalog(&CatalogQuery { view: Some("favorites".into()), limit: 10, ..Default::default() }).unwrap();
    assert_eq!(fav.items.len(), 1);
    assert!(fav.items[0].favorite);
    let col = db.query_catalog(&CatalogQuery { view: Some("collection".into()), collection_id: Some(cols[0].id), limit: 10, ..Default::default() }).unwrap();
    assert_eq!(col.items[0].key, "beta");
    // Apagar a coleção remove os vínculos (cascade) sem apagar a família.
    db.delete_collection(cols[0].id).unwrap();
    assert_eq!(db.catalog_count().unwrap(), 2);
}

#[test]
fn catalogo_remoto_separado_do_inventario_local() {
    let db = db_with_providers();
    db.local_apply(&[("/f/a.ttf".into(), "Arial".into(), Some("Regular".into()), Some(400), false, 10, 1)], &[]).unwrap();
    assert_eq!(db.catalog_count().unwrap(), 0, "fonte local não entra no catálogo remoto");
    let (n, v) = db.local_families(Some("aria"), 0, 10).unwrap();
    assert_eq!((n, v[0].family.as_str()), (1, "Arial"));
}

#[test]
fn migracao_de_v1_para_v2_preserva_cache_e_ativacoes() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("v1.sqlite");
    {
        // Banco criado por uma versão antiga do app (só a migração 001), com uma fonte ativa.
        let c = rusqlite::Connection::open(&path).unwrap();
        c.execute_batch(include_str!("../migrations/001_init.sql")).unwrap();
        c.execute_batch("PRAGMA user_version=1; PRAGMA foreign_keys=ON;").unwrap();
        c.execute(
            "INSERT INTO cache_files(id,family_key,family_name,provider_id,weight,style,variable,format,rel_path,sha256,size,source_url,downloaded_at)
             VALUES(7,'inter','Inter','google',400,'normal',0,'ttf','fonts/google/inter/400-normal.ttf','abc',10,'https://x','t')",
            [],
        )
        .unwrap();
        c.execute("INSERT INTO activations(cache_file_id,scope,display_name,registered_at,notification,backend) VALUES(7,'session','Inter Regular','t','Broadcast','x')", []).unwrap();
        c.execute("INSERT INTO activation_refs(cache_file_id,owner) VALUES(7,'family:inter')", []).unwrap();
    }
    let db = Db::open(&path).unwrap();
    assert_eq!(db.schema_version().unwrap(), 2);
    let cf = db.cache_file(7).unwrap();
    assert_eq!((cf.family_key.as_str(), cf.variant_name.as_str()), ("inter", ""));
    assert!(db.activation(7).unwrap().is_some(), "ativação preservada");
    assert_eq!(db.ref_count(7).unwrap(), 1);
    // A FK RESTRICT continua valendo depois da recriação da tabela.
    assert!(db.delete_cache_file(7).is_err(), "não pode apagar arquivo ativo");
}
