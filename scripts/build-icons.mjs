// Lê os pacotes @iconify-json instalados e gera um JSON compacto por coleção
// em src-tauri/resources/icons/. O Rust carrega esses arquivos ao abrir o app.
//
// Cada ícone vira: { n: nome, b: corpo SVG, s: "line" | "fill" | "color",
//                    w, h, e?: traço editável, v?: { espessura: corpo } }
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = path.resolve('src-tauri/resources/icons');

const suffix = (n, ...s) => s.some((x) => n.endsWith('-' + x));
const has = (n, ...s) => s.some((x) => n.includes('-' + x + '-') || n.endsWith('-' + x));
const skinTone = (n) => /-(light|medium-light|medium|medium-dark|dark)(-skin)?-tone/.test(n) || has(n, 'tone');

// Para cada coleção: nome exibido e uma função que diz o estilo do ícone
// (ou null para descartar variantes duplicadas).
const SETS = {
  lucide: ['Lucide', () => 'line'],
  'material-symbols': ['Material Symbols', (n) =>
    has(n, 'rounded', 'sharp') ? null : suffix(n, 'outline') ? 'line' : 'fill'],
  tabler: ['Tabler', (n) => (suffix(n, 'filled') ? 'fill' : 'line')],
  ph: ['Phosphor', (n) =>
    suffix(n, 'thin', 'light', 'bold', 'duotone') ? null : suffix(n, 'fill') ? 'fill' : 'line'],
  heroicons: ['Heroicons', (n) =>
    /-(16|20)-solid$/.test(n) ? null : suffix(n, 'solid') ? 'fill' : 'line'],
  iconoir: ['Iconoir', (n) => (suffix(n, 'solid') ? 'fill' : 'line')],
  feather: ['Feather', () => 'line'],
  'radix-icons': ['Radix', () => 'line'],
  ri: ['Remix Icon', (n) => (suffix(n, 'fill') ? 'fill' : suffix(n, 'line') ? 'line' : null)],
  bi: ['Bootstrap Icons', (n) => (has(n, 'fill') ? 'fill' : 'line')],
  fluent: ['Fluent UI', (n) =>
    !n.includes('-24-') ? null : suffix(n, 'filled') ? 'fill' : suffix(n, 'regular') ? 'line' : null],
  carbon: ['Carbon', (n) => (suffix(n, 'filled') ? 'fill' : 'line')],
  mdi: ['Material Design Icons', (n) => (has(n, 'outline') ? 'line' : 'fill')],
  'fa6-solid': ['Font Awesome Solid', () => 'fill'],
  'fa6-regular': ['Font Awesome Regular', () => 'line'],
  'fa6-brands': ['Font Awesome Brands', () => 'fill'],
  'simple-icons': ['Simple Icons (marcas)', () => 'fill'],
  solar: ['Solar', (n) => (suffix(n, 'linear') ? 'line' : suffix(n, 'bold') ? 'fill' : null)],
  'akar-icons': ['Akar', (n) => (has(n, 'fill') ? 'fill' : 'line')],
  majesticons: ['Majesticons', (n) => (suffix(n, 'line') ? 'line' : 'fill')],
  ion: ['Ionicons', (n) => (suffix(n, 'sharp') ? null : suffix(n, 'outline') ? 'line' : 'fill')],
  eva: ['Eva', (n) => (suffix(n, 'outline') ? 'line' : 'fill')],
  mingcute: ['MingCute', (n) => (suffix(n, 'fill') ? 'fill' : 'line')],
  hugeicons: ['Hugeicons', () => 'line'],
  uil: ['Unicons', () => 'line'],
  octicon: ['Octicons', (n) => (suffix(n, '24') ? (has(n, 'fill') ? 'fill' : 'line') : null)],
  devicon: ['Devicon', () => 'color'],
  logos: ['Logos', () => 'color'],
  twemoji: ['Twemoji', (n) => (skinTone(n) ? null : 'color')],
  noto: ['Noto Emoji', (n) => (skinTone(n) ? null : 'color')],
  'fluent-emoji-flat': ['Fluent Emoji', (n) => (skinTone(n) || has(n, 'light', 'dark', 'medium') ? null : 'color')],
  flagpack: ['Flagpack', () => 'color'],
  'circle-flags': ['Circle Flags', () => 'color'],
};

// Phosphor não tem traço editável: a espessura vem de variantes prontas.
const PH_WEIGHTS = { thin: '1', light: '1.5', bold: '3' };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = [];
let total = 0;

for (const [prefix, [label, styleOf]] of Object.entries(SETS)) {
  const dir = path.dirname(require.resolve(`@iconify-json/${prefix}/icons.json`));
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'icons.json'), 'utf8'));
  const info = JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8'));
  const dw = data.width ?? data.height ?? 16;
  const dh = data.height ?? data.width ?? 16;

  const icons = [];
  for (const [name, icon] of Object.entries(data.icons)) {
    if (icon.hidden) continue;
    const s = styleOf(name);
    if (!s) continue;
    const entry = { n: name, b: icon.body, s, w: icon.width ?? dw, h: icon.height ?? dh };
    if (s === 'line' && /stroke-width=/.test(icon.body)) entry.e = 1;
    if (prefix === 'ph' && s === 'line') {
      entry.v = {};
      for (const [weight, value] of Object.entries(PH_WEIGHTS)) {
        const variant = data.icons[`${name}-${weight}`];
        if (variant) entry.v[value] = variant.body;
      }
    }
    icons.push(entry);
  }

  const out = { prefix, label, license: info.license?.spdx ?? '', author: info.author?.name ?? '', icons };
  fs.writeFileSync(path.join(OUT, `${prefix}.json`), JSON.stringify(out));
  manifest.push(prefix);
  total += icons.length;
  console.log(`${label.padEnd(24)} ${String(icons.length).padStart(6)}`);
}

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest));

// Fonte Inter local (o app funciona offline).
const fontSrc = path.dirname(require.resolve('@fontsource-variable/inter/package.json'));
fs.mkdirSync('src/fonts', { recursive: true });
fs.copyFileSync(path.join(fontSrc, 'files/inter-latin-wght-normal.woff2'), 'src/fonts/inter.woff2');

console.log(`\nTotal: ${total} ícones em ${manifest.length} coleções`);
