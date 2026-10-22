import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitizeHtml';

describe('sanitizeHtml', () => {
  it('mantém formatação permitida', () => {
    expect(sanitizeHtml('<p>Oi <strong>mundo</strong></p><ul><li>a</li></ul>')).toBe('<p>Oi <strong>mundo</strong></p><ul><li>a</li></ul>');
  });
  it('remove script, style, iframe e handlers', () => {
    const out = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><style>p{}</style><iframe src="x"></iframe>');
    expect(out).toBe('<p>a</p>');
  });
  it('bloqueia javascript: em links e força rel/target', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    const ok = sanitizeHtml('<a href="https://a.com" onclick="y()">x</a>');
    expect(ok).toContain('rel="noopener noreferrer"');
    expect(ok).toContain('target="_blank"');
    expect(ok).not.toContain('onclick');
  });
  it('desembrulha tags desconhecidas e filtra imagens', () => {
    expect(sanitizeHtml('<marquee>oi</marquee>')).toBe('oi');
    expect(sanitizeHtml('<img src="javascript:x">')).toBe('');
    expect(sanitizeHtml('<img src="https://a.com/i.png" onerror="x()">')).toBe('<img src="https://a.com/i.png" alt="">');
  });
  it('escapa texto', () => {
    expect(sanitizeHtml('&lt;script&gt;')).toBe('&lt;script&gt;');
  });
});
