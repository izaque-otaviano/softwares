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


#[tokio::test]
#[ignore = "requer rede (www.fontsquirrel.com)"]
async fn font_squirrel_real_catalogo_detalhes_e_pacote_com_md5() {
    use fm_core::providers::{fontsquirrel::FontSquirrel, ProviderConfig};
    let http = Http::new().unwrap();
    let fsq = FontSquirrel::default();
    let cat = fsq.fetch_catalog(&http, &ProviderConfig::default()).await.unwrap();
    assert!(cat.len() > 900, "catálogo real deveria ter mais de 900 famílias, veio {}", cat.len());
    let fam = FamilyRef { name: "Six Caps".into(), provider_family_id: "six-caps".into(), variants: vec![], variable: false };
    let d = fsq.fetch_details(&http, &fam).await.unwrap().unwrap();
    let pkg = fsq.fetch_package(&http, &fam).await.unwrap().unwrap();
    let f = pkg.files.iter().find(|f| f.file_name == "SixCaps.ttf").unwrap();
    let md5 = hex::encode(<md5::Md5 as md5::Digest>::digest(&f.bytes));
    assert_eq!(Some(&md5), d.checksums.get("SixCaps.ttf"), "MD5 publicado confere com o download");
    let lic = pkg.license.unwrap();
    assert_eq!(fm_core::archive::license_id_from_file_name(&lic.file_name), "OFL-1.1");
    println!("Font Squirrel: {} famílias; Six Caps md5 {md5}; licença {}", cat.len(), lic.file_name);
}
