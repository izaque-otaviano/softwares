use serde::{Deserialize, Serialize};

use crate::icons::{render, Library, RenderOptions};

#[derive(Deserialize)]
pub struct Query {
    #[serde(default)]
    pub text: String,
    /// Prefixos das coleções marcadas (ex.: ["lucide", "fluent"]). Vazio = todas.
    #[serde(default)]
    pub collections: Vec<String>,
    /// "line", "fill", "color" ou vazio = todos.
    #[serde(default)]
    pub style: String,
    pub stroke: Option<f32>,
    #[serde(default)]
    pub offset: usize,
    pub limit: usize,
}

#[derive(Serialize)]
pub struct Item {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) collection: String,
    pub(crate) license: String,
    pub(crate) style: String,
    pub(crate) weight: bool,
    pub(crate) svg: String,
}

#[derive(Serialize)]
pub struct Page {
    pub(crate) total: usize,
    pub(crate) items: Vec<Item>,
}

/// Termos comuns em português → nomes usados pelas coleções (em inglês).
const PT: &[(&str, &str)] = &[
    ("seta", "arrow"), ("casa", "home"), ("casa", "house"), ("home", "house"), ("house", "home"), ("inicio", "home"), ("busca", "search"), ("buscar", "search"),
    ("lupa", "search"), ("pesquisa", "search"), ("usuario", "user"), ("pessoa", "user"), ("pessoas", "users"),
    ("carrinho", "cart"), ("sacola", "bag"), ("compra", "shopping"), ("loja", "store"), ("dinheiro", "money"),
    ("cartao", "card"), ("pagamento", "payment"), ("moeda", "coin"), ("carteira", "wallet"), ("presente", "gift"),
    ("coracao", "heart"), ("estrela", "star"), ("favorito", "star"), ("lixo", "trash"), ("lixeira", "trash"),
    ("apagar", "delete"), ("editar", "edit"), ("lapis", "pencil"), ("caneta", "pen"), ("adicionar", "plus"),
    ("mais", "plus"), ("menos", "minus"), ("fechar", "x"), ("check", "check"), ("certo", "check"),
    ("configuracao", "settings"), ("configuracoes", "settings"), ("engrenagem", "gear"), ("ajustes", "settings"),
    ("calendario", "calendar"), ("data", "calendar"), ("relogio", "clock"), ("hora", "clock"), ("tempo", "time"),
    ("email", "mail"), ("carta", "mail"), ("mensagem", "message"), ("conversa", "chat"), ("telefone", "phone"),
    ("celular", "phone"), ("camera", "camera"), ("foto", "photo"), ("imagem", "image"), ("video", "video"),
    ("musica", "music"), ("som", "volume"), ("microfone", "mic"), ("arquivo", "file"), ("documento", "file"),
    ("pasta", "folder"), ("nuvem", "cloud"), ("baixar", "download"), ("enviar", "send"), ("upload", "upload"),
    ("compartilhar", "share"), ("link", "link"), ("cadeado", "lock"), ("senha", "lock"), ("chave", "key"),
    ("escudo", "shield"), ("seguranca", "shield"), ("olho", "eye"), ("ver", "eye"), ("sino", "bell"),
    ("notificacao", "bell"), ("mapa", "map"), ("local", "pin"), ("localizacao", "location"), ("globo", "globe"),
    ("mundo", "world"), ("aviao", "plane"), ("carro", "car"), ("onibus", "bus"), ("caminhao", "truck"),
    ("entrega", "truck"), ("bicicleta", "bike"), ("trem", "train"), ("navio", "ship"), ("predio", "building"),
    ("empresa", "building"), ("fabrica", "factory"), ("grafico", "chart"), ("dados", "data"), ("tabela", "table"),
    ("lista", "list"), ("filtro", "filter"), ("ordenar", "sort"), ("menu", "menu"), ("grade", "grid"),
    ("livro", "book"), ("escola", "school"), ("trabalho", "briefcase"), ("ferramenta", "tool"),
    ("comida", "food"), ("cafe", "coffee"), ("bebida", "drink"), ("sol", "sun"), ("lua", "moon"),
    ("chuva", "rain"), ("fogo", "fire"), ("agua", "water"), ("folha", "leaf"), ("arvore", "tree"),
    ("flor", "flower"), ("cachorro", "dog"), ("gato", "cat"), ("animal", "paw"), ("saude", "health"),
    ("remedio", "pill"), ("farmacia", "pharmacy"), ("hospital", "hospital"), ("medico", "stethoscope"),
    ("computador", "computer"), ("notebook", "laptop"), ("tela", "monitor"), ("impressora", "printer"),
    ("bateria", "battery"), ("energia", "power"), ("raio", "bolt"), ("codigo", "code"), ("terminal", "terminal"),
    ("bandeira", "flag"), ("etiqueta", "tag"), ("cupom", "ticket"), ("ingresso", "ticket"), ("trofeu", "trophy"),
    ("ajuda", "help"), ("informacao", "info"), ("alerta", "alert"), ("aviso", "warning"), ("erro", "error"),
    ("sair", "logout"), ("entrar", "login"), ("atualizar", "refresh"), ("copiar", "copy"), ("colar", "paste"),
    ("salvar", "save"), ("imprimir", "print"), ("pausa", "pause"), ("tocar", "play"), ("parar", "stop"),
    ("cima", "up"), ("baixo", "down"), ("esquerda", "left"), ("direita", "right"), ("circulo", "circle"),
    ("quadrado", "square"), ("triangulo", "triangle"), ("bolsa", "bag"), ("roupa", "shirt"), ("camisa", "shirt"),
    ("sapato", "shoe"), ("casal", "couple"), ("bebe", "baby"), ("mao", "hand"), ("joinha", "thumbs-up"),
];

fn strip_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            c => c,
        })
        .collect()
}

/// Cada termo vira uma lista de alternativas (o termo + a tradução, se houver).
fn terms(text: &str) -> Vec<Vec<String>> {
    strip_accents(&text.to_lowercase())
        .split(|c: char| c.is_whitespace() || c == '-' || c == '_')
        .filter(|t| !t.is_empty())
        .map(|t| {
            let mut alts = vec![t.to_string()];
            let singular = t.strip_suffix('s').unwrap_or(t);
            for (pt, en) in PT {
                if *pt == t || *pt == singular {
                    alts.push(en.to_string());
                }
            }
            alts
        })
        .collect()
}

/// Menor = melhor. None = não bate.
fn score(name: &str, terms: &[Vec<String>]) -> Option<u32> {
    let mut total = 0;
    for alts in terms {
        let best = alts
            .iter()
            .filter_map(|t| {
                if name == t {
                    Some(0)
                } else if name.starts_with(&format!("{t}-")) {
                    Some(1)
                } else if name.split('-').any(|w| w == t) {
                    Some(2)
                } else if name.starts_with(t.as_str()) {
                    Some(3)
                } else if name.split('-').any(|w| w.starts_with(t.as_str())) {
                    Some(4)
                } else if name.contains(t.as_str()) {
                    Some(6)
                } else {
                    None
                }
            })
            .min()?;
        total += best;
    }
    Some(total * 100 + name.len() as u32)
}

pub fn run(lib: &Library, q: &Query) -> Page {
    let terms = terms(&q.text);
    // (pontuação, posição dentro da coleção, índice da coleção, índice do ícone)
    let mut hits: Vec<(u32, usize, usize, usize)> = Vec::new();

    for (si, set) in lib.sets.iter().enumerate() {
        if !q.collections.is_empty() && !q.collections.contains(&set.prefix) {
            continue;
        }
        let mut rank = 0;
        for (ii, icon) in set.icons.iter().enumerate() {
            if !q.style.is_empty() && icon.style != q.style {
                continue;
            }
            let s = if terms.is_empty() { Some(0) } else { score(&icon.name, &terms) };
            if let Some(s) = s {
                // Sem busca, intercala as coleções para dar variedade.
                hits.push((s, rank, si, ii));
                rank += 1;
            }
        }
    }
    hits.sort_unstable();

    let opts = RenderOptions { color: None, stroke: q.stroke, size: None };
    let items = hits
        .iter()
        .skip(q.offset)
        .take(q.limit)
        .map(|&(_, _, si, ii)| {
            let set = &lib.sets[si];
            let icon = &set.icons[ii];
            Item {
                id: format!("{}:{}", set.prefix, icon.name),
                name: icon.name.clone(),
                collection: set.label.clone(),
                license: set.license.clone(),
                style: icon.style.clone(),
                weight: icon.has_weight(),
                svg: render(icon, &opts),
            }
        })
        .collect();

    Page { total: hits.len(), items }
}
