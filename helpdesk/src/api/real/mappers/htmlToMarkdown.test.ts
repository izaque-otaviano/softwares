import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './htmlToMarkdown';
import { markdownToHtml } from './markdown';

/** Forma comparável: tags relevantes, `<p>` dentro de `<li>` desembrulhado, espaço entre blocos ignorado. */
function outline(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (n: Node, inLi = false): string => {
    if (n.nodeType === 3) return (n.textContent ?? '').replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const el = n as Element;
    const t = el.tagName.toLowerCase();
    const kids = [...el.childNodes].map((c) => walk(c, t === 'li' || (inLi && t === 'p'))).join('');
    if (t === 'p' && inLi) return kids;
    if (t === 'a') return `<a ${el.getAttribute('href')}>${kids}</a>`;
    if (t === 'b') return `<strong>${kids}</strong>`;
    if (t === 'i') return `<em>${kids}</em>`;
    if (['strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'br', 'p', 'h2', 'hr'].includes(t)) return t === 'br' || t === 'hr' ? `<${t}>` : `<${t}>${kids}</${t}>`;
    return kids;
  };
  return walk(doc.body)
    .replace(/\s+</g, '<')
    .replace(/>\s+/g, '>')
    .replace(/<pre><code>([\s\S]*?)\n?<\/code><\/pre>/g, '<pre><code>$1</code></pre>')
    .replace(/<pre>([^<][\s\S]*?)\n?<\/pre>/g, '<pre><code>$1</code></pre>')
    .trim();
}

const roundTrip = (html: string) => outline(markdownToHtml(htmlToMarkdown(html)));

describe('htmlToMarkdown: formato', () => {
  it('vazio', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('<p></p>')).toBe('');
    expect(htmlToMarkdown('<p> </p>')).toBe('');
  });
  it('parágrafos separados por linha em branco, <br> vira quebra simples', () => {
    expect(htmlToMarkdown('<p>um</p><p>dois<br>tres</p>')).toBe('um\n\ndois\ntres');
  });
  it('negrito, itálico e os dois juntos, com o marcador abraçando a palavra', () => {
    expect(htmlToMarkdown('<p><strong>negrito</strong> e <em>itálico</em> e <strong><em>ambos</em></strong></p>')).toBe('**negrito** e _itálico_ e **_ambos_**');
    expect(htmlToMarkdown('<p>a<strong> espaço </strong>b</p>')).toBe('a **espaço** b');
  });
  it('listas com marcador, numeradas e aninhadas', () => {
    expect(htmlToMarkdown('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('- a\n- b');
    expect(htmlToMarkdown('<ol><li><p>a</p></li><li><p>b</p></li></ol>')).toBe('1. a\n2. b');
    expect(htmlToMarkdown('<ul><li><p>a</p><ul><li><p>a1</p></li></ul></li></ul>')).toBe('- a\n  - a1');
  });
  it('citação, código em linha e em bloco, título e divisor', () => {
    expect(htmlToMarkdown('<blockquote><p>citado</p><p>de novo</p></blockquote>')).toBe('> citado\n>\n> de novo');
    expect(htmlToMarkdown('<p>use <code>npm i</code> aqui</p>')).toBe('use `npm i` aqui');
    expect(htmlToMarkdown('<pre><code>a = 1\nb = `2`</code></pre>')).toBe('```\na = 1\nb = `2`\n```');
    expect(htmlToMarkdown('<h2>Título</h2><p>x</p>')).toBe('## Título\n\nx');
    expect(htmlToMarkdown('<p>a</p><hr><p>b</p>')).toBe('a\n\n---\n\nb');
  });
  it('link seguro vira [texto](url); URL solta fica nua; esquema perigoso vira só o texto', () => {
    expect(htmlToMarkdown('<p><a href="https://x.com/a">veja</a></p>')).toBe('[veja](https://x.com/a)');
    expect(htmlToMarkdown('<p><a href="https://x.com">https://x.com</a></p>')).toBe('https://x.com');
    expect(htmlToMarkdown('<p><a href="javascript:alert(1)">clique</a></p>')).toBe('clique');
    expect(htmlToMarkdown('<p><a href="https://x.com/a_(b)">w</a></p>')).toBe('[w](https://x.com/a_%28b%29)');
  });
  it('escapa só o que viraria marcação', () => {
    expect(htmlToMarkdown('<p>5 * 3 e snake_case_nome</p>')).toBe('5 * 3 e snake_case_nome');
    expect(htmlToMarkdown('<p>*não negrito* e _não itálico_</p>')).toBe('\\*não negrito\\* e \\_não itálico\\_');
    expect(htmlToMarkdown('<p># não título</p><p>- não lista</p><p>1. não numerada</p><p>&gt; não citação</p>')).toBe('\\# não título\n\n\\- não lista\n\n1\\. não numerada\n\n\\> não citação');
    expect(htmlToMarkdown('<p>&lt;b&gt;texto&lt;/b&gt; [x](y)</p>')).toBe('\\<b>texto\\</b> \\[x\\](y)');
  });
  it('sublinhado, imagem e tabela viram texto sem marca', () => {
    expect(htmlToMarkdown('<p><u>sublinhado</u></p>')).toBe('sublinhado');
    expect(htmlToMarkdown('<p>a<img src="x.png">b</p>')).toBe('ab');
    expect(htmlToMarkdown('<table><tr><td>a</td><td>b</td></tr></table>')).toBe('a | b');
  });
});

describe('ida e volta: Tiptap HTML -> markdown -> HTML da conversa', () => {
  const cases: Record<string, string> = {
    negrito: '<p>texto <strong>forte</strong> aqui</p>',
    'itálico': '<p>texto <em>suave</em> aqui</p>',
    'negrito e itálico': '<p><strong><em>os dois</em></strong></p>',
    lista: '<ul><li><p>um</p></li><li><p>dois</p></li></ul>',
    'lista numerada': '<ol><li><p>um</p></li><li><p>dois</p></li></ol>',
    'lista aninhada': '<ul><li><p>a</p><ul><li><p>a1</p></li></ul></li><li><p>b</p></li></ul>',
    'citação': '<blockquote><p>frase citada</p></blockquote><p>resposta</p>',
    'código em linha': '<p>rode <code>make test</code> hoje</p>',
    'bloco de código': '<pre><code>linha 1\nlinha 2</code></pre>',
    link: '<p>abra <a href="https://exemplo.com/a?b=1">o painel</a></p>',
    'quebra de linha': '<p>linha 1<br>linha 2</p>',
    parágrafos: '<p>um</p><p>dois</p>',
    'título': '<h2>Resumo</h2><p>texto</p>',
    'caracteres especiais': '<p>5 * 3 = 15 e a_b_c e *literal* e # nada</p>',
    misto: '<p><strong>Olá</strong>, veja <a href="https://x.com">x</a>.</p><ul><li><p>item <em>um</em></p></li></ul><blockquote><p>q</p></blockquote>',
  };
  for (const [name, html] of Object.entries(cases)) {
    it(name, () => {
      expect(roundTrip(html)).toBe(outline(html));
    });
  }

  it('o que o backend devolve em markdown volta para o mesmo markdown (macro lida e reenviada)', () => {
    const md = 'Olá, **tudo bem**?\n\n- a\n- b\n\n1. x\n2. y\n\n> citação\n\nveja [aqui](https://x.com)';
    expect(htmlToMarkdown(markdownToHtml(md))).toBe(md);
  });

  it('HTML cru digitado no editor aparece como texto, não vira marcação', () => {
    const html = '<p>&lt;script&gt;alert(1)&lt;/script&gt; e &lt;b&gt;x&lt;/b&gt;</p>';
    const back = markdownToHtml(htmlToMarkdown(html));
    expect(back).not.toMatch(/<script|<b>/);
    expect(back).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
