/**
 * HTML do Tiptap (StarterKit + sublinhado + link) -> MARKDOWN do backend Resolv.
 *
 * Por que um serializador próprio e não uma biblioteca (turndown, tiptap-markdown, prosemirror-markdown):
 *  - o editor só produz um conjunto FECHADO de tags (p, br, strong/em/s/u/code, a, h1-h6, ul/ol/li, blockquote,
 *    pre>code, hr) e o backend só entende um subconjunto pequeno de markdown (negrito, itálico, listas, link, além do
 *    que o `marked` da leitura mostra: citação, código, título, quebra de linha). Escrever o caminho de ida em ~200
 *    linhas deixa as regras (escape, espaços junto ao marcador, link seguro) sob teste e sem dependência nova;
 *  - turndown (~30 kB) e prosemirror-markdown (+ markdown-it) dobrariam o que a gente já traz (`marked`) e o
 *    `tiptap-markdown` é de terceiros e acopla o editor. O `tiptap` v2 não tem serializador oficial de markdown;
 *  - a entrada passa por `DOMParser` (nunca por `innerHTML` na página) e a saída é TEXTO: nada aqui executa HTML.
 *
 * Regras que o backend impõe (ver `analiseDeTexto.ts` do Resolv): quebra de linha simples é quebra de linha; o
 * marcador precisa "abraçar" a palavra (`**a**`, não `** a **`); só http, https e mailto viram link.
 * Sublinhado não tem markdown: o texto segue sem marca. Imagens e tabelas não existem no editor: viram o texto.
 */

const SAFE_HREF = /^(?:https?:\/\/[^\s/?#]+|mailto:\S+)/i;

/** Escapa o que o `marked` (leitura) interpretaria como marcação, sem encher o texto de barras. */
export function escapeInline(text: string): string {
  return (
    text
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      // `*` e `_` só viram ênfase quando "abraçam" uma palavra; `5 * 3` e `snake_case` ficam como estão.
      .replace(/\*+/g, (m, offset: number, s: string) => (hugs(s, offset, m.length) ? m.replace(/\*/g, '\\*') : m))
      .replace(/(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu, (m, offset: number, s: string) => (hugs(s, offset, m.length) ? m.replace(/_/g, '\\_') : m))
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/&(?=#?[a-zA-Z0-9]+;)/g, '\\&')
      .replace(/<(?=[a-zA-Z/!])/g, '\\<')
  );
}

function hugs(s: string, offset: number, len: number): boolean {
  const before = s[offset - 1];
  const after = s[offset + len];
  const spaceBefore = before === undefined || /\s/.test(before);
  const spaceAfter = after === undefined || /\s/.test(after);
  return !(spaceBefore && spaceAfter);
}

/** Marcadores de bloco no INÍCIO de uma linha de texto comum (`# `, `> `, `- `, `1. `, `---`) viram texto literal. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6})(?=\s)/, '$1\\$2')
    .replace(/^(\s*)>/, '$1\\>')
    .replace(/^(\s*)([-+*])(?=\s)/, '$1\\$2')
    .replace(/^(\s*)(\d{1,9})([.)])(?=\s)/, '$1$2\\$3')
    .replace(/^(\s*)([-*_])(\s*\2){2,}\s*$/, '$1\\$2$3');
}

const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'table', 'tr']);
const isEl = (n: Node): n is Element => n.nodeType === 1;
const tagOf = (n: Node): string => (isEl(n) ? n.tagName.toLowerCase() : '');

/** Mantém espaços/quebras de FORA dos marcadores: `<strong>oi </strong>` -> `**oi** `. */
function wrapMark(inner: string, mark: string): string {
  const core = inner.replace(/^\s+|\s+$/g, '');
  if (!core) return inner;
  const lead = /^\s*/.exec(inner)![0];
  const trail = /\s*$/.exec(inner)![0];
  return `${lead}${mark}${core}${mark}${trail}`;
}

function linkUrl(href: string): string {
  return href.trim().replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function inline(node: Node): string {
  if (node.nodeType === 3) return escapeInline(node.textContent ?? '');
  if (!isEl(node)) return '';
  const tag = tagOf(node);
  if (tag === 'br') return '\n';
  if (tag === 'img') return '';
  const inner = inlineChildren(node);
  switch (tag) {
    case 'strong':
    case 'b':
      return wrapMark(inner, '**');
    case 'em':
    case 'i':
      return wrapMark(inner, '_');
    case 'code': {
      const raw = node.textContent ?? '';
      if (!raw.trim()) return '';
      const fence = raw.includes('`') ? '``' : '`';
      return `${fence}${raw.includes('`') ? ` ${raw} ` : raw}${fence}`;
    }
    case 'a': {
      const href = (node.getAttribute('href') ?? '').trim();
      const text = inner.trim();
      if (!SAFE_HREF.test(href) || /[\u0000-\u001f\u007f]/.test(href)) return inner;
      const plain = node.textContent?.trim() ?? '';
      if (!text) return '';
      if (plain === href || plain === href.replace(/^mailto:/i, '')) return href.startsWith('mailto:') ? `[${text}](${linkUrl(href)})` : linkUrl(href);
      return `[${text}](${linkUrl(href)})`;
    }
    default:
      return inner;
  }
}

function inlineChildren(el: Node): string {
  let out = '';
  el.childNodes.forEach((c) => {
    out += inline(c);
  });
  return out;
}

const indentLines = (s: string, pad: string): string => s.split('\n').map((l) => (l ? pad + l : l)).join('\n');

function listToMd(el: Element, depth: number): string {
  const ordered = tagOf(el) === 'ol';
  let n = ordered ? Number.parseInt(el.getAttribute('start') ?? '1', 10) || 1 : 0;
  const items: string[] = [];
  el.childNodes.forEach((child) => {
    if (tagOf(child) !== 'li') return;
    const marker = ordered ? `${n++}. ` : '- ';
    const body = blocks(child as Element, depth + 1).trim();
    const pad = ' '.repeat(marker.length);
    const [first = '', ...rest] = body.split('\n');
    items.push(marker + first + (rest.length ? `\n${indentLines(rest.join('\n'), pad)}` : ''));
  });
  return items.join('\n');
}

/** Serializa os filhos de um contêiner de BLOCOS; texto solto vira parágrafo. */
function blocks(parent: Element, depth = 0): string {
  const out: string[] = [];
  let run = '';
  const flush = () => {
    const text = run.replace(/^\n+|\n+$/g, '');
    if (text.trim()) out.push(text.split('\n').map(escapeLineStart).join('\n'));
    run = '';
  };
  parent.childNodes.forEach((child) => {
    const tag = tagOf(child);
    if (!BLOCK_TAGS.has(tag)) {
      run += inline(child);
      return;
    }
    flush();
    const el = child as Element;
    switch (tag) {
      case 'ul':
      case 'ol':
        out.push(listToMd(el, depth));
        break;
      case 'blockquote': {
        const body = blocks(el, depth).trim();
        if (body) out.push(body.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n'));
        break;
      }
      case 'pre': {
        const code = (el.textContent ?? '').replace(/\n$/, '');
        let fence = '```';
        while (code.includes(fence)) fence += '`';
        out.push(`${fence}\n${code}\n${fence}`);
        break;
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const text = inlineChildren(el).replace(/\n+/g, ' ').trim();
        if (text) out.push(`${'#'.repeat(Number(tag[1]))} ${text}`);
        break;
      }
      case 'hr':
        out.push('---');
        break;
      case 'li':
        out.push(blocks(el, depth));
        break;
      default: {
        // p, div, table, tr: bloco de texto (tabelas e divs viram parágrafos com o texto das células)
        const rows = tag === 'table' ? [...el.querySelectorAll('tr')] : tag === 'tr' ? [el] : [];
        const text = rows.length ? rows.map((r) => [...r.children].map((c) => inlineChildren(c).trim()).join(' | ')).join('\n') : blocks(el, depth);
        if (text.trim()) out.push(text.trim());
      }
    }
  });
  flush();
  return out.join(tagOf(parent) === 'li' ? '\n' : '\n\n');
}

/**
 * HTML (do editor) -> markdown. Parágrafos ficam separados por linha em branco; `<br>` vira quebra simples.
 * HTML vazio ou só com espaços devolve ''.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return blocks(doc.body)
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
