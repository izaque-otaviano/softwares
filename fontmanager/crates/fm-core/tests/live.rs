//! Testes AO VIVO contra o Google Fonts (CSS2 API pública, sem chave). Ignorados por padrão:
//! `cargo test -p fm-core --test live -- --ignored`

use fm_core::cache::FontCache;
use fm_core::db::Db;
use fm_core::http::Http;
use fm_core::model::*;
use fm_core::providers::{google::GoogleFonts, FamilyRef, FontProvider};

#[tokio::test]
#[ignore = "requer rede (fonts.googleapis.com / fonts.gstatic.com)"]
async fn google_css2_devolve_ttf_valido_e_instalavel() {
    let http = Http::new().unwrap();
    let fam = FamilyRef {
        name: "Tiny5".into(),
        provider_family_id: "Tiny5".into(),
        variants: vec![VariantView { weight: 400, style: Style::Normal }],
        variable: false,
    };
    let files = GoogleFonts.resolve_files(&http, &fam).await.unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].format, FileFormat::Ttf);
    assert!(files[0].url.starts_with("https://fonts.gstatic.com/"));

    let tmp = tempfile::tempdir().unwrap();
    let db = Db::open_in_memory().unwrap();
    let cache = FontCache::new(tmp.path().to_path_buf(), http, db).unwrap();
    let cf = cache.ensure("google", "tiny5", "Tiny5", Some("OFL-1.1"), &files[0]).await.unwrap();
    assert_eq!(cf.internal_family.as_deref(), Some("Tiny5"));
    println!("baixado {} bytes, sha256 {}", cf.size, cf.sha256);
}

