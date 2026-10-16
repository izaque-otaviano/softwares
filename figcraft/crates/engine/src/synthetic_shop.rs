//! A synthetic e-commerce "sale" page for performance work: several tall screens (frames), each a
//! storefront with a header, a hero banner, product cards with big procedural photos, rounded
//! corners and drop shadows, a wide lifestyle strip and a footer.
//!
//! The photos are generated here, in code, as JPEGs of 1600 to 4000 pixels (smooth colour fields,
//! soft blobs, fine fabric-like stripes and grain: what makes a downscale alias), so a document
//! weighs like a real shop page without any real picture in the repository.

use figcraft_color::{Color, ImageScaleMode, Paint};
use figcraft_doc::{AutoLayout, DocError, DocResult, Document, Effect, EffectKind, LayoutMode, NodeId, NodeKind, Shadow};

/// What [`shop_document`] builds.
#[derive(Clone, Debug)]
pub struct ShopSpec {
    /// Tall screens (frames) on the page.
    pub screens: usize,
    /// Product cards in a row (each with a photo); a screen has one row.
    pub cards: usize,
    /// Distinct photos; cards cycle through them (a real page repeats few pictures far less).
    pub distinct_photos: usize,
    /// The longest side of the photos, in pixels: from this down to 40% of it.
    pub photo_px: u32,
    /// A frosted header: translucent, with a background blur over the hero photo.
    pub frosted_header: bool,
}

impl ShopSpec {
    /// The page of the performance report: twelve 1440 × ~2000 screens, 72 photo fills of 48
    /// distinct 1600 to 4000 px pictures, about 300 text layers.
    pub const HEAVY: ShopSpec = ShopSpec { screens: 12, cards: 4, distinct_photos: 48, photo_px: 4000, frosted_header: false };
}

/// Screen width and the gap between screens (page units).
pub const SHOP_W: f64 = 1440.0;
pub const SHOP_GAP: f64 = 120.0;

/// A deterministic pseudo-random sequence (xorshift).
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    /// A float in `0..1`.
    fn unit(&mut self) -> f32 {
        (self.next() >> 40) as f32 / (1u64 << 24) as f32
    }
}

/// A procedural photo as a premultiplied (opaque) pixmap: a diagonal colour field, a few soft
/// blobs, fine stripes (a woven fabric) and grain.
pub fn procedural_photo(w: u32, h: u32, seed: u64) -> Option<figcraft_render::Pixmap> {
    let mut pix = figcraft_render::Pixmap::new(w.clamp(1, 8192), h.clamp(1, 8192))?;
    let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1);
    let hue = |rng: &mut Rng| [rng.unit(), rng.unit(), rng.unit()];
    let (c0, c1) = (hue(&mut rng), hue(&mut rng));
    let blobs: Vec<(f32, f32, f32, [f32; 3])> = (0..5).map(|_| (rng.unit(), rng.unit(), 0.08 + rng.unit() * 0.25, hue(&mut rng))).collect();
    let stripe = 3.0 + rng.unit() * 5.0;
    let (fw, fh) = (pix.width() as f32, pix.height() as f32);
    let width = pix.width() as usize;
    for (y, row) in pix.data_mut().chunks_exact_mut(width * 4).enumerate() {
        let v = y as f32 / fh;
        for (x, px) in row.chunks_exact_mut(4).enumerate() {
            let u = x as f32 / fw;
            let t = (u + v) * 0.5;
            let mut c = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
            for (bx, by, r, bc) in &blobs {
                let d = ((u - bx).powi(2) + (v - by).powi(2)) / (r * r);
                let k = (-d).exp() * 0.7;
                for i in 0..3 {
                    c[i] += (bc[i] - c[i]) * k;
                }
            }
            // Fine stripes and grain from the pixel position (no state: cheap and repeatable).
            let weave = ((x as f32 / stripe).sin() * (y as f32 / stripe).cos()) * 0.06;
            let grain = ((x as u32).wrapping_mul(73_856_093) ^ (y as u32).wrapping_mul(19_349_663)).wrapping_mul(2_654_435_761) >> 24;
            let grain = (grain as f32 / 255.0 - 0.5) * 0.08;
            for i in 0..3 {
                px[i] = ((c[i] + weave + grain).clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
            }
            px[3] = 255;
        }
    }
    Some(pix)
}

/// `n` distinct photos of a mix of shapes, `longest` pixels on the long side at most, as JPEG
/// bytes.
fn photos(n: usize, longest: u32) -> DocResult<Vec<Vec<u8>>> {
    const SHAPES: [(f32, f32); 6] = [(1.0, 0.75), (1.0, 0.667), (1.0, 1.0), (0.667, 1.0), (1.0, 0.4), (0.75, 1.0)];
    let mut rng = Rng(0xFACE_CAFE);
    (0..n.clamp(1, 512))
        .map(|i| {
            let (sw, sh) = SHAPES.get(i % SHAPES.len()).copied().unwrap_or((1.0, 1.0));
            // From the full size down to 40%.
            let k = 0.4 + 0.6 * rng.unit();
            let long = (longest.clamp(64, 8192) as f32 * k).max(64.0);
            let (w, h) = ((long * sw) as u32, (long * sh) as u32);
            let pix = procedural_photo(w, h, i as u64 + 1).ok_or_else(|| DocError::Invalid("photo too large".into()))?;
            figcraft_render::encode_jpeg(&pix, Color::WHITE, 88).map_err(DocError::Invalid)
        })
        .collect()
}

fn text(content: &str, size: f64) -> NodeKind {
    let mut t = figcraft_doc::TextData::new(content);
    t.style.font_size = size;
    NodeKind::Text(t)
}

fn solid(doc: &mut Document, id: NodeId, c: Color) {
    if let Some(n) = doc.node_mut(id) {
        n.fills = vec![Paint::solid(c)];
    }
}

fn rounded(doc: &mut Document, id: NodeId, r: f64) {
    if let Some(n) = doc.node_mut(id) {
        n.corners.radii = [r; 4];
    }
}

fn shadow(doc: &mut Document, id: NodeId, radius: f64, alpha: f32) {
    if let Some(n) = doc.node_mut(id) {
        let s = Shadow { color: Color::new(0.0, 0.0, 0.0, alpha), offset: (0.0, 6.0), radius, ..Shadow::default() };
        n.effects.push(Effect { kind: EffectKind::DropShadow(s), visible: true });
    }
}

fn photo(doc: &mut Document, id: NodeId, hash: &str) {
    if let Some(n) = doc.node_mut(id) {
        n.fills = vec![Paint::image(hash, ImageScaleMode::Fill)];
    }
}

fn auto(doc: &mut Document, id: NodeId, mode: LayoutMode, gap: f64, pad: f64) {
    if let Some(n) = doc.node_mut(id) {
        n.layout = Some(AutoLayout { mode, gap, padding: [pad; 4], ..AutoLayout::default() });
    }
}

/// The sale page `spec` describes, normalised like an opened file. Returns the document and its
/// page. Photos are built in code and take a few seconds at full size.
pub fn shop_document(spec: &ShopSpec) -> DocResult<(Document, NodeId)> {
    let mut doc = Document::new("Shop");
    let page = doc.first_page().ok_or(DocError::Invalid("new document has no page".into()))?;
    let encoded = photos(spec.distinct_photos, spec.photo_px)?;
    let mut hashes = Vec::with_capacity(encoded.len());
    for bytes in encoded {
        hashes.push(figcraft_format::add_image(&mut doc, bytes).map_err(|e| DocError::Invalid(e.to_string()))?.0);
    }
    let pick = |i: usize| hashes.get(i % hashes.len().max(1)).cloned().unwrap_or_default();
    let screens = spec.screens.clamp(1, 64);
    let cards = spec.cards.clamp(1, 8);
    let cols = 4usize;
    let (accent, ink, grey) =
        (Color::from_rgb8_const(0xE6, 0x39, 0x2E), Color::from_rgb8_const(0x1A, 0x1A, 0x1A), Color::from_rgb8_const(0x77, 0x77, 0x77));
    let mut photo_i = 0usize;
    // Card geometry: the row fills the screen's width between margins.
    let margin = 40.0;
    let card_w = (SHOP_W - 2.0 * margin - (cards as f64 - 1.0) * 24.0) / cards as f64;
    for s in 0..screens {
        let (x, y) = ((s % cols) as f64 * (SHOP_W + SHOP_GAP), (s / cols) as f64 * (2100.0 + SHOP_GAP));
        let screen = doc.create(page, NodeKind::Frame, &format!("Screen {}", s + 1), x, y, SHOP_W, 2100.0)?;
        solid(&mut doc, screen, Color::from_rgb8_const(0xFA, 0xFA, 0xFA));
        if let Some(n) = doc.node_mut(screen) {
            n.clip = true;
        }
        // Header: logo, links, search, cart (auto layout).
        let header = doc.create(screen, NodeKind::Frame, "Header", 0.0, 0.0, SHOP_W, 80.0)?;
        solid(&mut doc, header, Color::WHITE);
        if spec.frosted_header
            && let Some(n) = doc.node_mut(header)
        {
            n.fills = vec![Paint::solid(Color::new(1.0, 1.0, 1.0, 0.55))];
            n.effects.push(Effect { kind: EffectKind::BackgroundBlur(figcraft_doc::Blur::uniform(16.0)), visible: true });
        }
        auto(&mut doc, header, LayoutMode::Horizontal, 28.0, 20.0);
        let logo = doc.create(header, NodeKind::Ellipse { start: 0.0, sweep: std::f64::consts::TAU, inner: 0.0 }, "Logo", 0.0, 0.0, 40.0, 40.0)?;
        solid(&mut doc, logo, accent);
        for (k, label) in ["Ofertas", "Moda", "Casa", "Tecnologia", "Esportes"].iter().enumerate() {
            let t = doc.create(header, text(label, 18.0), &format!("Link {k}"), 0.0, 0.0, 90.0, 24.0)?;
            solid(&mut doc, t, ink);
        }
        let search = doc.create(header, NodeKind::Rectangle, "Search", 0.0, 0.0, 360.0, 40.0)?;
        solid(&mut doc, search, Color::from_rgb8_const(0xEE, 0xEE, 0xEE));
        rounded(&mut doc, search, 20.0);
        // Hero banner: a big photo, headline, subtitle, call to action.
        let hero = doc.create(screen, NodeKind::Rectangle, "Hero", 0.0, 80.0, SHOP_W, 460.0)?;
        photo(&mut doc, hero, &pick(photo_i));
        photo_i += 1;
        let h1 = doc.create(screen, text("DESCONTÃO", 96.0), "Headline", 60.0, 200.0, 700.0, 110.0)?;
        solid(&mut doc, h1, Color::WHITE);
        let h2 = doc.create(screen, text("Até 70% de desconto em toda a loja", 28.0), "Subtitle", 60.0, 330.0, 700.0, 36.0)?;
        solid(&mut doc, h2, Color::WHITE);
        let cta = doc.create(screen, NodeKind::Frame, "CTA", 60.0, 400.0, 220.0, 56.0)?;
        solid(&mut doc, cta, accent);
        rounded(&mut doc, cta, 28.0);
        shadow(&mut doc, cta, 20.0, 0.25);
        let cta_t = doc.create(cta, text("Comprar agora", 20.0), "Label", 40.0, 16.0, 150.0, 26.0)?;
        solid(&mut doc, cta_t, Color::WHITE);
        // Section title.
        let st = doc.create(screen, text("Mais vendidos da semana", 36.0), "Section", margin, 590.0, 600.0, 48.0)?;
        solid(&mut doc, st, ink);
        // Product cards.
        for c in 0..cards {
            let cx = margin + c as f64 * (card_w + 24.0);
            let card = doc.create(screen, NodeKind::Frame, &format!("Card {}", c + 1), cx, 670.0, card_w, 560.0)?;
            solid(&mut doc, card, Color::WHITE);
            rounded(&mut doc, card, 16.0);
            shadow(&mut doc, card, 24.0, 0.14);
            if let Some(n) = doc.node_mut(card) {
                n.clip = true;
            }
            let img = doc.create(card, NodeKind::Rectangle, "Photo", 0.0, 0.0, card_w, 340.0)?;
            photo(&mut doc, img, &pick(photo_i));
            photo_i += 1;
            let badge = doc.create(card, NodeKind::Frame, "Badge", 16.0, 16.0, 72.0, 28.0)?;
            solid(&mut doc, badge, accent);
            rounded(&mut doc, badge, 14.0);
            let bt = doc.create(badge, text(&format!("-{}%", 20 + (c + s) % 50), 16.0), "Off", 14.0, 4.0, 50.0, 20.0)?;
            solid(&mut doc, bt, Color::WHITE);
            let info = doc.create(card, NodeKind::Frame, "Info", 0.0, 340.0, card_w, 220.0)?;
            auto(&mut doc, info, LayoutMode::Vertical, 10.0, 20.0);
            let title = doc.create(info, text(&format!("Produto {} da coleção {}", c + 1, s + 1), 20.0), "Title", 0.0, 0.0, card_w - 40.0, 26.0)?;
            solid(&mut doc, title, ink);
            let old = doc.create(info, text("De R$ 399,90", 16.0), "Old price", 0.0, 0.0, 140.0, 20.0)?;
            solid(&mut doc, old, grey);
            let price = doc.create(info, text(&format!("R$ {},90", 99 + 10 * c), 32.0), "Price", 0.0, 0.0, 180.0, 40.0)?;
            solid(&mut doc, price, accent);
            let buy = doc.create(info, NodeKind::Frame, "Buy", 0.0, 0.0, card_w - 40.0, 48.0)?;
            solid(&mut doc, buy, ink);
            rounded(&mut doc, buy, 10.0);
            let bl = doc.create(buy, text("Adicionar ao carrinho", 17.0), "Label", 20.0, 12.0, 200.0, 24.0)?;
            solid(&mut doc, bl, Color::WHITE);
        }
        // A wide lifestyle strip.
        let strip = doc.create(screen, NodeKind::Rectangle, "Strip", margin, 1290.0, SHOP_W - 2.0 * margin, 520.0)?;
        photo(&mut doc, strip, &pick(photo_i));
        photo_i += 1;
        rounded(&mut doc, strip, 24.0);
        shadow(&mut doc, strip, 32.0, 0.2);
        // Footer.
        let footer = doc.create(screen, NodeKind::Frame, "Footer", 0.0, 1860.0, SHOP_W, 240.0)?;
        solid(&mut doc, footer, ink);
        auto(&mut doc, footer, LayoutMode::Vertical, 12.0, 40.0);
        for (k, label) in ["Atendimento 0800 000 0000", "Trocas e devoluções em até 30 dias", "Entrega para todo o Brasil"].iter().enumerate() {
            let t = doc.create(footer, text(label, 18.0), &format!("Footer {k}"), 0.0, 0.0, 500.0, 24.0)?;
            solid(&mut doc, t, Color::WHITE);
        }
    }
    // Settle derived state (text sizes, auto layout, group bounds) as after opening a file.
    let empty = Document::new("");
    crate::normalize(&mut doc, &empty);
    Ok((doc, page))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_small_shop_builds_with_photos_and_text() {
        let spec = ShopSpec { screens: 2, cards: 3, distinct_photos: 4, photo_px: 400, frosted_header: false };
        let (doc, page) = shop_document(&spec).unwrap();
        assert!(doc.validate().is_empty());
        assert_eq!(doc.images.len(), 4);
        let fills = doc.nodes().flat_map(|n| n.fills.iter()).filter(|p| matches!(p.kind, figcraft_color::PaintKind::Image(_))).count();
        // Per screen: hero, one photo per card, the strip.
        assert_eq!(fills, 2 * (1 + 3 + 1));
        assert!(doc.nodes().filter(|n| matches!(n.kind, NodeKind::Text(_))).count() > 20);
        assert!(doc.page_content_bounds(page).is_some());
        // The pictures decode.
        for img in doc.images.values() {
            assert!(figcraft_render::images::decode(&img.bytes).is_some());
        }
    }

    #[test]
    fn photos_differ_and_are_repeatable() {
        let a = procedural_photo(64, 48, 1).unwrap();
        let b = procedural_photo(64, 48, 2).unwrap();
        assert_eq!(a.data(), procedural_photo(64, 48, 1).unwrap().data());
        assert_ne!(a.data(), b.data());
    }
}
