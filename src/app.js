const { invoke } = window.__TAURI__.core;
const appWindow = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();

const $ = (id) => document.getElementById(id);
const PAGE = 240;
const STYLE_LABEL = { line: 'Linha', fill: 'Preenchido', color: 'Cor' };
const FAVORITES = 'favoritos';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z"/></svg>';
const FOLDER_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5h5"/></svg>';
const FOLDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>';
const CHECK = '<svg class="check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// Preferências simples ficam no navegador do app.
const saved = (() => {
  try { return JSON.parse(localStorage.getItem('prefs')) || {}; } catch { return {}; }
})();

const state = {
  text: '',
  // Prefixo de coleção, '' (todas) ou 'folder:<id>'.
  collection: saved.collection ?? '',
  style: saved.style ?? '',
  stroke: saved.stroke ?? null, // null = espessura original de cada ícone
  color: saved.color ?? '#000000',
  format: saved.format ?? 'svg',
  size: saved.size ?? 64,
  tile: saved.tile ?? 96,
  view: saved.view ?? 'grid',
  exportFormats: saved.exportFormats ?? 'svg',
  exportZip: saved.exportZip ?? true,
  sidebar: saved.sidebar ?? true,
  // Coleções marcadas no filtro (vazio = todas).
  sets: saved.sets ?? [],
  recentColors: saved.recentColors ?? [],
  theme: saved.theme ?? 'auto',
  items: [],
  total: 0,
  loading: false,
  request: 0,
  current: null,
  // Itens selecionados numa pasta (índices em state.items).
  selected: new Set(),
  lastPicked: null,
  collections: [],
  folders: [],
  favorites: new Set(),
};

function persist() {
  const { collection, style, stroke, color, format, size, tile, view, exportFormats, exportZip, sidebar, theme, sets, recentColors } = state;
  try {
    localStorage.setItem('prefs', JSON.stringify({ collection, style, stroke, color, format, size, tile, view, exportFormats, exportZip, sidebar, theme, sets, recentColors }));
  } catch {}
}

const folderId = () => (state.collection.startsWith('folder:') ? state.collection.slice(7) : null);
const opts = () => ({ color: state.color, stroke: state.stroke, size: state.size });
// Itens de pasta usam os ajustes salvos com eles; o resto usa a barra.
const itemOpts = (item) =>
  item.entry ? { color: item.entry.color, stroke: item.entry.stroke, size: item.entry.size } : opts();
const entryFor = (item) => item.entry ?? { icon: item.id, color: state.color, stroke: state.stroke, size: state.size };
const sizeOf = (item) => itemOpts(item).size;

// ---------- Toast ----------
let toastTimer;
function toast(message, kind = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2400);
}
const fail = (prefix) => (e) => toast(`${prefix}: ${e}`, 'error');

// ---------- Janela de diálogo ----------
$('modal-cancel').addEventListener('click', () => $('modal').close());
// body: função que preenche o corpo; onOk: async (form) => lança erro para mostrar.
function modal({ title, text = '', ok, danger = false, body, onOk }) {
  const dialog = $('modal');
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  $('modal-error').textContent = '';
  $('modal-body').innerHTML = '';
  if (body) body($('modal-body'));
  const okBtn = $('modal-ok');
  okBtn.textContent = ok;
  okBtn.className = danger ? 'btn-primary danger-fill' : 'btn-primary';
  okBtn.style.background = danger ? 'var(--error)' : '';
  okBtn.style.color = danger ? 'var(--on-error)' : '';

  const form = $('modal-form');
  // "Confirmar" é o único botão de envio: Enter num campo também confirma.
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (okBtn.disabled) return;
    okBtn.disabled = true;
    try {
      await onOk(form);
      dialog.close();
    } catch (err) {
      $('modal-error').textContent = String(err);
    } finally {
      okBtn.disabled = false;
    }
  };
  dialog.showModal();
  const input = dialog.querySelector('input[type="text"], input[type="email"], input[type="password"]');
  (input ?? okBtn).focus();
  input?.select();
}

function nameField(value = '') {
  return (el) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'name';
    input.maxLength = 60;
    input.placeholder = 'Ex.: Site Farmácia Ponte';
    input.value = value;
    input.setAttribute('aria-label', 'Nome da pasta');
    el.appendChild(input);
  };
}

function askNewFolder() {
  return new Promise((resolve) => {
    let created = null;
    modal({
      title: 'Nova pasta',
      text: 'Junte os ícones de um projeto para exportar tudo de uma vez.',
      ok: 'Criar pasta',
      body: nameField(),
      onOk: async (form) => {
        created = await invoke('create_folder', { name: form.elements.name.value });
      },
    });
    $('modal').addEventListener('close', () => resolve(created), { once: true });
  });
}

// ---------- Fontes (pastas + coleções) ----------
async function loadFolders(skipSync = false) {
  const [folders, favs] = await Promise.all([invoke('folders'), invoke('favorite_ids')]);
  state.folders = folders;
  state.favorites = new Set(favs);
  renderSources();
  invoke('refresh_menu').catch(() => {});
  if (!skipSync) scheduleSync();
}

function renderSources() {
  const valid =
    state.collection === '' ||
    state.collection === 'custom' ||
    state.folders.some((f) => `folder:${f.id}` === state.collection);
  if (!valid) {
    // Versões antigas guardavam uma coleção só aqui: vira uma caixa marcada.
    if (state.collections.some((c) => c.prefix === state.collection)) state.sets = [state.collection];
    state.collection = '';
  }
  state.sets = state.sets.filter((p) => state.collections.some((c) => c.prefix === p));
  renderSetsLabel();
  renderSidebar();
}

function renderSidebar() {
  const n = (x) => x.toLocaleString('pt-BR');
  const fav = state.folders.find((f) => f.id === FAVORITES);
  $('n-fav').textContent = fav ? n(fav.count) : '';
  const custom = state.collections.find((c) => c.prefix === 'custom');
  $('n-custom').textContent = custom ? n(custom.count) : '';

  const list = $('side-folders');
  list.innerHTML = '';
  const user = state.folders.filter((f) => f.id !== FAVORITES);
  if (!user.length) {
    const p = document.createElement('p');
    p.className = 'side-empty';
    p.textContent = 'Crie pastas para separar ícones por projeto.';
    list.appendChild(p);
  }
  for (const f of user) {
    const b = document.createElement('button');
    b.className = 'side-item';
    b.dataset.source = `folder:${f.id}`;
    b.innerHTML = `${FOLDER}<span class="label"></span><span class="n"></span>`;
    b.querySelector('.label').textContent = f.name;
    b.querySelector('.n').textContent = n(f.count);
    b.title = f.name;
    list.appendChild(b);
  }
  // O que estiver aberto fica marcado; coleções específicas contam como "Todos os ícones".
  const current = state.collection.startsWith('folder:') || state.collection === 'custom' ? state.collection : '';
  document.querySelectorAll('.side-item').forEach((b) =>
    b.setAttribute('aria-current', String(b.dataset.source === current)),
  );
}

$('sidebar').addEventListener('click', async (e) => {
  const item = e.target.closest('.side-item');
  if (!item) return;
  openSource(item.dataset.source);
  if (matchMedia('(max-width: 640px)').matches) setSidebar(false);
});
$('side-new').addEventListener('click', () => newFolderAndOpen());

async function newFolderAndOpen() {
  const id = await askNewFolder();
  if (!id) return;
  await loadFolders();
  openSource(`folder:${id}`);
}

function openSource(v) {
  if (!$('detail-view').hidden) showList();
  setCollection(v);
  load(true);
}

// Barra lateral: na janela larga liga/desliga; na estreita vira gaveta.
function setSidebar(open) {
  const narrow = matchMedia('(max-width: 640px)').matches;
  if (narrow) {
    document.documentElement.classList.toggle('side-open', open);
  } else {
    state.sidebar = open;
    document.documentElement.classList.toggle('side-off', !open);
    persist();
  }
}
function sidebarOpen() {
  return matchMedia('(max-width: 640px)').matches
    ? document.documentElement.classList.contains('side-open')
    : state.sidebar;
}
$('side-toggle').addEventListener('click', () => setSidebar(!sidebarOpen()));
$('scrim').addEventListener('click', () => setSidebar(false));

function setCollection(v) {
  state.collection = v;
  persist();
  applySourceMode();
  renderSidebar();
}

// ---------- Filtro de coleções (várias de uma vez) ----------
function setsLabel() {
  const names = state.sets.map((p) => state.collections.find((c) => c.prefix === p)?.label ?? p);
  if (!names.length) return 'Todas as coleções';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names.length} coleções`;
}

function renderSetsLabel() {
  $('sets-label').textContent = setsLabel();
  $('sets-btn').classList.toggle('active', state.sets.length > 0);
  $('sets-x').hidden = state.sets.length === 0;
  $('sets-btn').title = state.sets.length > 2 ? state.sets.map((p) => state.collections.find((c) => c.prefix === p)?.label).join(', ') : '';
}

let setsTimer;
function setsChanged() {
  renderSetsLabel();
  persist();
  clearTimeout(setsTimer);
  setsTimer = setTimeout(() => load(true), 150);
}

function renderSetsList() {
  const term = $('sets-search').value.trim().toLowerCase();
  const list = $('sets-list');
  list.innerHTML = '';
  for (const c of state.collections.filter((c) => c.prefix !== 'custom')) {
    if (term && !c.label.toLowerCase().includes(term)) continue;
    const row = document.createElement('label');
    row.className = 'set-row';
    row.innerHTML = `<input type="checkbox"><span class="set-name"></span><span class="set-n"></span>`;
    const box = row.querySelector('input');
    box.checked = state.sets.includes(c.prefix);
    row.querySelector('.set-name').textContent = c.label;
    row.querySelector('.set-n').textContent = c.count.toLocaleString('pt-BR');
    box.addEventListener('change', () => {
      state.sets = box.checked ? [...state.sets, c.prefix] : state.sets.filter((p) => p !== c.prefix);
      renderSetsFooter();
      setsChanged();
    });
    list.appendChild(row);
  }
  if (!list.children.length) list.innerHTML = '<p class="sets-empty">Nenhuma coleção com esse nome.</p>';
  renderSetsFooter();
}

function renderSetsFooter() {
  const n = state.sets.length;
  $('sets-count').textContent = n ? `${n} ${n === 1 ? 'marcada' : 'marcadas'}` : 'Mostrando todas as coleções';
  $('sets-clear').hidden = !n;
  $('sets-clear').disabled = !n;
}

function openSets() {
  const menu = $('sets-menu');
  menu.hidden = false;
  $('sets-btn').setAttribute('aria-expanded', 'true');
  const r = $('sets-btn').getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${r.bottom + 6}px`;
  menu.style.maxHeight = `${Math.max(220, innerHeight - r.bottom - 24)}px`;
  $('sets-search').value = '';
  renderSetsList();
  $('sets-search').focus();
}
function closeSets() {
  $('sets-menu').hidden = true;
  $('sets-btn').setAttribute('aria-expanded', 'false');
}
$('sets-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('sets-menu').hidden ? openSets() : closeSets();
});
$('sets-search').addEventListener('input', renderSetsList);
function clearSets() {
  state.sets = [];
  if (!$('sets-menu').hidden) renderSetsList();
  setsChanged();
  toast('Mostrando todas as coleções');
}
$('sets-clear').addEventListener('click', clearSets);
$('sets-x').addEventListener('click', (e) => {
  e.stopPropagation();
  clearSets();
});
document.addEventListener('click', (e) => {
  if (!$('sets-menu').hidden && !e.target.closest('#sets-menu, #sets-btn')) closeSets();
});
window.addEventListener('resize', closeSets);

// Dentro de uma pasta os filtros de estilo/espessura não se aplicam.
function applySourceMode() {
  const id = folderId();
  const folder = state.folders.find((f) => f.id === id);
  $('folder-bar').hidden = !folder;
  $('filters').hidden = !!folder || !$('detail-view').hidden;
  $('sets-btn').parentElement.hidden = state.collection === 'custom';
  if (folder) {
    $('folder-name').textContent = folder.name;
    $('folder-rename').hidden = folder.id === FAVORITES;
    $('folder-delete').hidden = folder.id === FAVORITES;
    $('folder-opts-sep').hidden = folder.id === FAVORITES;
    $('folder-export').disabled = folder.count === 0;
  }
}

// ---------- Carregar lista ----------
async function load(reset, keepSelected = null) {
  if (state.loading && !reset) return;
  const id = ++state.request;
  if (reset) {
    clearSelection();
    state.items = [];
    $('grid').innerHTML = '<div class="skeleton"></div>'.repeat(24);
    $('state').hidden = true;
  }
  state.loading = true;
  try {
    const folder = folderId();
    let items;
    let total;
    if (folder) {
      const rows = await invoke('folder_items', { id: folder, text: state.text });
      items = rows.map((r) => ({
        id: r.entry.icon, name: r.name, collection: r.collection, license: r.license,
        style: r.style, svg: r.svg, entry: r.entry,
      }));
      total = items.length;
    } else {
      const page = await invoke('search', {
        query: {
          text: state.text,
          collections: state.collection === 'custom' ? ['custom'] : state.sets,
          style: state.style,
          stroke: state.stroke, offset: state.items.length, limit: PAGE,
        },
      });
      items = page.items;
      total = page.total;
    }
    if (id !== state.request) return;
    if (reset) $('grid').innerHTML = '';
    state.total = total;
    const start = state.items.length;
    state.items.push(...items);
    renderTiles(items, start);
    if (keepSelected) {
      keepSelected.filter((i) => i < state.items.length).forEach((i) => state.selected.add(i));
      renderSelection();
    }
    renderCount();
    renderEmpty();
  } catch (e) {
    if (id !== state.request) return;
    $('grid').innerHTML = '';
    showState('Não deu para carregar os ícones', String(e), 'Tentar de novo', () => load(true));
  } finally {
    if (id === state.request) state.loading = false;
  }
}

// Cor de um ícone de pasta na tela: a salva, mas cores muito escuras viram
// a cor do texto no tema escuro (senão somem no fundo). O arquivo exportado não muda.
function screenColor(hex) {
  if (!hex) return '';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (isDark() && lum < 0.25) return 'var(--ink)';
  if (!isDark() && lum > 0.9) return 'var(--ink)';
  return hex;
}

function renderTiles(items, start) {
  const frag = document.createDocumentFragment();
  items.forEach((item, i) => {
    const b = document.createElement('button');
    b.className = 'tile';
    b.dataset.index = start + i;
    b.dataset.id = item.id;
    b.title = `${item.name} · ${item.collection}`;
    b.setAttribute('aria-label', `${item.name}, ${item.collection}`);
    const on = state.favorites.has(item.id);
    b.innerHTML = `<span class="glyph">${item.svg}</span>
      <span class="t-text"><span class="t-name"></span><span class="t-meta"></span></span>
      <span class="tool star${on ? ' on' : ''}" data-star title="${on ? 'Desfavoritar' : 'Favoritar'}">${STAR}</span>
      <span class="tool folder" data-folder title="Salvar em pasta" aria-expanded="false">${FOLDER_PLUS}</span>
      ${selectable(item) ? `<span class="tool sel" data-sel role="checkbox" aria-checked="false" title="Selecionar">${CHECK}</span>` : ''}`;
    if (item.entry) b.style.setProperty('--icon-color', screenColor(item.entry.color));
    b.querySelector('.t-name').textContent = item.name;
    b.querySelector('.t-meta').textContent = `${item.collection} · ${STYLE_LABEL[item.style] ?? ''}`;
    frag.appendChild(b);
  });
  $('grid').appendChild(frag);
}

function renderCount() {
  const n = state.total.toLocaleString('pt-BR');
  const text = state.total === 1 ? '1 ícone' : `${n} ícones`;
  $('count').textContent = text;
  $('folder-count').textContent = text;
}

function renderEmpty() {
  if (state.total > 0) return ($('state').hidden = true);
  const folder = state.folders.find((f) => f.id === folderId());
  if (folder && !state.text) {
    const fav = folder.id === FAVORITES;
    showState(
      fav ? 'Nenhum favorito ainda' : 'Pasta vazia',
      fav
        ? 'Clique na estrela de um ícone para guardá-lo aqui.'
        : 'Abra um ícone e use “Salvar em pasta” para adicioná-lo. Ele fica com a cor, a espessura e o tamanho escolhidos.',
      'Buscar ícones',
      () => { setCollection(''); load(true); $('q').focus(); },
    );
  } else if (state.collection === 'custom' && !state.text) {
    showState('Você ainda não importou ícones', 'Arraste arquivos SVG para esta janela ou use o botão abaixo.', 'Importar SVG', importDialog);
  } else {
    const filtered = state.collection || state.style || state.sets.length;
    showState(
      `Nada encontrado para “${state.text}”`,
      filtered ? 'Tente outra palavra ou limpe os filtros.' : 'Tente outra palavra, em português ou inglês.',
      filtered ? 'Limpar filtros' : null,
      () => { setCollection(''); setStyle(''); state.sets = []; setsChanged(); },
    );
  }
}

function showState(title, text, action, onAction) {
  const el = $('state');
  el.hidden = false;
  el.innerHTML = `<h2></h2><p></p>${action ? '<button class="btn-secondary"></button>' : ''}`;
  el.querySelector('h2').textContent = title;
  el.querySelector('p').textContent = text;
  if (action) {
    const b = el.querySelector('button');
    b.textContent = action;
    b.onclick = onAction;
  }
  $('count').textContent = '';
}

new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !state.loading && !folderId() && state.items.length < state.total) load(false);
}, { root: $('main'), rootMargin: '600px' }).observe($('sentinel'));

let searchTimer;
$('q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.text = e.target.value.trim();
    if (!$('detail-view').hidden) showList();
    load(true);
  }, 120);
});

// ---------- Filtros ----------
async function loadCollections() {
  state.collections = await invoke('collections');
}

function setStyle(v) {
  state.style = v;
  document.querySelectorAll('.segmented button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === v)));
  const off = v === 'fill' || v === 'color';
  $('stroke-wrap').setAttribute('aria-disabled', String(off));
  $('stroke').disabled = off;
  persist();
}
document.querySelectorAll('.segmented button').forEach((b) =>
  b.addEventListener('click', () => { setStyle(b.dataset.style); load(true); }),
);

function renderStroke() {
  $('stroke').value = state.stroke ?? 2;
  const r = $('stroke');
  r.style.setProperty('--fill', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  $('stroke-value').textContent = state.stroke == null ? 'Padrão' : `${state.stroke.toLocaleString('pt-BR')} px`;
  $('stroke-reset').hidden = state.stroke == null;
}
let strokeTimer;
$('stroke').addEventListener('input', (e) => {
  state.stroke = Number(e.target.value);
  renderStroke();
  persist();
  clearTimeout(strokeTimer);
  strokeTimer = setTimeout(() => {
    refreshDetail();
    load(true);
  }, 120);
});
$('stroke-reset').addEventListener('click', (e) => {
  e.preventDefault();
  state.stroke = null;
  renderStroke();
  persist();
  refreshDetail();
  load(true);
});

// ---------- Barra inferior ----------
function applyColor() {
  // No modo escuro, preto vira cor do texto só na tela; o arquivo sai preto.
  const dark = isDark();
  const screen = dark && state.color.toLowerCase() === '#000000' ? '' : state.color;
  document.documentElement.style.setProperty('--icon-color', screen || 'var(--ink)');
  $('swatch').style.background = state.color;
  $('color').value = state.color;
  $('color-value').textContent = state.color.toUpperCase();
}
// ---------- Painel de cor (HEX, CMYK, prontas e recentes) ----------
const PRESETS = ['#000000', '#171717', '#60646c', '#999999', '#ffffff', '#ff6140', '#387b69', '#0d74ce',
  '#16a34a', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function normHex(v) {
  let h = String(v).trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
  return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
}
// CMYK simples (sem perfil de cor): suficiente para conferir e digitar valores de impressão.
function hexToCmyk(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const f = (x) => Math.round(((1 - x - k) / (1 - k)) * 100);
  return { c: f(r), m: f(g), y: f(b), k: Math.round(k * 100) };
}
function cmykToHex({ c, m, y, k }) {
  const to = (x) => Math.round(255 * (1 - x / 100) * (1 - k / 100)).toString(16).padStart(2, '0');
  return `#${to(c)}${to(m)}${to(y)}`;
}

function setColor(hex, from) {
  state.color = hex;
  applyColor();
  persist();
  renderColorPop(from);
  if (state.selected.size && folderId()) recolorSelection(hex);
}

// Com ícones selecionados na pasta, a cor da barra vale para eles.
let recolorTimer;
function recolorSelection(hex) {
  clearTimeout(recolorTimer);
  recolorTimer = setTimeout(async () => {
    const picked = [...state.selected].sort((a, b) => a - b);
    const entries = picked.map((i) => state.items[i]?.entry).filter(Boolean);
    if (!entries.length) return;
    try {
      await invoke('update_entries', { id: folderId(), entries, change: { color: hex } });
      await loadFolders();
      await load(true, picked);
      toast(`Cor aplicada a ${plural(entries.length, 'ícone', 'ícones')}`);
    } catch (e) {
      fail('Não deu para mudar a cor')(e);
    }
  }, 250);
}

function renderColorPop(from) {
  $('cp-preview').style.background = state.color;
  if (from !== 'hex') $('cp-hex').value = state.color.slice(1).toUpperCase();
  if (from !== 'cmyk') {
    const cmyk = hexToCmyk(state.color);
    document.querySelectorAll('.cp-cmyk input').forEach((i) => (i.value = cmyk[i.dataset.k]));
  }
  const swatch = (hex) => {
    const on = hex.toLowerCase() === state.color.toLowerCase();
    return `<button type="button" class="cp-sw${on ? ' on' : ''}" data-hex="${hex}" style="--sw:${hex}" aria-label="${hex.toUpperCase()}" aria-pressed="${on}" title="${hex.toUpperCase()}"></button>`;
  };
  $('cp-presets').innerHTML = PRESETS.map(swatch).join('');
  $('cp-recent').innerHTML = state.recentColors.map(swatch).join('');
  $('cp-recent-title').hidden = !state.recentColors.length;
}

// Guarda a cor usada nas recentes quando o painel fecha.
function rememberColor() {
  const c = state.color.toLowerCase();
  if (PRESETS.includes(c)) return;
  state.recentColors = [c, ...state.recentColors.filter((x) => x !== c)].slice(0, 7);
  persist();
}

function openColorPop() {
  const pop = $('color-pop');
  pop.hidden = false;
  renderColorPop();
  const r = $('color-btn').getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 8)}px`;
  $('color-btn').setAttribute('aria-expanded', 'true');
  $('cp-hex').focus();
  $('cp-hex').select();
}
function closeColorPop() {
  if ($('color-pop').hidden) return;
  $('color-pop').hidden = true;
  $('color-btn').setAttribute('aria-expanded', 'false');
  rememberColor();
}
$('color-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  $('color-pop').hidden ? openColorPop() : closeColorPop();
});
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#color-pop, #color-btn')) closeColorPop();
});
$('color-pop').addEventListener('click', (e) => {
  const sw = e.target.closest('.cp-sw');
  if (sw) setColor(sw.dataset.hex);
});
$('cp-hex').addEventListener('input', (e) => {
  const hex = normHex(e.target.value);
  e.target.parentElement.classList.toggle('invalid', !hex && e.target.value.length > 0);
  if (hex) setColor(hex, 'hex');
});
$('cp-hex').addEventListener('blur', () => {
  $('cp-hex').parentElement.classList.remove('invalid');
  $('cp-hex').value = state.color.slice(1).toUpperCase();
});
document.querySelectorAll('.cp-cmyk input').forEach((input) => {
  input.addEventListener('input', () => {
    const vals = {};
    for (const i of document.querySelectorAll('.cp-cmyk input')) {
      const n = Number(i.value);
      if (i.value === '' || Number.isNaN(n)) return;
      vals[i.dataset.k] = Math.min(100, Math.max(0, n));
    }
    setColor(cmykToHex(vals), 'cmyk');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    input.value = Math.min(100, Math.max(0, Number(input.value || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)));
    input.dispatchEvent(new Event('input'));
  });
  input.addEventListener('blur', () => renderColorPop());
});
$('color').addEventListener('input', (e) => setColor(e.target.value));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyColor();
  refreshEntryColors();
});

// ---------- Tema ----------
const THEMES = {
  auto: { label: 'Automático', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>' },
  light: { label: 'Claro', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>' },
  dark: { label: 'Escuro', icon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>' },
};
function isDark() {
  return state.theme === 'dark' || (state.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}
function applyTheme() {
  const root = document.documentElement;
  if (state.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = state.theme;
  $('theme-icon').innerHTML = THEMES[state.theme].icon;
  $('theme-value').textContent = THEMES[state.theme].label;
  // Barra de título e menus nativos acompanham o tema.
  window.__TAURI__.window?.getCurrentWindow?.().setTheme(state.theme === 'auto' ? null : state.theme).catch(() => {});
  applyColor();
  refreshEntryColors();
}
function refreshEntryColors() {
  document.querySelectorAll('.tile').forEach((t) => {
    const item = state.items[Number(t.dataset.index)];
    if (item?.entry) t.style.setProperty('--icon-color', screenColor(item.entry.color));
  });
  if (state.current?.entry) $('preview').style.setProperty('--icon-color', screenColor(state.current.entry.color));
}
function setTheme(theme) {
  state.theme = theme;
  applyTheme();
  persist();
}
$('theme').addEventListener('click', () => {
  const order = ['auto', 'light', 'dark'];
  setTheme(order[(order.indexOf(state.theme) + 1) % order.length]);
});

function applyFormat() {
  const svg = state.format === 'svg';
  $('format-value').textContent = svg ? 'SVG' : 'PNG';
  $('size').value = String(state.size);
  $('size-value').textContent = `${state.size}px`;
  $('d-copy-label').textContent = svg ? 'Copiar SVG' : 'Copiar PNG';
  $('d-save-label').textContent = svg ? 'Salvar SVG' : 'Salvar PNG';
}
$('format').addEventListener('click', () => { state.format = state.format === 'svg' ? 'png' : 'svg'; applyFormat(); persist(); });
$('size').addEventListener('change', (e) => { state.size = Number(e.target.value); applyFormat(); persist(); });

// Tamanho dos cards e grade/lista (barra embaixo da lista).
function applyTile() {
  const r = $('tile-size');
  r.value = state.tile;
  r.style.setProperty('--fill', `${((state.tile - r.min) / (r.max - r.min)) * 100}%`);
  document.documentElement.style.setProperty('--tile', `${state.tile}px`);
  document.documentElement.style.setProperty('--icon', `${Math.round(state.tile * 0.36)}px`);
}
$('tile-size').addEventListener('input', (e) => { state.tile = Number(e.target.value); applyTile(); persist(); });

function applyView() {
  $('grid').classList.toggle('list', state.view === 'list');
  $('tile-size').closest('.tile-size').hidden = state.view === 'list';
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === state.view)));
}
document.querySelectorAll('[data-view]').forEach((b) =>
  b.addEventListener('click', () => { state.view = b.dataset.view; applyView(); persist(); }),
);

// ---------- Favoritos ----------
async function toggleFavorite(item) {
  try {
    const on = await invoke('toggle_favorite', { entry: entryFor(item) });
    if (on) state.favorites.add(item.id);
    else state.favorites.delete(item.id);
    document.querySelectorAll(`.tile[data-id="${CSS.escape(item.id)}"] .star`).forEach((s) => {
      s.classList.toggle('on', on);
      s.title = on ? 'Desfavoritar' : 'Favoritar';
    });
    renderFavButton();
    toast(on ? 'Adicionado aos favoritos' : 'Removido dos favoritos');
    await loadFolders();
    applySourceMode();
    if (folderId() === FAVORITES) load(true);
  } catch (e) {
    fail('Não deu para favoritar')(e);
  }
}

function renderFavButton() {
  const item = state.current;
  if (!item) return;
  const on = state.favorites.has(item.id);
  $('d-fav').setAttribute('aria-pressed', String(on));
  $('d-fav-label').textContent = on ? 'Favoritado' : 'Favoritar';
}
$('d-fav').addEventListener('click', () => state.current && toggleFavorite(state.current));

// ---------- Salvar em pasta ----------
let menuAnchor = null;
let menuItem = null;

function closeMenu() {
  $('folder-menu').hidden = true;
  menuAnchor?.setAttribute('aria-expanded', 'false');
  menuAnchor = null;
  menuItem = null;
}

async function openMenu(item, anchor) {
  if (menuAnchor === anchor) return closeMenu();
  closeMenu();
  const inFolders = new Set(await invoke('folders_with', { icon: item.id }));
  menuItem = item;
  menuAnchor = anchor;
  const menu = $('folder-menu');
  menu.innerHTML = '';
  for (const f of state.folders.filter((f) => f.id !== FAVORITES)) {
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    const has = inFolders.has(f.id);
    b.innerHTML = `${has ? CHECK : '<span class="check"></span>'}<span class="label"></span><span class="n"></span>`;
    b.querySelector('.label').textContent = f.name;
    b.querySelector('.n').textContent = f.count;
    if (has) b.setAttribute('aria-label', `${f.name}, já contém este ícone`);
    b.onclick = () => saveTo(f, item);
    menu.appendChild(b);
  }
  if (menu.children.length) menu.appendChild(document.createElement('hr'));
  const nb = document.createElement('button');
  nb.className = 'new';
  nb.setAttribute('role', 'menuitem');
  nb.innerHTML = '<span class="check"></span><span class="label">Nova pasta…</span>';
  nb.onclick = async () => {
    closeMenu();
    const id = await askNewFolder();
    if (!id) return;
    await loadFolders();
    await saveTo(state.folders.find((f) => f.id === id), item);
  };
  menu.appendChild(nb);

  // Abre embaixo do botão; se não couber, em cima.
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menu.style.top = `${r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  anchor.setAttribute('aria-expanded', 'true');
  menu.querySelector('button')?.focus();
}

async function saveTo(folder, item) {
  closeMenu();
  try {
    await invoke('add_to_folder', { id: folder.id, entry: entryFor(item) });
    toast(`Salvo em ${folder.name}`);
    await loadFolders();
    applySourceMode();
    if (folderId() === folder.id) load(true);
  } catch (e) {
    fail('Não deu para salvar na pasta')(e);
  }
}

$('d-folder').addEventListener('click', (e) => {
  e.stopPropagation();
  openMenu(state.current, $('d-folder')).catch(fail('Não deu para listar as pastas'));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#folder-menu') && !e.target.closest('[data-folder]') && e.target !== $('d-folder') && !e.target.closest('#d-folder')) closeMenu();
});
$('main').addEventListener('scroll', closeMenu);
window.addEventListener('resize', closeMenu);

$('d-remove').addEventListener('click', async () => {
  const item = state.current;
  const folder = state.folders.find((f) => f.id === folderId());
  try {
    await invoke('remove_from_folder', { id: folder.id, entry: item.entry });
    if (folder.id === FAVORITES) state.favorites.delete(item.id);
    toast(`Removido de ${folder.name}`);
    showList();
    await loadFolders();
    applySourceMode();
    load(true);
  } catch (e) {
    fail('Não deu para remover')(e);
  }
});

// ---------- Ações da pasta ----------
// Menu "⋯" ao lado do nome: exportar, renomear e apagar.
function closeFolderOpts() {
  $('folder-opts').hidden = true;
  $('folder-more').setAttribute('aria-expanded', 'false');
}
$('folder-more').addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = $('folder-opts');
  if (!menu.hidden) return closeFolderOpts();
  menu.hidden = false;
  const r = $('folder-more').getBoundingClientRect();
  menu.style.left = `${Math.max(8, r.right - menu.offsetWidth)}px`;
  menu.style.top = `${r.bottom + 6}px`;
  $('folder-more').setAttribute('aria-expanded', 'true');
  menu.querySelector('button:not([hidden]):not(:disabled)')?.focus();
});
$('folder-opts').addEventListener('click', closeFolderOpts);

// Botão direito numa pasta da barra lateral: abre a pasta e mostra o mesmo menu no cursor.
$('sidebar').addEventListener('contextmenu', async (e) => {
  const item = e.target.closest('.side-item[data-source^="folder:"]');
  if (!item) return;
  e.preventDefault();
  if (state.collection !== item.dataset.source) {
    openSource(item.dataset.source);
    await new Promise(requestAnimationFrame);
  }
  const menu = $('folder-opts');
  menu.hidden = false;
  menu.style.left = `${Math.min(e.clientX, innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${Math.min(e.clientY, innerHeight - menu.offsetHeight - 8)}px`;
  $('folder-more').setAttribute('aria-expanded', 'true');
  menu.querySelector('button:not([hidden]):not(:disabled)')?.focus();
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#folder-opts, #folder-more')) closeFolderOpts();
});
$('main').addEventListener('scroll', closeFolderOpts);

$('folder-rename').addEventListener('click', () => {
  const folder = state.folders.find((f) => f.id === folderId());
  modal({
    title: 'Renomear pasta',
    ok: 'Renomear',
    body: nameField(folder.name),
    onOk: async (form) => {
      await invoke('rename_folder', { id: folder.id, name: form.elements.name.value });
      await loadFolders();
      applySourceMode();
      toast('Pasta renomeada');
    },
  });
});

$('folder-delete').addEventListener('click', () => {
  const folder = state.folders.find((f) => f.id === folderId());
  modal({
    title: `Apagar “${folder.name}”?`,
    text: 'A pasta sai da lista. Os ícones continuam nas coleções e em outras pastas.',
    ok: 'Apagar pasta',
    danger: true,
    onOk: async () => {
      await invoke('delete_folder', { id: folder.id });
      setCollection('');
      await loadFolders();
      load(true);
      toast('Pasta apagada');
    },
  });
});

$('folder-export').addEventListener('click', () => exportModal());

// Exporta a pasta aberta inteira, ou só `entries` (seleção).
function exportModal(entries = null) {
  const folder = state.folders.find((f) => f.id === folderId()) ?? { id: '', name: 'Meus ícones', count: 0 };
  const count = entries ? entries.length : folder.count;
  const radio = (name, value, label, checked) =>
    `<label><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}>${label}</label>`;
  modal({
    title: entries ? `Exportar ${plural(count, 'ícone selecionado', 'ícones selecionados')}` : `Exportar “${folder.name}”`,
    text: `${plural(count, 'ícone', 'ícones')}, cada um com a cor, a espessura e o tamanho com que foi salvo.`,
    ok: 'Exportar',
    body: (el) => {
      el.innerHTML = `
        <fieldset><legend>Formato</legend><div class="choices">
          ${radio('formats', 'svg', 'SVG', state.exportFormats === 'svg')}
          ${radio('formats', 'png', 'PNG', state.exportFormats === 'png')}
          ${radio('formats', 'both', 'SVG + PNG', state.exportFormats === 'both')}
        </div></fieldset>
        <fieldset style="margin-top:12px"><legend>Entregar como</legend><div class="choices">
          ${radio('zip', '1', 'Arquivo .zip', state.exportZip)}
          ${radio('zip', '0', 'Pasta', !state.exportZip)}
        </div></fieldset>`;
    },
    onOk: async (form) => {
      state.exportFormats = form.elements.formats.value;
      state.exportZip = form.elements.zip.value === '1';
      persist();
      const path = await invoke('export_folder', { id: folder.id, formats: state.exportFormats, zip: state.exportZip, entries });
      if (path) toast(`Exportado: ${path.split(/[\\/]/).pop()}`);
    },
  });
}

// ---------- Seleção (pastas e Meus ícones) ----------
// Onde dá para selecionar: dentro de uma pasta ou em Meus ícones.
const selectMode = () => (folderId() ? 'folder' : state.collection === 'custom' ? 'custom' : null);
const selectable = (item) => !!item && (!!item.entry || (selectMode() === 'custom' && item.id.startsWith('custom:')));
function renderSelection() {
  document.querySelectorAll('.tile').forEach((t) => {
    const on = state.selected.has(Number(t.dataset.index));
    t.classList.toggle('selected', on);
    t.querySelector('[data-sel]')?.setAttribute('aria-checked', String(on));
  });
  const n = state.selected.size;
  $('selbar').hidden = n === 0;
  $('grid').classList.toggle('selecting', n > 0);
  $('sel-count').textContent = n === 1 ? '1 selecionado' : `${n} selecionados`;
  const custom = selectMode() === 'custom';
  $('sel-edit').hidden = custom;
  $('sel-move').hidden = custom;
  $('sel-dup').querySelector('span').textContent = custom ? 'Adicionar à pasta' : 'Copiar para';
  $('sel-dup').title = custom ? 'Adicionar os selecionados a uma pasta' : 'Copiar para outra pasta';
  $('sel-remove').querySelector('span').textContent = custom ? 'Apagar' : 'Remover';
  $('sel-remove').title = custom ? 'Apagar os ícones importados' : 'Remover desta pasta';
}
function toggleSelect(index) {
  if (state.selected.has(index)) state.selected.delete(index);
  else state.selected.add(index);
  state.lastPicked = index;
  renderSelection();
}

// Seleção por retângulo: clicar num espaço vazio da pasta e arrastar.
let marquee = null;
$('list-view').addEventListener('mousedown', (e) => {
  if (e.button !== 0 || !selectMode() || e.target.closest('.tile, button, input, .folder-bar, .state')) return;
  e.preventDefault();
  const additive = e.metaKey || e.ctrlKey || e.shiftKey;
  if (!additive) clearSelection();
  const box = document.createElement('div');
  box.className = 'marquee';
  document.body.appendChild(box);
  marquee = { x: e.clientX, y: e.clientY + $('main').scrollTop, box, base: new Set(state.selected), lastY: e.clientY };
});
function updateMarquee(clientX, clientY) {
  const main = $('main');
  const y0 = marquee.y - main.scrollTop;
  const left = Math.min(marquee.x, clientX), right = Math.max(marquee.x, clientX);
  const top = Math.min(y0, clientY), bottom = Math.max(y0, clientY);
  const m = main.getBoundingClientRect();
  Object.assign(marquee.box.style, {
    left: `${left}px`, width: `${right - left}px`,
    top: `${Math.max(top, m.top)}px`, height: `${Math.max(0, Math.min(bottom, m.bottom) - Math.max(top, m.top))}px`,
  });
  state.selected = new Set(marquee.base);
  document.querySelectorAll('.tile').forEach((t) => {
    const r = t.getBoundingClientRect();
    if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) state.selected.add(Number(t.dataset.index));
  });
  renderSelection();
}
window.addEventListener('mousemove', (e) => {
  if (!marquee) return;
  marquee.lastX = e.clientX;
  marquee.lastY = e.clientY;
  updateMarquee(e.clientX, e.clientY);
});
// Rola a lista quando o retângulo encosta em cima ou embaixo.
setInterval(() => {
  if (!marquee) return;
  const m = $('main').getBoundingClientRect();
  const dy = marquee.lastY > m.bottom - 24 ? 14 : marquee.lastY < m.top + 24 ? -14 : 0;
  if (!dy) return;
  $('main').scrollTop += dy;
  updateMarquee(marquee.lastX ?? marquee.x, marquee.lastY);
}, 30);
window.addEventListener('mouseup', () => {
  if (!marquee) return;
  marquee.box.remove();
  marquee = null;
});
// Shift+clique: seleciona do último clicado até este (mantém o ponto de partida).
function selectRange(a, b, replace = false) {
  if (replace) state.selected.clear();
  for (let i = Math.min(a, b); i <= Math.max(a, b); i++) state.selected.add(i);
  state.lastPicked = a;
  renderSelection();
}
function clearSelection() {
  state.selected.clear();
  state.lastPicked = null;
  if ($('selbar')) renderSelection();
}
const selectedEntries = () =>
  [...state.selected].sort((a, b) => a - b).map((i) => state.items[i].entry ?? entryFor(state.items[i]));

async function afterBatch(message) {
  clearSelection();
  await loadFolders();
  applySourceMode();
  load(true);
  toast(message);
}

$('sel-clear').addEventListener('click', clearSelection);
$('sel-all').addEventListener('click', () => {
  state.items.forEach((_, i) => state.selected.add(i));
  renderSelection();
});

$('sel-remove').addEventListener('click', () => {
  const entries = selectedEntries();
  if (selectMode() === 'custom') {
    return modal({
      title: `Apagar ${plural(entries.length, 'ícone importado', 'ícones importados')}?`,
      text: 'Eles saem de Meus ícones e de todas as pastas. Os arquivos originais no seu computador não são afetados.',
      ok: 'Apagar',
      danger: true,
      onOk: async () => {
        for (const e of entries) await invoke('delete_custom', { id: e.icon });
        for (const e of entries) state.favorites.delete(e.icon);
        await refreshSources();
        await afterBatch(plural(entries.length, 'ícone apagado', 'ícones apagados'));
      },
    });
  }
  const folder = state.folders.find((f) => f.id === folderId());
  modal({
    title: `Remover ${plural(entries.length, 'ícone', 'ícones')} de “${folder.name}”?`,
    text: 'Eles saem só desta pasta. Continuam nas coleções e em outras pastas.',
    ok: 'Remover',
    danger: true,
    onOk: async () => {
      await invoke('remove_entries', { id: folder.id, entries });
      await afterBatch(`${plural(entries.length, 'ícone removido', 'ícones removidos')}`);
    },
  });
});

$('sel-copy').addEventListener('click', async () => {
  try {
    const n = await invoke('copy_entries_svg', { entries: selectedEntries() });
    toast(`${plural(n, 'SVG copiado', 'SVGs copiados')}. Cole no Figma.`);
  } catch (e) {
    fail('Não deu para copiar')(e);
  }
});

$('sel-export').addEventListener('click', () => exportModal(selectedEntries()));

// Mover ou copiar para outra pasta (ou para uma nova).
function transferModal(remove) {
  const entries = selectedEntries();
  const from = folderId();
  const custom = !from;
  const others = state.folders.filter((f) => f.id !== from);
  modal({
    title: custom ? `Adicionar ${plural(entries.length, 'ícone', 'ícones')} à pasta…` : `${remove ? 'Mover' : 'Copiar'} ${plural(entries.length, 'ícone', 'ícones')} para…`,
    text: custom
      ? 'Eles continuam em Meus ícones e entram na pasta escolhida com a cor e o tamanho da barra de baixo.'
      : remove ? 'Eles saem desta pasta e vão para a escolhida.' : 'Eles continuam aqui e ganham uma cópia na pasta escolhida, com os mesmos ajustes.',
    ok: custom ? 'Adicionar' : remove ? 'Mover' : 'Copiar',
    body: (el) => {
      el.innerHTML = `<fieldset class="picks">
        ${others.map((f) => `<label class="pick"><input type="radio" name="dest" value="${f.id}"><span></span></label>`).join('')}
        <label class="pick"><input type="radio" name="dest" value="__new"${others.length ? '' : ' checked'}><span>Nova pasta</span></label>
      </fieldset>`;
      el.querySelectorAll('.pick span').forEach((sp, i) => { if (others[i]) sp.textContent = (others[i].id === FAVORITES ? '★ ' : '') + others[i].name; });
      const first = el.querySelector('input[name="dest"]');
      if (first && others.length) first.checked = true;
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'name';
      input.maxLength = 60;
      input.placeholder = 'Nome da pasta nova';
      input.setAttribute('aria-label', 'Nome da pasta nova');
      input.disabled = others.length > 0;
      el.querySelector('.picks').appendChild(input);
      el.addEventListener('change', () => {
        input.disabled = el.querySelector('input[name="dest"]:checked').value !== '__new';
        if (!input.disabled) input.focus();
      });
    },
    onOk: async (form) => {
      let to = form.elements.dest.value;
      if (to === '__new') to = await invoke('create_folder', { name: form.elements.name.value });
      if (custom) await invoke('add_many_to_folder', { id: to, entries });
      else await invoke('transfer_entries', { from, to, entries, remove });
      const name = to === FAVORITES ? 'Favoritos' : (state.folders.find((f) => f.id === to)?.name ?? form.elements.name.value);
      const verb = custom ? (entries.length === 1 ? 'adicionado' : 'adicionados') : remove ? (entries.length === 1 ? 'movido' : 'movidos') : (entries.length === 1 ? 'copiado' : 'copiados');
      await afterBatch(`${plural(entries.length, 'ícone', 'ícones')} ${verb} ${custom ? 'a' : 'para'} ${name}`);
    },
  });
}
$('sel-move').addEventListener('click', () => transferModal(true));
$('sel-dup').addEventListener('click', () => transferModal(false));

// Editar ajustes em lote: cor, tamanho e espessura; cada um pode ficar como está.
$('sel-edit').addEventListener('click', () => {
  const entries = selectedEntries();
  const first = entries[0];
  const same = (k) => entries.every((e) => e[k] === first[k]);
  const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024, 2048];
  const strokes = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3];
  modal({
    title: `Editar ${plural(entries.length, 'ícone', 'ícones')}`,
    text: 'Só muda o que você alterar. O resto fica como está em cada ícone.',
    ok: 'Aplicar',
    body: (el) => {
      el.innerHTML = `
        <div class="batch">
          <label class="batch-row"><span>Cor</span>
            <span class="batch-color">
              <span class="batch-sw"><input type="color" name="color" value="${same('color') ? first.color : '#000000'}" aria-label="Escolher cor"></span>
              <input type="text" name="hex" maxlength="7" value="" placeholder="Manter${same('color') ? ` (${first.color.toUpperCase()})` : ''}" aria-label="Cor nova em HEX">
            </span>
          </label>
          <div class="batch-presets" role="group" aria-label="Cores prontas">
            ${PRESETS.map((h) => `<button type="button" class="cp-sw" data-hex="${h}" style="--sw:${h}" aria-label="${h.toUpperCase()}" title="${h.toUpperCase()}"></button>`).join('')}
          </div>
          <label class="batch-row"><span>Tamanho</span>
            <select name="size"><option value="">Manter${same('size') ? ` (${first.size}px)` : ''}</option>${sizes.map((x) => `<option value="${x}">${x}px</option>`).join('')}</select>
          </label>
          <label class="batch-row"><span>Espessura</span>
            <select name="stroke"><option value="">Manter</option><option value="orig">Padrão do ícone</option>${strokes.map((x) => `<option value="${x}">${x.toLocaleString('pt-BR')} px</option>`).join('')}</select>
          </label>
        </div>`;
      const picker = el.querySelector('[name="color"]');
      const hex = el.querySelector('[name="hex"]');
      const sw = el.querySelector('.batch-sw');
      const pick = (v) => {
        picker.value = v;
        hex.value = v.toUpperCase();
        sw.style.background = v;
        el.querySelectorAll('.batch-presets .cp-sw').forEach((b) => b.classList.toggle('on', b.dataset.hex === v));
      };
      sw.style.background = picker.value;
      picker.addEventListener('input', () => pick(picker.value));
      hex.addEventListener('input', () => {
        const v = normHex(hex.value);
        if (v) { picker.value = v; sw.style.background = v; }
      });
      el.querySelectorAll('.batch-presets .cp-sw').forEach((b) => b.addEventListener('click', () => pick(b.dataset.hex)));
    },
    onOk: async (form) => {
      const change = {};
      if (form.elements.hex.value.trim()) {
        const v = normHex(form.elements.hex.value);
        if (!v) throw 'Cor inválida. Use um código HEX, como FF6140.';
        change.color = v;
      }
      if (form.elements.size.value) change.size = Number(form.elements.size.value);
      const st = form.elements.stroke.value;
      if (st === 'orig') change.stroke = null;
      else if (st) change.stroke = Number(st);
      if (!Object.keys(change).length) throw 'Nada para mudar. Escolha uma cor, um tamanho ou uma espessura.';
      await invoke('update_entries', { id: folderId(), entries, change });
      await afterBatch(`${plural(entries.length, 'ícone atualizado', 'ícones atualizados')}`);
    },
  });
});

// ---------- Detalhe ----------
function showDetail(item) {
  state.current = item;
  closeMenu();
  $('list-view').hidden = true;
  $('detail-view').hidden = false;
  $('viewbar').hidden = true;
  $('back').hidden = false;
  $('filters').hidden = true;
  $('main').scrollTop = 0;
  $('d-name').textContent = item.name;
  const prefix = item.id.split(':')[0];
  const parts = [item.collection, STYLE_LABEL[item.style]];
  if (prefix !== 'custom') parts.push(`licença ${item.license}`);
  $('d-source').textContent = parts.join(' · ');
  $('d-delete').hidden = prefix !== 'custom';
  $('d-remove').hidden = !item.entry;
  const note = $('d-saved-note');
  note.hidden = !item.entry;
  if (item.entry) {
    const e = item.entry;
    const stroke = e.stroke == null ? 'traço padrão' : `traço ${e.stroke.toLocaleString('pt-BR')}`;
    note.textContent = `Salvo com ${e.color.toUpperCase()}, ${stroke}, ${e.size}px. Copiar, salvar e arrastar usam esses ajustes.`;
  }
  $('preview').innerHTML = item.svg;
  $('preview').style.setProperty('--icon-color', item.entry ? screenColor(item.entry.color) : '');
  if (!item.entry) $('preview').style.removeProperty('--icon-color');
  renderFavButton();
}

async function refreshDetail() {
  const item = state.current;
  if (!item || item.entry) return;
  const svg = await invoke('preview', { id: item.id, stroke: state.stroke }).catch(() => null);
  if (svg && state.current === item) $('preview').innerHTML = svg;
}

let listScroll = 0;
function showList() {
  state.current = null;
  closeMenu();
  $('detail-view').hidden = true;
  $('viewbar').hidden = false;
  $('list-view').hidden = false;
  $('back').hidden = true;
  applySourceMode();
  $('main').scrollTop = listScroll;
}
$('back').addEventListener('click', showList);

async function copyCurrent(item = state.current) {
  if (!item) return;
  const png = state.format === 'png';
  try {
    await invoke(png ? 'copy_png' : 'copy_svg', { id: item.id, opts: itemOpts(item), size: sizeOf(item) });
    toast(png ? 'PNG copiado' : 'SVG copiado. Cole no Figma ou Illustrator.');
  } catch (e) {
    fail('Não deu para copiar')(e);
  }
}
$('d-copy').addEventListener('click', () => copyCurrent());

$('d-save').addEventListener('click', async () => {
  const item = state.current;
  try {
    const ok = await invoke('save_icon', { id: item.id, opts: itemOpts(item), format: state.format, size: sizeOf(item) });
    if (ok) toast(state.format === 'png' ? 'PNG salvo' : 'SVG salvo');
  } catch (e) {
    fail('Não deu para salvar')(e);
  }
});

$('d-delete').addEventListener('click', () => {
  const item = state.current;
  modal({
    title: `Apagar “${item.name}”?`,
    text: 'O ícone sai de Meus ícones e de todas as pastas. O arquivo original no seu computador não é afetado.',
    ok: 'Apagar ícone',
    danger: true,
    onOk: async () => {
      await invoke('delete_custom', { id: item.id });
      state.favorites.delete(item.id);
      toast('Ícone apagado');
      showList();
      await refreshSources();
      load(true);
    },
  });
});

// ---------- Clique x arrastar ----------
// Segurar e mover arrasta o arquivo para outro app; clique simples abre o detalhe.
let press = null;
let draggingOut = false;

function onPress(e, getItem) {
  if (e.button !== 0 || e.target.closest('[data-star], [data-folder], [data-sel]')) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  const item = getItem(e);
  if (item) press = { x: e.clientX, y: e.clientY, item };
}
window.addEventListener('mousemove', (e) => {
  if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
  const { item } = press;
  press = null;
  draggingOut = true;
  setTimeout(() => (draggingOut = false), 1500);
  invoke('start_drag', { id: item.id, opts: itemOpts(item), format: state.format, size: sizeOf(item) }).catch(
    fail('Não deu para arrastar'),
  );
});
window.addEventListener('mouseup', () => (press = null));

const tileItem = (e) => {
  const tile = e.target.closest('.tile');
  return tile ? state.items[Number(tile.dataset.index)] : null;
};
$('grid').addEventListener('mousedown', (e) => onPress(e, tileItem));
$('grid').addEventListener('click', (e) => {
  const item = tileItem(e);
  if (!item) return;
  if (e.target.closest('[data-star]')) return toggleFavorite(item);
  const folderBtn0 = e.target.closest('[data-folder]');
  if (selectable(item) && !folderBtn0 && !e.target.closest('[data-star]')) {
    // Na pasta, como no Windows/Finder: clique seleciona, duplo clique abre.
    const index = Number(e.target.closest('.tile').dataset.index);
    if (e.target.closest('[data-sel]') || e.metaKey || e.ctrlKey) return toggleSelect(index);
    if (e.shiftKey) return selectRange(state.lastPicked ?? index, index, true);
    state.selected.clear();
    return toggleSelect(index);
  }
  const folderBtn = e.target.closest('[data-folder]');
  if (folderBtn) return openMenu(item, folderBtn).catch(fail('Não deu para listar as pastas'));
  listScroll = $('main').scrollTop;
  showDetail(item);
});
$('grid').addEventListener('dblclick', (e) => {
  const item = tileItem(e);
  if (!selectable(item) || e.target.closest('[data-star], [data-folder], [data-sel]')) return;
  clearSelection();
  listScroll = $('main').scrollTop;
  showDetail(item);
});
$('preview').addEventListener('mousedown', (e) => onPress(e, () => state.current));

// ---------- Importar ----------
async function importDialog() {
  try {
    afterImport(await invoke('import_dialog'), true);
  } catch (e) {
    fail('Não deu para importar')(e);
  }
}
$('import').addEventListener('click', importDialog);

// Depois de importar, pergunta em qual pasta de projeto guardar.
async function afterImport({ ids, suggestion }, fromDialog = false) {
  if (!ids.length) {
    if (!fromDialog) toast('Nenhum SVG válido encontrado. Só arquivos .svg são aceitos.', 'error');
    return;
  }
  await refreshSources();
  if (!$('detail-view').hidden) showList();
  const count = ids.length === 1 ? '1 ícone importado' : `${ids.length} ícones importados`;
  const userFolders = state.folders.filter((f) => f.id !== FAVORITES);
  let opened = 'custom';

  modal({
    title: count,
    text: 'Eles já estão em Meus ícones. Quer guardar também numa pasta de projeto?',
    ok: 'Guardar',
    body: (el) => {
      const opt = (value, label, checked) =>
        `<label class="pick"><input type="radio" name="dest" value="${value}"${checked ? ' checked' : ''}><span></span></label>`;
      el.innerHTML = `<fieldset class="picks">
        ${opt('__new', '', true)}
        ${userFolders.map((f) => opt(f.id, '', false)).join('')}
        ${opt('', '', false)}
      </fieldset>`;
      const labels = el.querySelectorAll('.pick span');
      labels[0].textContent = 'Nova pasta';
      userFolders.forEach((f, i) => (labels[i + 1].textContent = f.name));
      labels[labels.length - 1].textContent = 'Só em Meus ícones';
      // Campo do nome logo abaixo de "Nova pasta".
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'name';
      input.maxLength = 60;
      input.placeholder = 'Nome da pasta';
      input.value = suggestion ?? '';
      input.setAttribute('aria-label', 'Nome da nova pasta');
      el.querySelector('.pick').after(input);
      el.addEventListener('change', () => {
        input.disabled = el.querySelector('input[name="dest"]:checked').value !== '__new';
      });
    },
    onOk: async (form) => {
      let dest = form.elements.dest.value;
      if (dest === '__new') dest = await invoke('create_folder', { name: form.elements.name.value });
      if (dest) {
        const entries = ids.map((icon) => ({ icon, color: state.color, stroke: null, size: state.size }));
        await invoke('add_many_to_folder', { id: dest, entries });
        await loadFolders();
        opened = `folder:${dest}`;
        toast(`Guardado em ${state.folders.find((f) => f.id === dest)?.name ?? 'pasta'}`);
      }
    },
  });
  // Fechando de qualquer jeito, abre onde os ícones foram parar.
  $('modal').addEventListener('close', () => openSource(opened), { once: true });
}

// Arrastar arquivos do computador: para uma pasta da barra lateral, ou para a
// área de ícones com uma pasta aberta, entram direto nessa pasta.
document.querySelector('.content').appendChild($('drop'));
let dropTarget = null;

function dropTargetAt(pos) {
  if (!pos) return null;
  // No Mac a posição já vem em pontos de tela; no Windows, em pixels físicos.
  const ratio = navigator.userAgent.includes('Mac') ? 1 : window.devicePixelRatio || 1;
  const el = document.elementFromPoint(pos.x / ratio, pos.y / ratio);
  const side = el?.closest('.side-item[data-source^="folder:"]');
  if (side) return { id: side.dataset.source.slice(7), el: side };
  if (el?.closest('.content') && folderId()) return { id: folderId(), el: null };
  return null;
}

function showDropTarget(pos) {
  const target = dropTargetAt(pos);
  document.querySelectorAll('.side-item.drop-target').forEach((x) => x.classList.remove('drop-target'));
  dropTarget = target;
  if (target?.el) {
    // Em cima de uma pasta da barra lateral: só a pasta acende.
    target.el.classList.add('drop-target');
    $('drop').hidden = true;
    return;
  }
  const folder = target && state.folders.find((f) => f.id === target.id);
  $('drop-text').textContent = folder ? `Soltar em ${folder.name}` : 'Solte para importar seus SVGs';
  $('drop').hidden = false;
}

function clearDrop() {
  $('drop').hidden = true;
  document.querySelectorAll('.side-item.drop-target').forEach((x) => x.classList.remove('drop-target'));
}

async function importInto(id, paths) {
  const { ids } = await invoke('import_files', { paths });
  if (!ids.length) return toast('Nenhum SVG válido encontrado. Só arquivos .svg são aceitos.', 'error');
  const entries = ids.map((icon) => ({ icon, color: state.color, stroke: null, size: state.size }));
  await invoke('add_many_to_folder', { id, entries });
  await refreshSources();
  const name = state.folders.find((f) => f.id === id)?.name ?? 'pasta';
  toast(`${ids.length === 1 ? '1 ícone importado' : `${ids.length} ícones importados`} em ${name}`);
  if (folderId() === id && $('detail-view').hidden) load(true);
}

appWindow.onDragDropEvent(async ({ payload }) => {
  if (draggingOut) return;
  if (payload.type === 'enter' || payload.type === 'over') showDropTarget(payload.position);
  else if (payload.type === 'leave') clearDrop();
  else if (payload.type === 'drop') {
    const target = dropTargetAt(payload.position) ?? dropTarget;
    clearDrop();
    dropTarget = null;
    try {
      if (target) await importInto(target.id, payload.paths);
      else afterImport(await invoke('import_files', { paths: payload.paths }));
    } catch (e) {
      fail('Não deu para importar')(e);
    }
  }
});

// ---------- Teclado ----------
window.addEventListener('keydown', (e) => {
  if ($('modal').open) return;
  const mod = e.metaKey || e.ctrlKey;
  if ((mod && e.key === 'f') || (e.key === '/' && document.activeElement !== $('q'))) {
    e.preventDefault();
    $('q').focus();
    $('q').select();
  } else if (e.key === 'Escape') {
    if (state.selected.size) clearSelection();
    else if (!$('color-pop').hidden) closeColorPop();
    else if (!$('folder-opts').hidden) closeFolderOpts();
    else if (!$('sets-menu').hidden) closeSets();
    else if (!$('folder-menu').hidden) closeMenu();
    else if (document.documentElement.classList.contains('side-open')) setSidebar(false);
    else if (!$('detail-view').hidden) showList();
  } else if (mod && e.key === 'a' && selectMode() && $('detail-view').hidden && !document.activeElement.matches('input, textarea')) {
    e.preventDefault();
    state.items.forEach((_, i) => state.selected.add(i));
    renderSelection();
  } else if (mod && e.key === 'd' && state.current) {
    e.preventDefault();
    toggleFavorite(state.current);
  }
});

// O menu Editar > Copiar (Cmd+C) dispara "copy"; no detalhe, copia o ícone.
document.addEventListener('copy', (e) => {
  const typing = document.activeElement?.matches('input, textarea');
  if (!state.current || typing || window.getSelection().toString()) return;
  e.preventDefault();
  copyCurrent();
});

// ---------- Menu nativo ----------
function exportCurrentFolder() {
  if (!folderId()) return toast('Abra uma pasta para exportar', 'error');
  if (!$('detail-view').hidden) showList();
  $('folder-export').click();
}
window.__TAURI__.event.listen('menu', ({ payload }) => {
  if ($('modal').open) return;
  if (payload.startsWith('open:')) return openSource(payload.slice(5));
  ({
    'new-folder': newFolderAndOpen,
    import: importDialog,
    export: exportCurrentFolder,
    'toggle-sidebar': () => setSidebar(!sidebarOpen()),
    'focus-search': () => { $('q').focus(); $('q').select(); },
    'theme-auto': () => setTheme('auto'),
    'theme-light': () => setTheme('light'),
    'theme-dark': () => setTheme('dark'),
    account: () => (state.account ? accountModal() : loginModal()),
    sync: () => (state.account ? syncNow() : loginModal()),
  })[payload]?.();
});

// ---------- Conta e sincronização ----------
const ICON_USER = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.2 3.9-5 7-5s5.8 1.8 7 5"/></svg>';
const ICON_OK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_BUSY = '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.35-5.65M20 4v4h-4"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/></svg>';

state.account = null;
let syncTimer;
let lastSync = 0;
let syncError = '';

function setSyncStatus(kind, text) {
  const el = $('sync-status');
  el.className = `sync-status ${kind}`;
  el.innerHTML = `${{ ok: ICON_OK, busy: ICON_BUSY, error: ICON_OFF }[kind] ?? ''}<span></span>`;
  el.querySelector('span').textContent = text;
}

function renderAccount() {
  const on = !!state.account;
  $('account').classList.toggle('on', on);
  $('avatar').innerHTML = on ? '' : ICON_USER;
  $('avatar').textContent = on ? state.account.email.slice(0, 1) : '';
  if (!on) $('avatar').innerHTML = ICON_USER;
  $('account-name').textContent = on ? state.account.email : 'Entrar';
  $('account-btn').title = on ? 'Sua conta' : 'Entrar para sincronizar';
  if (!on) setSyncStatus('', 'Para sincronizar suas pastas');
}

async function refreshAccount() {
  state.account = await invoke('account');
  renderAccount();
}

async function syncNow() {
  if (!state.account) return false;
  clearTimeout(syncTimer);
  setSyncStatus('busy', 'Sincronizando…');
  try {
    const { changed } = await invoke('sync_now');
    lastSync = Date.now();
    syncError = '';
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setSyncStatus('ok', `Sincronizado às ${time}`);
    if (changed) {
      await refreshSources(true);
      if ($('detail-view').hidden) load(true);
    }
    return true;
  } catch (e) {
    syncError = String(e);
    await refreshAccount();
    if (!state.account) {
      toast(syncError, 'error');
      return false;
    }
    setSyncStatus('error', syncError.startsWith('Sem conexão') ? 'Sem conexão. Tenta de novo sozinho.' : 'Não sincronizou. Clique para ver.');
    return false;
  }
}

// Depois de qualquer mudança, sincroniza em seguida (agrupando mudanças rápidas).
function scheduleSync() {
  if (!state.account) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}
setInterval(syncNow, 5 * 60 * 1000);
window.addEventListener('focus', () => {
  if (Date.now() - lastSync > 60 * 1000) syncNow();
});

const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4M6.6 6.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const APP_MARK = '<svg class="logo" viewBox="0 0 1000 1000" aria-hidden="true"><rect width="1000" height="1000" rx="220" class="logo-bg"/><path class="logo-fg" fill-rule="evenodd" d="M239.348 648.876 C239.348 504.923 356.046 388.225 500 388.225 C643.954 388.225 760.652 504.923 760.652 648.876 C760.652 792.83 643.954 909.528 500 909.528 C356.046 909.528 239.348 792.83 239.348 648.876 Z M396.951 579.422 C358.593 579.422 327.497 610.518 327.497 648.876 C327.497 687.235 358.593 718.331 396.951 718.331 C435.31 718.331 466.406 687.235 466.406 648.876 C466.406 610.518 435.31 579.422 396.951 579.422 Z M603.049 579.422 C564.69 579.422 533.594 610.518 533.594 648.876 C533.594 687.235 564.69 718.331 603.049 718.331 C641.407 718.331 672.503 687.235 672.503 648.876 C672.503 610.518 641.407 579.422 603.049 579.422 Z"/></svg>';

function passwordField(name, label, autocomplete, placeholder = '') {
  return `<label class="field-label">${label}
    <span class="pw">
      <input type="password" name="${name}" minlength="6" required autocomplete="${autocomplete}" placeholder="${placeholder}">
      <button type="button" class="eye" aria-label="Mostrar senha" title="Mostrar senha">${EYE}</button>
    </span>
  </label>`;
}

function loginModal(create = false) {
  let mode = create;
  let body;
  const render = () => {
    const email = body.querySelector('input[name="email"]')?.value ?? '';
    body.innerHTML = `
      <div class="auth">
        <div class="auth-mark">${APP_MARK}</div>
        <h3 class="auth-title">${mode ? 'Crie sua conta' : 'Entre no IconHub'}</h3>
        <p class="auth-sub">Suas pastas, favoritos e ícones importados em qualquer computador.</p>
        <div class="segmented auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected="${!mode}" aria-checked="${!mode}" data-mode="0">Entrar</button>
          <button type="button" role="tab" aria-selected="${mode}" aria-checked="${mode}" data-mode="1">Criar conta</button>
        </div>
        <div class="auth-fields">
          <label class="field-label">E-mail<input type="email" name="email" autocomplete="email" required placeholder="voce@email.com"></label>
          ${passwordField('password', 'Senha', mode ? 'new-password' : 'current-password', mode ? 'Pelo menos 6 caracteres' : '')}
          ${mode ? passwordField('confirm', 'Repita a senha', 'new-password') : ''}
        </div>
      </div>`;
    body.querySelector('input[name="email"]').value = email;
    body.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        mode = b.dataset.mode === '1';
        $('modal-error').textContent = '';
        render();
        body.querySelector(email ? 'input[name="password"]' : 'input[name="email"]').focus();
      }),
    );
    body.querySelectorAll('.eye').forEach((b) =>
      b.addEventListener('click', () => {
        const input = b.previousElementSibling;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        b.innerHTML = show ? EYE_OFF : EYE;
        b.setAttribute('aria-label', show ? 'Esconder senha' : 'Mostrar senha');
        b.title = b.getAttribute('aria-label');
        input.focus();
      }),
    );
    $('modal-ok').textContent = mode ? 'Criar conta' : 'Entrar';
  };

  modal({
    title: '',
    ok: mode ? 'Criar conta' : 'Entrar',
    body: (el) => {
      body = el;
      render();
    },
    onOk: async (form) => {
      const password = form.elements.password.value;
      if (mode && password !== form.elements.confirm.value) throw 'As senhas não são iguais.';
      const result = await invoke('sign_in', { email: form.elements.email.value, password, create: mode });
      await refreshAccount();
      await switchedProfile();
      toast(mode ? 'Conta criada. Sincronizando…' : 'Pronto, você entrou. Sincronizando…');
      // Depois de fechar esta janela: baixa a conta e, se for a 1ª vez aqui, pergunta sobre o local.
      $('modal').addEventListener('close', async () => {
        await syncNow();
        if (result.local) mergeModal(result.local);
      }, { once: true });
    },
  });
  $('modal').classList.add('auth-modal');
  $('modal').addEventListener('close', () => $('modal').classList.remove('auth-modal'), { once: true });
  body.querySelector('input[name="email"]').focus();
}

function accountModal() {
  const n = (x) => x.toLocaleString('pt-BR');
  const folders = state.folders.filter((f) => f.id !== FAVORITES).length;
  const favs = state.folders.find((f) => f.id === FAVORITES)?.count ?? 0;
  const icons = state.collections.find((c) => c.prefix === 'custom')?.count ?? 0;
  const status = $('sync-status');
  const statusKind = status.classList.contains('error') ? 'error' : status.classList.contains('busy') ? 'busy' : 'ok';
  const row = (act, icon, title, desc, extra = '') =>
    `<button type="button" class="acc-row ${extra}" data-act="${act}">
      <span class="acc-ic">${icon}</span>
      <span class="acc-tx"><span class="acc-t">${title}</span><span class="acc-d">${desc}</span></span>
      <svg class="acc-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
    </button>`;
  const KEY = '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/></svg>';
  const OUT = '<svg viewBox="0 0 24 24"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"/></svg>';

  modal({
    title: '',
    ok: 'Fechar',
    body: (el) => {
      el.innerHTML = `
        <div class="acc">
          <button type="button" class="acc-close" aria-label="Fechar">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
          <div class="acc-head">
            <span class="acc-avatar" aria-hidden="true"></span>
            <div class="acc-who">
              <span class="acc-label">Conectado como</span>
              <span class="acc-email"></span>
              <span class="acc-status ${statusKind}"></span>
            </div>
          </div>
          <dl class="acc-stats">
            <div><dt>Pastas</dt><dd>${n(folders)}</dd></div>
            <div><dt>Favoritos</dt><dd>${n(favs)}</dd></div>
            <div><dt>Importados</dt><dd>${n(icons)}</dd></div>
          </dl>
          ${syncError ? '<p class="acc-error" role="alert"></p>' : ''}
          <div class="acc-list">
            ${row('sync', ICON_BUSY, 'Sincronizar agora', 'Envia e recebe as mudanças desta conta')}
            ${row('password', KEY, 'Trocar senha', 'Vale para todos os computadores')}
          </div>
          <div class="acc-list">
            ${row('out', OUT, 'Sair da conta', 'Os dados saem deste computador e continuam na nuvem', 'danger')}
          </div>
        </div>`;
      el.querySelector('.acc-avatar').textContent = state.account.email.slice(0, 1).toUpperCase();
      el.querySelector('.acc-email').textContent = state.account.email;
      el.querySelector('.acc-status').innerHTML = status.innerHTML;
      if (syncError) el.querySelector('.acc-error').textContent = syncError;
      el.querySelector('.acc-close').onclick = () => $('modal').close();
      el.querySelector('[data-act="sync"]').onclick = () => { $('modal').close(); syncNow(); };
      el.querySelector('[data-act="password"]').onclick = () => { $('modal').close(); passwordModal(); };
      el.querySelector('[data-act="out"]').onclick = () => { $('modal').close(); signOutFlow(); };
    },
    onOk: async () => {},
  });
  $('modal').classList.add('account-modal');
  $('modal').addEventListener('close', () => $('modal').classList.remove('account-modal'), { once: true });
  $('modal').querySelector('.acc-row').focus();
}

// Perfil trocou (entrou ou saiu): recarrega tudo e volta para "Todos os ícones" se a pasta aberta sumiu.
async function switchedProfile() {
  await refreshSources(true);
  if (!$('detail-view').hidden) showList();
  if (folderId() && !state.folders.some((f) => f.id === folderId())) setCollection('');
  load(true);
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function mergeModal(local) {
  const parts = [];
  if (local.folders) parts.push(plural(local.folders, 'pasta', 'pastas'));
  if (local.favorites) parts.push(plural(local.favorites, 'favorito', 'favoritos'));
  if (local.icons) parts.push(plural(local.icons, 'ícone importado', 'ícones importados'));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}` : parts[0];
  modal({
    title: 'Levar o que está neste computador?',
    text: `Você tem ${list} sem conta neste computador. Quer levar para a sua conta? Pastas com o mesmo nome são unidas; nada é apagado.`,
    ok: 'Levar para a conta',
    body: (el) => {
      el.innerHTML = '<p style="font-size:13px;color:var(--muted)">Se escolher não levar, eles continuam aqui e voltam a aparecer quando você sair da conta.</p>';
    },
    onOk: async () => {
      await invoke('merge_local');
      await switchedProfile();
      toast('Levado para a sua conta');
      syncNow();
    },
  });
  $('modal-cancel').textContent = 'Deixar só no computador';
  $('modal').addEventListener('close', () => ($('modal-cancel').textContent = 'Cancelar'), { once: true });
}

async function signOutFlow() {
  // Envia o que falta antes de apagar os dados da conta deste computador.
  const sent = await syncNow();
  const leave = async () => {
    await invoke('sign_out');
    await refreshAccount();
    await switchedProfile();
    toast('Você saiu. Seus dados continuam na sua conta.');
  };
  if (sent) return leave().catch(fail('Não deu para sair'));
  modal({
    title: 'Sair sem sincronizar?',
    text: 'Não deu para enviar as últimas mudanças para a nuvem. Se sair agora, o que não foi enviado será perdido, porque os dados da conta são apagados deste computador.',
    ok: 'Sair mesmo assim',
    danger: true,
    onOk: leave,
  });
}

function passwordModal() {
  modal({
    title: 'Trocar senha',
    ok: 'Trocar senha',
    body: (el) => {
      el.innerHTML = '<label class="field-label">Senha nova<input type="password" name="password" minlength="6" required autocomplete="new-password" placeholder="Pelo menos 6 caracteres"></label>';
    },
    onOk: async (form) => {
      await invoke('change_password', { password: form.elements.password.value });
      toast('Senha trocada');
    },
  });
}

$('account-btn').addEventListener('click', () => (state.account ? accountModal() : loginModal()));

// ---------- Início ----------
async function refreshSources(skipSync = false) {
  await loadCollections();
  await loadFolders(skipSync);
  applySourceMode();
}

document.documentElement.classList.toggle('side-off', !state.sidebar);
document.documentElement.classList.toggle('mac', navigator.userAgent.includes('Mac'));
applyTheme();
setStyle(state.style);
renderStroke();
applyColor();
applyFormat();
applyTile();
applyView();
refreshAccount()
  .catch(() => {})
  .then(() => refreshSources())
  .catch(fail('Não deu para listar as coleções'))
  .finally(() => load(true));
$('q').focus();
