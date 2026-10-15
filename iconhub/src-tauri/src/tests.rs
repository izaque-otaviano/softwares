use std::path::{Path, PathBuf};
use std::sync::LazyLock;

use crate::icons::{self, Library, RenderOptions};
use crate::search::{self, Query};

static LIB: LazyLock<Library> = LazyLock::new(|| {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/icons");
    Library::load(&dir).expect("rode `npm run icons` antes dos testes")
});

fn query(text: &str, collection: &str, style: &str) -> Query {
    Query {
        text: text.into(),
        collections: if collection.is_empty() { vec![] } else { collection.split(',').map(String::from).collect() },
        style: style.into(),
        stroke: None,
        offset: 0,
        limit: 50,
    }
}

fn ids(page: &search::Page) -> Vec<String> {
    page.items.iter().map(|i| i.id.clone()).collect()
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("iconhub-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// ---------- Biblioteca ----------

#[test]
fn carrega_todas_as_colecoes() {
    assert_eq!(LIB.sets.len(), 33);
    let total: usize = LIB.sets.iter().map(|s| s.icons.len()).sum();
    assert!(total > 70_000, "só {total} ícones");
    for prefix in ["lucide", "material-symbols", "tabler", "ph"] {
        assert!(LIB.sets.iter().any(|s| s.prefix == prefix), "falta {prefix}");
    }
}

// ---------- Busca ----------

#[test]
fn busca_em_ingles_acha_o_nome_exato_primeiro() {
    let page = search::run(&LIB, &query("plane", "lucide", ""));
    assert_eq!(page.items[0].id, "lucide:plane");
}

#[test]
fn busca_em_portugues_traduz() {
    for (pt, en) in [("seta", "arrow"), ("carrinho", "cart"), ("avião", "plane"), ("Lixeira", "trash")] {
        let page = search::run(&LIB, &query(pt, "lucide", ""));
        assert!(page.total > 0, "“{pt}” não achou nada");
        assert!(page.items[0].name.contains(en), "“{pt}” trouxe {} primeiro", page.items[0].name);
    }
}

#[test]
fn busca_com_varias_palavras_exige_todas() {
    let page = search::run(&LIB, &query("arrow left", "lucide", ""));
    assert!(page.total > 0);
    for item in &page.items {
        assert!(item.name.contains("arrow") && item.name.contains("left"), "{}", item.name);
    }
}

#[test]
fn busca_sem_resultado() {
    let page = search::run(&LIB, &query("zzqqxxyy", "", ""));
    assert_eq!(page.total, 0);
    assert!(page.items.is_empty());
}

#[test]
fn busca_vazia_mistura_colecoes() {
    let page = search::run(&LIB, &query("", "", ""));
    let prefixes: std::collections::HashSet<_> =
        page.items.iter().map(|i| i.id.split(':').next().unwrap().to_string()).collect();
    assert!(prefixes.len() > 10, "a primeira página veio só de {prefixes:?}");
}

#[test]
fn paginacao_nao_repete_icones() {
    let mut q = query("arrow", "", "");
    let a = ids(&search::run(&LIB, &q));
    q.offset = 50;
    let b = ids(&search::run(&LIB, &q));
    assert_eq!(a.len(), 50);
    assert!(a.iter().all(|id| !b.contains(id)));
}

// ---------- Filtros ----------

#[test]
fn filtro_de_colecao() {
    let page = search::run(&LIB, &query("home", "tabler", ""));
    assert!(page.total > 0);
    assert!(page.items.iter().all(|i| i.id.starts_with("tabler:")));
}

#[test]
fn filtro_de_estilo() {
    for style in ["line", "fill", "color"] {
        let page = search::run(&LIB, &query("", "", style));
        assert!(page.total > 0, "nenhum ícone {style}");
        assert!(page.items.iter().all(|i| i.style == style));
    }
}

#[test]
fn estilos_das_colecoes_principais() {
    let style = |id: &str| LIB.find(id).unwrap_or_else(|| panic!("{id} não existe")).1.style.clone();
    assert_eq!(style("tabler:home"), "line");
    assert_eq!(style("tabler:home-filled"), "fill");
    assert_eq!(style("ph:house"), "line");
    assert_eq!(style("ph:house-fill"), "fill");
    assert_eq!(style("material-symbols:home-outline"), "line");
    assert_eq!(style("material-symbols:home"), "fill");
    assert_eq!(style("twemoji:red-heart"), "color");
    // Variantes duplicadas ficam de fora.
    assert!(LIB.find("material-symbols:home-rounded").is_none());
    assert!(LIB.find("ph:house-bold").is_none());
}

// ---------- Espessura ----------

#[test]
fn espessura_reescreve_o_traco() {
    let (_, icon) = LIB.find("lucide:plane").unwrap();
    assert!(icon.has_weight());
    let thin = icons::render(icon, &RenderOptions { color: None, stroke: Some(1.0), size: None });
    let thick = icons::render(icon, &RenderOptions { color: None, stroke: Some(3.0), size: None });
    assert!(thin.contains(r#"stroke-width="1""#), "{thin}");
    assert!(thick.contains(r#"stroke-width="3""#), "{thick}");
}

#[test]
fn espessura_respeita_o_tamanho_da_grade() {
    // Iconoir usa 24px; uma coleção de 16px precisa da metade... conferimos a proporção.
    let (_, icon) = LIB.find("lucide:plane").unwrap();
    let svg = icons::render(icon, &RenderOptions { color: None, stroke: Some(2.0), size: None });
    assert!(svg.contains(&format!(r#"stroke-width="{}""#, 2.0 * icon.w / 24.0)));
}

#[test]
fn espessura_no_phosphor_troca_a_variante() {
    let (_, icon) = LIB.find("ph:house").unwrap();
    assert!(icon.has_weight());
    let normal = icons::render(icon, &RenderOptions { color: None, stroke: None, size: None });
    let thin = icons::render(icon, &RenderOptions { color: None, stroke: Some(1.0), size: None });
    let bold = icons::render(icon, &RenderOptions { color: None, stroke: Some(3.0), size: None });
    assert_ne!(normal, thin);
    assert_ne!(normal, bold);
    assert_ne!(thin, bold);
    assert_eq!(normal, icons::render(icon, &RenderOptions { color: None, stroke: Some(2.0), size: None }));
}

#[test]
fn espessura_nao_mexe_em_preenchidos() {
    let (_, icon) = LIB.find("material-symbols:home").unwrap();
    assert!(!icon.has_weight());
    let a = icons::render(icon, &RenderOptions { color: None, stroke: None, size: None });
    let b = icons::render(icon, &RenderOptions { color: None, stroke: Some(3.0), size: None });
    assert_eq!(a, b);
}

#[test]
fn busca_aplica_a_espessura_nas_miniaturas() {
    let mut q = query("plane", "lucide", "");
    q.stroke = Some(1.0);
    let page = search::run(&LIB, &q);
    assert!(page.items[0].svg.contains(r#"stroke-width="1""#));
}

// ---------- Cor ----------

#[test]
fn cor_troca_current_color() {
    let svg = LIB.svg("lucide:plane", &RenderOptions { color: Some("#ff6140".into()), stroke: None, size: None }).unwrap();
    assert!(!svg.contains("currentColor"));
    assert!(svg.contains("#ff6140"));
}

#[test]
fn cor_nao_altera_icones_coloridos() {
    let opts = RenderOptions { color: Some("#ff6140".into()), stroke: None, size: None };
    let svg = LIB.svg("twemoji:red-heart", &opts).unwrap();
    assert!(!svg.contains("#ff6140"));
}

#[test]
fn svg_gerado_e_valido() {
    // Uma amostra de cada coleção precisa abrir num renderizador de verdade.
    for set in &LIB.sets {
        for icon in set.icons.iter().take(5) {
            let svg = icons::render(icon, &RenderOptions { color: Some("#000000".into()), stroke: Some(1.5), size: None });
            assert!(
                icons::rasterize(&svg, 32).is_ok(),
                "{}:{} gera SVG inválido",
                set.prefix,
                icon.name
            );
        }
    }
}

// ---------- PNG ----------

#[test]
fn png_tem_o_tamanho_pedido_e_nao_e_vazio() {
    let svg = LIB.svg("lucide:plane", &RenderOptions { color: Some("#000000".into()), stroke: None, size: None }).unwrap();
    for size in [64, 512, 2048] {
        let pixmap = icons::rasterize(&svg, size).unwrap();
        assert_eq!(pixmap.width().max(pixmap.height()), size);
        assert!(pixmap.pixels().iter().any(|p| p.alpha() > 0), "PNG de {size}px saiu vazio");
        let png = pixmap.encode_png().unwrap();
        assert_eq!(&png[1..4], b"PNG");
    }
}

#[test]
fn png_mantem_a_proporcao() {
    // Ícone retangular não pode ser esticado.
    let (set, icon) = LIB
        .sets
        .iter()
        .flat_map(|s| s.icons.iter().map(move |i| (s, i)))
        .find(|(_, i)| (i.w - i.h).abs() > 1.0)
        .expect("nenhum ícone retangular");
    let svg = icons::render(icon, &RenderOptions::default());
    let p = icons::rasterize(&svg, 512).unwrap();
    let expected = icon.w / icon.h;
    let got = p.width() as f32 / p.height() as f32;
    assert!((expected - got).abs() < 0.02, "{}:{} {expected} vs {got}", set.prefix, icon.name);
}

#[test]
fn png_usa_a_cor_escolhida() {
    let svg = LIB.svg("material-symbols:home", &RenderOptions { color: Some("#ff0000".into()), stroke: None, size: None }).unwrap();
    let p = icons::rasterize(&svg, 128).unwrap();
    let px = p.pixels().iter().find(|p| p.alpha() == 255).expect("sem pixel sólido").demultiply();
    assert_eq!((px.red(), px.green(), px.blue()), (255, 0, 0));
}

// ---------- Importar SVG ----------

const ILLUSTRATOR_SVG: &str = r##"<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: Adobe Illustrator 28.0 -->
<svg version="1.1" id="Camada_1" xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="48px" height="48px" viewBox="0 0 48 48">
  <style>.st0{fill:#1A1A1A;}</style>
  <metadata>lixo</metadata>
  <path class="st0" d="M4 4h40v40H4z"/>
  <circle fill="#1A1A1A" cx="24" cy="24" r="8"/>
</svg>"##;

const MULTICOLOR_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="#ff0000"/><circle cx="12" cy="12" r="6" fill="#0000ff"/>
</svg>"##;

const LINE_SVG: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
  <path d="M4 12h16" stroke="#000" stroke-width="2"/>
</svg>"##;

fn import(dir: &Path, name: &str, content: &str) -> Result<(), String> {
    let src = dir.join("src");
    std::fs::create_dir_all(&src).unwrap();
    let file = src.join(name);
    std::fs::write(&file, content).unwrap();
    icons::import_svg(&file, &dir.join("custom")).map(|_| ())
}

fn custom_library(dir: &Path) -> Library {
    let mut lib = Library { sets: vec![] };
    lib.reload_custom(&dir.join("custom"));
    lib
}

#[test]
fn importa_svg_do_illustrator_com_uma_cor() {
    let dir = temp_dir("illustrator");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    import(&dir, "Meu Ícone Legal.svg", ILLUSTRATOR_SVG).unwrap();

    let saved = std::fs::read_to_string(dir.join("custom/meu-ícone-legal.svg")).unwrap();
    assert!(!saved.contains("metadata") && !saved.contains("Illustrator"), "não limpou: {saved}");
    assert!(saved.contains("currentColor"), "uma cor só deveria virar currentColor: {saved}");

    let lib = custom_library(&dir);
    let (_, icon) = lib.find("custom:meu-ícone-legal").expect("não apareceu em Meus ícones");
    assert_eq!(icon.style, "fill");
    assert_eq!((icon.w, icon.h), (48.0, 48.0));

    // Troca de cor funciona no importado.
    let svg = lib.svg("custom:meu-ícone-legal", &RenderOptions { color: Some("#ff6140".into()), stroke: None, size: None }).unwrap();
    assert!(svg.contains("#ff6140"));
    assert!(icons::rasterize(&svg, 64).is_ok());
}

#[test]
fn importa_svg_colorido_sem_perder_as_cores() {
    let dir = temp_dir("color");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    import(&dir, "bandeira.svg", MULTICOLOR_SVG).unwrap();
    let lib = custom_library(&dir);
    let (_, icon) = lib.find("custom:bandeira").unwrap();
    assert_eq!(icon.style, "color");
    assert!(icon.body.contains("#ff0000") && icon.body.contains("#0000ff"));
}

#[test]
fn importa_svg_de_linha_com_espessura_editavel() {
    let dir = temp_dir("line");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    import(&dir, "linha.svg", LINE_SVG).unwrap();
    let lib = custom_library(&dir);
    let (_, icon) = lib.find("custom:linha").unwrap();
    assert_eq!(icon.style, "line");
    assert!(icon.has_weight());
}

#[test]
fn importar_nome_repetido_nao_sobrescreve() {
    let dir = temp_dir("dup");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    import(&dir, "icone.svg", LINE_SVG).unwrap();
    import(&dir, "icone.svg", MULTICOLOR_SVG).unwrap();
    let lib = custom_library(&dir);
    assert!(lib.find("custom:icone").is_some());
    assert!(lib.find("custom:icone-2").is_some());
}

#[test]
fn importar_arquivo_invalido_falha_sem_criar_nada() {
    let dir = temp_dir("invalid");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    assert!(import(&dir, "quebrado.svg", "isto não é svg").is_err());
    assert_eq!(std::fs::read_dir(dir.join("custom")).unwrap().count(), 0);
}

#[test]
fn meus_icones_aparece_na_busca_e_primeiro_na_lista() {
    let dir = temp_dir("search");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    import(&dir, "logo-cliente.svg", ILLUSTRATOR_SVG).unwrap();
    let lib = custom_library(&dir);
    assert_eq!(lib.sets[0].prefix, "custom");
    let page = search::run(&lib, &query("cliente", "custom", ""));
    assert_eq!(ids(&page), vec!["custom:logo-cliente"]);
}

#[test]
fn svg_sai_no_tamanho_escolhido() {
    let opts = |size| RenderOptions { color: None, stroke: None, size };
    let svg = LIB.svg("lucide:plane", &opts(Some(128))).unwrap();
    assert!(svg.contains(r#"width="128" height="128" viewBox="0 0 24 24""#), "{svg}");
    let original = LIB.svg("lucide:plane", &opts(None)).unwrap();
    assert!(original.contains(r#"width="24" height="24""#));
}

// ---------- Favoritos e pastas ----------

use crate::folders::{self, Entry, Formats, Store, FAVORITES};

fn entry(icon: &str, color: &str) -> Entry {
    Entry { icon: icon.into(), color: color.into(), stroke: Some(1.5), size: 48 }
}

fn store(name: &str) -> (PathBuf, Store) {
    let dir = temp_dir(name);
    let path = dir.join("folders.json");
    (dir, Store::load(path))
}

#[test]
fn favoritos_existe_desde_o_inicio() {
    let (_, s) = store("fav-inicio");
    assert_eq!(s.folders[0].id, FAVORITES);
    assert_eq!(s.folders[0].name, "Favoritos");
}

#[test]
fn estrela_liga_e_desliga() {
    let (_, mut s) = store("fav-toggle");
    assert!(s.toggle_favorite(entry("lucide:plane", "#000000")).unwrap());
    assert_eq!(s.folder(FAVORITES).unwrap().items.len(), 1);
    assert!(!s.toggle_favorite(entry("lucide:plane", "#ff0000")).unwrap());
    assert!(s.folder(FAVORITES).unwrap().items.is_empty());
}

#[test]
fn pastas_sobrevivem_a_reabrir_o_app() {
    let (dir, mut s) = store("persist");
    let id = s.create("Site Farmácia").unwrap();
    s.add(&id, entry("lucide:plane", "#ff6140")).unwrap();
    s.toggle_favorite(entry("tabler:home", "#000000")).unwrap();

    let s2 = Store::load(dir.join("folders.json"));
    let f = s2.folder(&id).unwrap();
    assert_eq!(f.name, "Site Farmácia");
    assert_eq!(f.items, vec![entry("lucide:plane", "#ff6140")]);
    assert_eq!(s2.folder(FAVORITES).unwrap().items.len(), 1);
}

#[test]
fn mesmo_icone_com_ajustes_diferentes_entra_duas_vezes() {
    let (_, mut s) = store("ajustes");
    let id = s.create("Projeto").unwrap();
    s.add(&id, entry("lucide:plane", "#000000")).unwrap();
    s.add(&id, entry("lucide:plane", "#000000")).unwrap(); // idêntico: ignora
    s.add(&id, entry("lucide:plane", "#ff6140")).unwrap();
    assert_eq!(s.folder(&id).unwrap().items.len(), 2);
}

#[test]
fn nome_de_pasta_validado() {
    let (_, mut s) = store("nomes");
    assert!(s.create("   ").is_err());
    s.create("Cliente X").unwrap();
    assert!(s.create("cliente x").is_err(), "nome repetido deveria falhar");
    assert!(s.rename(FAVORITES, "Outro").is_err());
    assert!(s.delete(FAVORITES).is_err());
}

#[test]
fn renomear_e_apagar_pasta() {
    let (_, mut s) = store("rename");
    let id = s.create("Antigo").unwrap();
    s.rename(&id, "Novo").unwrap();
    assert_eq!(s.folder(&id).unwrap().name, "Novo");
    s.delete(&id).unwrap();
    assert!(s.folder(&id).is_err());
}

#[test]
fn remover_item_e_esquecer_icone_apagado() {
    let (_, mut s) = store("remove");
    let id = s.create("P").unwrap();
    s.add(&id, entry("custom:logo", "#000000")).unwrap();
    s.add(&id, entry("lucide:plane", "#000000")).unwrap();
    s.toggle_favorite(entry("custom:logo", "#000000")).unwrap();
    s.remove(&id, &entry("lucide:plane", "#000000")).unwrap();
    assert_eq!(s.folder(&id).unwrap().items.len(), 1);
    s.forget_icon("custom:logo").unwrap();
    assert!(s.folder(&id).unwrap().items.is_empty());
    assert!(s.folder(FAVORITES).unwrap().items.is_empty());
}

fn sample_folder() -> folders::Folder {
    folders::Folder {
        id: "p".into(),
        name: "Meu Projeto".into(),
        items: vec![
            entry("lucide:plane", "#000000"),
            entry("lucide:plane", "#ff6140"),
            Entry { icon: "material-symbols:home".into(), color: "#387b69".into(), stroke: None, size: 128 },
        ],
        updated_at: 0,
        deleted: false,
    }
}

#[test]
fn exporta_svg_com_os_ajustes_salvos() {
    let files = folders::files(&LIB, &sample_folder(), Formats::Svg).unwrap();
    let names: Vec<_> = files.iter().map(|(n, _)| n.as_str()).collect();
    assert_eq!(names, vec!["plane-000000.svg", "plane-ff6140.svg", "home.svg"]);
    let orange = String::from_utf8(files[1].1.clone()).unwrap();
    assert!(orange.contains("#ff6140") && orange.contains(r#"width="48""#) && orange.contains(r#"stroke-width="1.5""#));
    let home = String::from_utf8(files[2].1.clone()).unwrap();
    assert!(home.contains("#387b69") && home.contains(r#"width="128""#));
}

#[test]
fn exporta_png_no_tamanho_salvo() {
    let files = folders::files(&LIB, &sample_folder(), Formats::Png).unwrap();
    let (name, png) = &files[2];
    assert_eq!(name, "home.png");
    // Largura fica nos bytes 16..20 do cabeçalho PNG.
    assert_eq!(u32::from_be_bytes(png[16..20].try_into().unwrap()), 128);
}

#[test]
fn exporta_os_dois_formatos_em_subpastas() {
    let files = folders::files(&LIB, &sample_folder(), Formats::Both).unwrap();
    assert_eq!(files.len(), 6);
    assert!(files.iter().any(|(n, _)| n == "svg/home.svg"));
    assert!(files.iter().any(|(n, _)| n == "png/home.png"));
}

#[test]
fn exportar_pasta_vazia_avisa() {
    let empty = folders::Folder { id: "v".into(), name: "Vazia".into(), items: vec![], updated_at: 0, deleted: false };
    assert!(folders::files(&LIB, &empty, Formats::Svg).is_err());
}

#[test]
fn zip_contem_todos_os_arquivos() {
    let dir = temp_dir("zip");
    let files = folders::files(&LIB, &sample_folder(), Formats::Both).unwrap();
    let path = dir.join("projeto.zip");
    folders::write_zip(&path, &files).unwrap();
    let mut archive = zip::ZipArchive::new(std::fs::File::open(&path).unwrap()).unwrap();
    assert_eq!(archive.len(), 6);
    let mut f = archive.by_name("svg/plane-ff6140.svg").unwrap();
    let mut s = String::new();
    std::io::Read::read_to_string(&mut f, &mut s).unwrap();
    assert!(s.contains("#ff6140"));
}

#[test]
fn exportar_como_pasta_nao_sobrescreve() {
    let dir = temp_dir("dir");
    let files = folders::files(&LIB, &sample_folder(), Formats::Svg).unwrap();
    let a = folders::write_dir(&dir, "Meu Projeto", &files).unwrap();
    let b = folders::write_dir(&dir, "Meu Projeto", &files).unwrap();
    assert_eq!(a.file_name().unwrap(), "meu-projeto");
    assert_eq!(b.file_name().unwrap(), "meu-projeto-2");
    assert!(a.join("home.svg").exists());
}

#[test]
fn importar_devolve_o_nome_salvo() {
    let dir = temp_dir("nome");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    let src = dir.join("Logo Cliente.svg");
    std::fs::write(&src, LINE_SVG).unwrap();
    assert_eq!(icons::import_svg(&src, &dir.join("custom")).unwrap(), "logo-cliente");
    assert_eq!(icons::import_svg(&src, &dir.join("custom")).unwrap(), "logo-cliente-2");
}

#[test]
fn adicionar_varios_de_uma_vez_mantem_a_ordem_e_ignora_repetidos() {
    let (_, mut s) = store("many");
    let id = s.create("Importados").unwrap();
    s.add(&id, entry("custom:b", "#000000")).unwrap();
    s.add_many(&id, vec![entry("custom:a", "#000000"), entry("custom:b", "#000000"), entry("custom:c", "#000000")])
        .unwrap();
    let icons: Vec<_> = s.folder(&id).unwrap().items.iter().map(|e| e.icon.as_str()).collect();
    assert_eq!(icons, vec!["custom:a", "custom:c", "custom:b"]);
}

// ---------- Sincronização (regra, sem rede) ----------

use crate::sync::{self, LocalIcon, RemoteFolder, RemoteIcon};

fn folder_at(id: &str, name: &str, at: i64) -> folders::Folder {
    folders::Folder { id: id.into(), name: name.into(), items: vec![], updated_at: at, deleted: false }
}

fn remote_folder(id: &str, name: &str, at: i64, deleted: bool) -> RemoteFolder {
    let iso = chrono::DateTime::from_timestamp_millis(at).unwrap().to_rfc3339();
    RemoteFolder { id: id.into(), name: name.into(), items: vec![], deleted, updated_at: iso }
}

const T: i64 = 1_790_000_000_000;

#[test]
fn sync_envia_o_que_so_existe_aqui_e_traz_o_que_so_existe_la() {
    let local = vec![folder_at("aqui", "Aqui", T)];
    let remote = vec![remote_folder("la", "Lá", T, false)];
    let (push, apply) = sync::plan_folders(&local, remote);
    assert_eq!(push.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), vec!["aqui"]);
    assert_eq!(apply.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), vec!["la"]);
}

#[test]
fn sync_fica_com_a_versao_mais_nova() {
    let local = vec![folder_at("a", "Nome novo", T + 5000), folder_at("b", "Antigo", T)];
    let remote = vec![remote_folder("a", "Nome velho", T, false), remote_folder("b", "Mais novo", T + 9000, false)];
    let (push, apply) = sync::plan_folders(&local, remote);
    assert_eq!(push.len(), 1);
    assert_eq!(push[0].name, "Nome novo");
    assert_eq!(apply.len(), 1);
    assert_eq!(apply[0].name, "Mais novo");
    assert_eq!(apply[0].updated_at, T + 9000);
}

#[test]
fn sync_igual_nao_faz_nada() {
    let local = vec![folder_at("a", "A", T)];
    let (push, apply) = sync::plan_folders(&local, vec![remote_folder("a", "A", T, false)]);
    assert!(push.is_empty() && apply.is_empty());
}

#[test]
fn sync_apagamento_chega_ao_outro_computador() {
    let (_, mut s) = store("sync-delete");
    let id = s.create("Projeto").unwrap();
    let created = s.folder(&id).unwrap().updated_at;
    // Na nuvem, a pasta foi apagada depois.
    let remote = vec![remote_folder(&id, "Projeto", created + 1000, true)];
    let (_, apply) = sync::plan_folders(&s.folders, remote);
    s.apply_remote(apply).unwrap();
    assert!(s.folder(&id).is_err(), "pasta apagada na nuvem deveria sumir daqui");
    assert!(s.visible().all(|f| f.id != id));
}

#[test]
fn apagar_pasta_vira_lapide_para_sincronizar() {
    let (_, mut s) = store("tombstone");
    let id = s.create("Some").unwrap();
    s.delete(&id).unwrap();
    let f = s.folders.iter().find(|f| f.id == id).unwrap();
    assert!(f.deleted && f.updated_at > 0);
    // Recriar com o mesmo nome não reaproveita a lápide.
    let id2 = s.create("Some").unwrap();
    assert_ne!(id, id2);
}

#[test]
fn mudancas_atualizam_a_data_da_pasta() {
    let (_, mut s) = store("touch");
    let id = s.create("P").unwrap();
    s.folders.iter_mut().find(|f| f.id == id).unwrap().updated_at = 1;
    s.add(&id, entry("lucide:plane", "#000000")).unwrap();
    assert!(s.folder(&id).unwrap().updated_at > 1);
}

#[test]
fn sync_de_icones_importados_ida_e_volta() {
    let dir = temp_dir("sync-icons");
    std::fs::create_dir_all(dir.join("custom")).unwrap();
    let custom = dir.join("custom");
    import(&dir, "aqui.svg", LINE_SVG).unwrap();

    let local = sync::local_icons(&custom);
    assert_eq!(local.len(), 1);
    let remote = vec![RemoteIcon { name: "la".into(), svg: LINE_SVG.into(), deleted: false, updated_at: "2026-10-14T12:00:00.000Z".into() }];
    let (push, apply) = sync::plan_icons(&local, remote);
    assert_eq!(push[0].name, "aqui");
    sync::apply_icons(&custom, &apply).unwrap();
    assert!(custom.join("la.svg").exists());
    assert!(custom_library(&dir).find("custom:la").is_some());
}

#[test]
fn sync_apaga_icone_importado_apagado_em_outro_computador() {
    let dir = temp_dir("sync-icons-del");
    let custom = dir.join("custom");
    std::fs::create_dir_all(&custom).unwrap();
    import(&dir, "logo.svg", LINE_SVG).unwrap();
    let local = sync::local_icons(&custom);
    let later = chrono::DateTime::from_timestamp_millis(local[0].updated_at + 1000).unwrap().to_rfc3339();
    let remote = vec![RemoteIcon { name: "logo".into(), svg: String::new(), deleted: true, updated_at: later }];
    let (_, apply) = sync::plan_icons(&local, remote);
    sync::apply_icons(&custom, &apply).unwrap();
    assert!(!custom.join("logo.svg").exists());
    // E o apagamento fica registrado para não voltar na próxima sincronização.
    let again = sync::local_icons(&custom);
    assert_eq!(again, vec![LocalIcon { name: "logo".into(), svg: None, updated_at: apply[0].updated_at }]);
}

#[test]
fn sync_nao_aceita_nome_que_sai_da_pasta() {
    let dir = temp_dir("sync-path");
    std::fs::create_dir_all(&dir).unwrap();
    let evil = LocalIcon { name: "../fora".into(), svg: Some(LINE_SVG.into()), updated_at: T };
    sync::apply_icons(&dir, &[evil]).unwrap();
    assert!(!dir.parent().unwrap().join("fora.svg").exists());
}

#[test]
fn linhas_enviadas_tem_o_formato_do_banco() {
    let rows = sync::folder_rows("u1", &[folder_at("a", "A", T)]);
    let row = &rows[0];
    for key in ["user_id", "id", "name", "items", "deleted", "updated_at"] {
        assert!(row.get(key).is_some(), "falta {key}");
    }
    assert_eq!(row["updated_at"], "2026-09-21T14:13:20.000Z");
}

// ---------- Perfis ----------

use crate::profile;

#[test]
fn resumo_do_perfil_local() {
    let dir = temp_dir("summary");
    assert!(profile::summary(&dir).is_empty());
    let mut s = Store::load(profile::folders_path(&dir));
    s.create("Cliente").unwrap();
    s.toggle_favorite(entry("lucide:plane", "#000000")).unwrap();
    std::fs::create_dir_all(profile::custom_dir(&dir)).unwrap();
    icons::import_svg(&write_src(&dir, "logo.svg", LINE_SVG), &profile::custom_dir(&dir)).unwrap();
    assert_eq!(profile::summary(&dir), profile::Summary { folders: 1, favorites: 1, icons: 1 });
}

fn write_src(dir: &Path, name: &str, content: &str) -> PathBuf {
    let src = dir.join("src-files");
    std::fs::create_dir_all(&src).unwrap();
    let f = src.join(name);
    std::fs::write(&f, content).unwrap();
    f
}

#[test]
fn levar_perfil_local_para_a_conta_une_sem_apagar() {
    let base = temp_dir("merge");
    let local = profile::local_dir(&base);
    let account = profile::account_dir(&base, "user-1");
    std::fs::create_dir_all(profile::custom_dir(&local)).unwrap();
    std::fs::create_dir_all(profile::custom_dir(&account)).unwrap();

    // Local: pasta "Cliente" com um importado, favorito, pasta "Só local".
    icons::import_svg(&write_src(&base, "logo.svg", LINE_SVG), &profile::custom_dir(&local)).unwrap();
    let mut l = Store::load(profile::folders_path(&local));
    let cliente = l.create("Cliente").unwrap();
    l.add(&cliente, entry("custom:logo", "#000000")).unwrap();
    l.create("Só local").unwrap();
    l.toggle_favorite(entry("lucide:plane", "#000000")).unwrap();

    // Conta (veio da nuvem): já tem "cliente" e um "logo" DIFERENTE.
    icons::import_svg(&write_src(&base, "logo.svg", MULTICOLOR_SVG), &profile::custom_dir(&account)).unwrap();
    let mut a = Store::load(profile::folders_path(&account));
    let a_cliente = a.create("cliente").unwrap();
    a.add(&a_cliente, entry("tabler:home", "#000000")).unwrap();
    a.toggle_favorite(entry("lucide:plane", "#ff0000")).unwrap();

    let done = profile::merge(&local, &mut a, &profile::custom_dir(&account)).unwrap();
    assert_eq!(done, profile::Summary { folders: 2, favorites: 0, icons: 1 });

    // Pastas com o mesmo nome foram unidas; o logo local entrou com nome novo.
    let f = a.folder(&a_cliente).unwrap();
    let icons: Vec<_> = f.items.iter().map(|e| e.icon.as_str()).collect();
    assert_eq!(icons, vec!["custom:logo-2", "tabler:home"]);
    assert!(a.visible().any(|f| f.name == "Só local"));
    // O favorito já existia na conta: não duplica nem troca a cor.
    let fav = &a.folder(FAVORITES).unwrap().items;
    assert_eq!(fav.len(), 1);
    assert_eq!(fav[0].color, "#ff0000");
    // Os dois logos existem.
    assert!(profile::custom_dir(&account).join("logo.svg").exists());
    assert!(profile::custom_dir(&account).join("logo-2.svg").exists());
    // O perfil local continua intacto.
    assert_eq!(profile::summary(&local), profile::Summary { folders: 2, favorites: 1, icons: 1 });
}

#[test]
fn levar_de_novo_nao_duplica() {
    let base = temp_dir("merge-twice");
    let local = profile::local_dir(&base);
    let account = profile::account_dir(&base, "u");
    std::fs::create_dir_all(profile::custom_dir(&local)).unwrap();
    icons::import_svg(&write_src(&base, "logo.svg", LINE_SVG), &profile::custom_dir(&local)).unwrap();
    let mut l = Store::load(profile::folders_path(&local));
    let p = l.create("P").unwrap();
    l.add(&p, entry("custom:logo", "#000000")).unwrap();

    let mut a = Store::load(profile::folders_path(&account));
    profile::merge(&local, &mut a, &profile::custom_dir(&account)).unwrap();
    let second = profile::merge(&local, &mut a, &profile::custom_dir(&account)).unwrap();
    assert_eq!(second.icons, 0);
    assert_eq!(a.visible().filter(|f| f.name == "P").count(), 1);
    assert_eq!(a.visible().find(|f| f.name == "P").unwrap().items.len(), 1);
}

#[test]
fn filtro_com_varias_colecoes() {
    let mut q = query("home", "lucide,fluent", "");
    q.limit = 10_000;
    let page = search::run(&LIB, &q);
    assert!(page.total > 0);
    let sets: std::collections::HashSet<_> = page.items.iter().map(|i| i.id.split(':').next().unwrap().to_string()).collect();
    assert_eq!(sets, ["lucide", "fluent"].iter().map(|s| s.to_string()).collect());
}

// ---------- Seleção em lote ----------

#[test]
fn lote_remover_mudar_e_mover() {
    let (_, mut s) = store("lote");
    let a = s.create("A").unwrap();
    let b = s.create("B").unwrap();
    let e1 = entry("lucide:plane", "#000000");
    let e2 = entry("tabler:home", "#000000");
    let e3 = entry("lucide:star", "#000000");
    s.add_many(&a, vec![e1.clone(), e2.clone(), e3.clone()]).unwrap();

    // Mudar cor e tamanho de dois, mantendo a posição; espessura volta ao padrão.
    let change: folders::EntryChange =
        serde_json::from_str(r##"{"color":"#ff6140","size":256,"stroke":null}"##).unwrap();
    s.update_many(&a, &[e1.clone(), e3.clone()], &change).unwrap();
    let items = &s.folder(&a).unwrap().items;
    assert_eq!(items[0].color, "#ff6140");
    assert_eq!(items[0].size, 256);
    assert_eq!(items[0].stroke, None);
    assert_eq!(items[1], e2, "o não selecionado não muda");

    // Sem "stroke" no JSON: espessura fica como estava.
    let keep: folders::EntryChange = serde_json::from_str(r##"{"color":"#000000"}"##).unwrap();
    assert!(keep.stroke.is_none());

    // Mover um para B; copiar outro.
    let moved = s.folder(&a).unwrap().items[1].clone();
    s.transfer(&a, &b, &[moved.clone()], true).unwrap();
    assert!(!s.folder(&a).unwrap().items.contains(&moved));
    assert!(s.folder(&b).unwrap().items.contains(&moved));
    let copied = s.folder(&a).unwrap().items[0].clone();
    s.transfer(&a, &b, &[copied.clone()], false).unwrap();
    assert!(s.folder(&a).unwrap().items.contains(&copied));
    assert!(s.folder(&b).unwrap().items.contains(&copied));
    assert!(s.transfer(&a, &a, &[copied], true).is_err());

    // Remover vários.
    let all = s.folder(&a).unwrap().items.clone();
    s.remove_many(&a, &all).unwrap();
    assert!(s.folder(&a).unwrap().items.is_empty());
}

#[test]
fn lote_mudar_cor_une_itens_que_ficam_iguais() {
    let (_, mut s) = store("lote-une");
    let a = s.create("A").unwrap();
    let black = entry("lucide:plane", "#000000");
    let red = entry("lucide:plane", "#ff0000");
    s.add_many(&a, vec![black.clone(), red.clone()]).unwrap();
    let change: folders::EntryChange = serde_json::from_str(r##"{"color":"#ff0000"}"##).unwrap();
    s.update_many(&a, &[black], &change).unwrap();
    assert_eq!(s.folder(&a).unwrap().items, vec![red]);
}
