/**
 * Sanitizador simples por whitelist para HTML de mensagens (conteúdo não confiável).
 * Tags desconhecidas são "desembrulhadas" (o texto fica); tags perigosas somem com o conteúdo.
 * Só `href` de links (http, https, mailto, tel) e `src` de imagens (http, https, data:image) sobrevivem.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'h1', 'h2', 'h3', 'h4', 'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img',
]);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'title', 'link', 'meta', 'base']);
const SAFE_LINK = /^(https?:|mailto:|tel:)/i;
const SAFE_IMG = /^(https?:|data:image\/(png|jpe?g|gif|webp);)/i;

function cleanNode(node: Node, out: Node, doc: Document): void {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out.appendChild(doc.createTextNode(child.textContent ?? ''));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) return;
    if (!ALLOWED_TAGS.has(tag)) {
      cleanNode(el, out, doc); // desembrulha
      return;
    }
    const copy = doc.createElement(tag);
    if (tag === 'a') {
      const href = (el.getAttribute('href') ?? '').trim();
      if (SAFE_LINK.test(href)) {
        copy.setAttribute('href', href);
        copy.setAttribute('target', '_blank');
        copy.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (tag === 'img') {
      const src = (el.getAttribute('src') ?? '').trim();
      if (!SAFE_IMG.test(src)) return;
      copy.setAttribute('src', src);
      copy.setAttribute('alt', el.getAttribute('alt') ?? '');
    }
    if (tag !== 'img') cleanNode(el, copy, doc);
    out.appendChild(copy);
  });
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const holder = doc.createElement('div');
  cleanNode(doc.body, holder, doc);
  return holder.innerHTML;
}
