// Prototipo: tres formas de sumar panel/leyenda al visor (lista de lotes con
// filtros, lugares cercanos, ficha integrada, contacto fijo, link por lote y
// una bienvenida liviana en vez del modal de 5 pasos).
//
// Panorama y polígonos reales de paseo-frankfurt/demoloteo; nombres, medidas
// y estados de los lotes son de ejemplo (leyenda-assets/demoloteo.json).
// Uso: /leyenda?v=1|2|3  (&m=1 marco de celular, &lote=N abre un lote)

import { Viewer, EquirectangularAdapter } from '@photo-sphere-viewer/core';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import '../src/index.css';
import './leyenda.css';
import { annotationsToMarkers, STATUS_FILL_COLORS } from '../src/annotations.js';
import data from './leyenda-assets/demoloteo.json';

// ---------------------------------------------------------------- datos

const lots = data.lots;
const pois = data.pois;
const lotById = new Map(lots.map((l) => [l.uuid, l]));
const poiById = new Map(pois.map((p) => [p.uuid, p]));
const labels = new Map(lots.map((l) => [l.uuid, String(l.number)]));

const STATUS = ['available', 'reserved', 'sold', 'unavailable'];
const STATUS_LABEL = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido', unavailable: 'No disponible' };
const STATUS_PLURAL = { available: 'Disponibles', reserved: 'Reservados', sold: 'Vendidos', unavailable: 'No disponibles' };
const SIZES = [['all', 'Todas'], ['s', 'Hasta 350 m²'], ['m', '350–450 m²'], ['l', 'Más de 450 m²']];
const SERVICE_LABEL = { water: 'Agua', electricity: 'Luz', gas: 'Gas', lighting: 'Alumbrado', security: 'Seguridad', waste: 'Recolección' };
const SERVICE_STATE = { available: 'Listo', in_progress: 'En obra', unavailable: 'Pendiente' };
const SHARE_BASE = `${location.origin}/paseo-frankfurt/demoloteo`;

const countBy = (status) => lots.filter((l) => l.status === status).length;
const AVAILABLE = countBy('available');

// ---------------------------------------------------------------- estado

const params = new URLSearchParams(location.search);
const state = {
  version: [1, 2, 3].includes(Number(params.get('v'))) ? Number(params.get('v')) : 1,
  phone: params.get('m') === '1',
  onlyAvailable: false,
  size: 'all',
  query: '',
  selectedId: null,
  hoverId: null,
  tab: 'lotes',          // v1: lotes | cerca | proyecto ; v2/v3: lotes | cerca
  sheet: 'peek',         // v1 celular: peek | half | full
  collapsed: false,      // v1 escritorio
  cmdOpen: false,        // v2
  stage: 0,
  view: '360',
  notified: new Set(),   // "avisame" ya pedido
};

function sizeOk(l) {
  if (state.size === 's') return l.area_m2 <= 350;
  if (state.size === 'm') return l.area_m2 > 350 && l.area_m2 <= 450;
  if (state.size === 'l') return l.area_m2 > 450;
  return true;
}
function queryOk(l) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  const n = q.replace(/[^0-9]/g, '');
  if (n) return String(l.number) === n || String(l.number).startsWith(n);
  return `lote ${l.number} manzana ${l.manzana}`.includes(q);
}
const visibleLots = () => lots.filter((l) => (!state.onlyAvailable || l.status === 'available') && sizeOk(l) && queryOk(l));
const filtersActive = () => state.onlyAvailable || state.size !== 'all' || state.query.trim() !== '';
const selectedLot = () => (state.selectedId ? lotById.get(state.selectedId) : null);

function similarTo(lot) {
  return lots
    .filter((l) => l.status === 'available' && l.uuid !== lot.uuid)
    .sort((a, b) => Math.abs(a.area_m2 - lot.area_m2) - Math.abs(b.area_m2 - lot.area_m2))
    .slice(0, 3);
}

// ---------------------------------------------------------------- iconos

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  prev: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  share: svg('<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  expand: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  home: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  check: svg('<path d="M5 12.5 10 17l9-10"/>'),
  ruler: svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  compassArrow: svg('<path d="M12 3 7 21l5-4 5 4z" fill="currentColor" stroke="none"/>'),
  hand: svg('<path d="M9 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V5a1.5 1.5 0 0 1 3 0v6"/><path d="M15 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.3-2.2 6-6 6-2.4 0-3.6-.8-4.6-2.2L4.8 14a1.4 1.4 0 0 1 2-2l2.2 2"/>'),
  whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>`,
};

// ---------------------------------------------------------------- piezas compartidas

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const brand = () => `
  <div class="brand">
    <span class="brand-mark" aria-hidden="true">PF</span>
    <span class="brand-txt"><b>${esc(data.project.name)}</b><small>${esc(data.project.loteo)}</small></span>
  </div>`;

const seg = (action, items, current, cls = '') => `
  <div class="seg ${cls}">${items.map(([value, label]) =>
    `<button type="button" data-action="${action}" data-value="${value}" aria-pressed="${String(value) === String(current)}">${label}</button>`).join('')}</div>`;

const stageSeg = (cls) => seg('stage', data.stages.map((s, i) => [i, s.name]), state.stage, cls);
const viewSeg = (cls) => seg('view', [['360', '360°'], ['plano', 'Plano'], ['sat', 'Satélite']], state.view, cls);

function legend(compact = false) {
  return `<div class="legend ${compact ? 'legend--compact' : ''}" aria-label="Referencias de estado">${STATUS.map((s) =>
    `<span class="lg"><i class="dot s-${s}"></i>${compact ? STATUS_LABEL[s] : STATUS_PLURAL[s]}${compact ? '' : ` <b>${countBy(s)}</b>`}</span>`).join('')}</div>`;
}

function filterChips({ withSizes = true } = {}) {
  return `<div class="chips">
    <button type="button" class="chip chip--avail" data-action="toggle-available" aria-pressed="${state.onlyAvailable}"><i class="dot s-available"></i>Solo disponibles</button>
    ${withSizes ? SIZES.map(([v, l]) => `<button type="button" class="chip" data-action="size" data-value="${v}" aria-pressed="${state.size === v}">${l}</button>`).join('') : ''}
  </div>`;
}

function counter() {
  const vis = visibleLots();
  if (filtersActive()) return `<p class="counter"><b>${vis.length}</b> ${vis.length === 1 ? 'lote' : 'lotes'} con estos filtros · <button type="button" class="link" data-action="clear-filters">Limpiar</button></p>`;
  return `<p class="counter"><b>${AVAILABLE}</b> disponibles de ${lots.length} lotes</p>`;
}

const lotRow = (l) => `
  <button type="button" class="lot-row ${l.uuid === state.selectedId ? 'is-sel' : ''}" data-lot="${l.uuid}">
    <span class="lot-num s-${l.status}">${l.number}</span>
    <span class="lot-main"><b>Lote ${l.number}</b><small>Manzana ${l.manzana} · ${l.frente} × ${l.fondo} m</small></span>
    <span class="lot-side"><b>${l.area_m2} m²</b><small class="st s-${l.status}">${STATUS_LABEL[l.status]}</small></span>
  </button>`;

function lotList() {
  const vis = visibleLots();
  if (!vis.length) return `<div class="empty"><p>Ningún lote coincide.</p><button type="button" class="btn btn--ghost" data-action="clear-filters">Limpiar filtros</button></div>`;
  return `<div class="lot-list">${vis.map(lotRow).join('')}</div>`;
}

const poiRow = (p) => `
  <button type="button" class="poi-row" data-poi="${p.uuid}">
    <img src="${p.image_url}" alt="" loading="lazy" />
    <span class="poi-main"><b>${esc(p.tooltip)}</b><small>${esc(p.category)}</small></span>
    <span class="poi-dist">${p.distance_value} ${p.distance_unit}<small>en auto</small></span>
  </button>`;

const poiList = () => `<p class="hint-line">Tocá un lugar para verlo en la foto.</p><div class="poi-list">${pois.slice().sort((a, b) => a.distance_value - b.distance_value).map(poiRow).join('')}</div>`;

const services = () => `<ul class="services">${data.services.map((s) =>
  `<li class="sv sv--${s.estado}"><span>${SERVICE_LABEL[s.tipo] ?? s.tipo}</span><small>${SERVICE_STATE[s.estado] ?? s.estado}</small></li>`).join('')}</ul>`;

const projectInfo = () => `
  <div class="proj">
    <h3 class="sub">Servicios</h3>
    ${services()}
    <h3 class="sub">Referencias</h3>
    ${legend()}
    <h3 class="sub">Ubicación</h3>
    <button type="button" class="btn btn--ghost btn--block" data-action="view" data-value="sat">${I.pin}Ver en vista satelital</button>
  </div>`;

function ficha({ back = false, close = true } = {}) {
  const l = selectedLot();
  if (!l) return '';
  const vis = visibleLots();
  const i = vis.findIndex((x) => x.uuid === l.uuid);
  const hasNav = i !== -1 && vis.length > 1;
  const avail = l.status === 'available';
  const notified = state.notified.has(l.uuid);
  return `
  <article class="ficha" data-status="${l.status}" aria-labelledby="ficha-title">
    ${back ? `<button type="button" class="ficha-back" data-action="close-lot">${I.back}${state.tab === 'cerca' ? 'Lugares cercanos' : 'Todos los lotes'}</button>` : ''}
    <header class="ficha-head">
      <span class="lot-num lot-num--lg s-${l.status}">${l.number}</span>
      <div class="ficha-title">
        <small>Manzana ${l.manzana}</small>
        <h2 id="ficha-title">Lote ${l.number}</h2>
      </div>
      <div class="ficha-tools">
        <button type="button" class="icon-btn" data-action="share" aria-label="Copiar link del lote">${I.share}</button>
        ${close ? `<button type="button" class="icon-btn" data-action="close-lot" aria-label="Cerrar ficha">${I.close}</button>` : ''}
      </div>
    </header>
    <span class="st-pill s-${l.status}"><i class="dot s-${l.status}"></i>${STATUS_LABEL[l.status]}</span>
    <dl class="ficha-grid">
      <div><dt>Superficie</dt><dd>${l.area_m2} m²</dd></div>
      <div><dt>Medidas</dt><dd>${l.frente} × ${l.fondo} m</dd></div>
      <div><dt>Orientación</dt><dd>${l.orientation}</dd></div>
      <div><dt>Precio</dt><dd class="muted">A consultar</dd></div>
    </dl>
    ${avail ? `
      <div class="ficha-cta">
        <button type="button" class="btn btn--primary btn--block" data-action="contact" data-value="form">Quiero info de este lote</button>
        <button type="button" class="btn btn--wa btn--block" data-action="contact" data-value="wa">${I.whatsapp}Consultar por WhatsApp</button>
      </div>` : `
      <div class="ficha-alt">
        <p class="alt-note">Este lote está <b>${STATUS_LABEL[l.status].toLowerCase()}</b>. Estos son parecidos y están disponibles:</p>
        <div class="lot-list lot-list--compact">${similarTo(l).map(lotRow).join('')}</div>
        ${notified
          ? `<p class="alt-done">${I.check}Listo, te avisamos si se libera.</p>`
          : `<button type="button" class="btn btn--ghost btn--block" data-action="notify">${I.bell}Avisame si se libera</button>`}
      </div>`}
    <details class="ficha-more">
      <summary>Servicios del loteo</summary>
      ${services()}
    </details>
    ${hasNav ? `
      <nav class="ficha-nav" aria-label="Otros lotes">
        <button type="button" data-action="step-lot" data-value="-1">${I.prev}Lote ${vis[(i - 1 + vis.length) % vis.length].number}</button>
        <span>${i + 1} de ${vis.length}</span>
        <button type="button" data-action="step-lot" data-value="1">Lote ${vis[(i + 1) % vis.length].number}${I.next}</button>
      </nav>` : ''}
  </article>`;
}

const mapControls = (cls = '') => `
  <div class="map-ctrl ${cls}" role="group" aria-label="Controles de la vista">
    <button type="button" data-action="zoom-in" aria-label="Acercar">${I.plus}</button>
    <button type="button" data-action="zoom-out" aria-label="Alejar">${I.minus}</button>
    <button type="button" data-action="reset-view" aria-label="Volver a la vista inicial">${I.home}</button>
    <button type="button" data-action="fullscreen" aria-label="Pantalla completa">${I.expand}</button>
  </div>`;

// ---------------------------------------------------------------- render por slots

const app = document.getElementById('app');
const ui = document.getElementById('ui');

// Solo reescribe un slot si cambió su HTML: así no se pierde el scroll de las
// listas ni se reinician transiciones en cada actualización.
function fill(name, html) {
  for (const el of ui.querySelectorAll(`[data-slot="${name}"]`)) {
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }
}

const isNarrow = () => app.clientWidth <= 720;

// ---------------------------------------------------------------- versión 1: panel

const V1 = {
  shell: () => `
    <aside class="v1-panel" aria-label="Panel del loteo">
      <div class="sheet-grab" data-drag aria-hidden="true"><span></span></div>
      <header class="v1-head">
        ${brand()}
        <button type="button" class="icon-btn only-desk" data-action="collapse" aria-label="Ocultar panel">${I.prev}</button>
        <button type="button" class="icon-btn icon-btn--wa only-phone" data-action="contact" data-value="wa" aria-label="WhatsApp">${I.whatsapp}</button>
      </header>
      <button type="button" class="v1-peek only-phone" data-action="sheet" data-value="half">
        <span><b>${AVAILABLE} lotes disponibles</b> de ${lots.length}</span>
        <span class="v1-peek-cta">Ver lotes ${I.up}</span>
      </button>
      <div class="v1-nav">
        <div class="v1-controls">${stageSeg('seg--fill')}${viewSeg('seg--fill')}</div>
        <nav class="tabs" role="tablist">
          <button type="button" role="tab" data-action="tab" data-value="lotes" data-slot="tab-lotes"></button>
          <button type="button" role="tab" data-action="tab" data-value="cerca">Cerca <span class="tab-n">${pois.length}</span></button>
          <button type="button" role="tab" data-action="tab" data-value="proyecto">Proyecto</button>
        </nav>
        <label class="v1-search" data-only-tab="lotes">
          ${I.search}
          <input type="search" inputmode="numeric" placeholder="Buscar lote por número" aria-label="Buscar lote" data-input="query" />
          <button type="button" class="v1-search-clear" data-action="clear-query" aria-label="Borrar búsqueda">${I.close}</button>
        </label>
      </div>
      <div class="v1-body">
        <section class="v1-pane" data-pane="lotes">
          <div data-slot="counter"></div>
          <div data-slot="legend"></div>
          <div data-slot="filters"></div>
          <div data-slot="list"></div>
        </section>
        <section class="v1-pane" data-pane="cerca">${poiList()}</section>
        <section class="v1-pane" data-pane="proyecto">${projectInfo()}</section>
        <section class="v1-ficha" data-slot="ficha"></section>
      </div>
      <footer class="v1-foot">
        <button type="button" class="btn btn--wa btn--block" data-action="contact" data-value="wa">${I.whatsapp}Hablar con un asesor</button>
      </footer>
    </aside>
    <button type="button" class="v1-reopen" data-action="collapse">${I.next}<b>${AVAILABLE}</b> disponibles</button>
    ${mapControls('v1-ctrl')}
    <div class="onb-layer" data-onb></div>`,

  update() {
    app.dataset.sheet = state.sheet;
    app.dataset.collapsed = state.collapsed ? '1' : '0';
    for (const t of ui.querySelectorAll('.v1-panel [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.value === state.tab));
    for (const p of ui.querySelectorAll('.v1-pane')) p.hidden = p.dataset.pane !== state.tab;
    for (const el of ui.querySelectorAll('[data-only-tab]')) el.hidden = el.dataset.onlyTab !== state.tab;
    const input = ui.querySelector('[data-input=query]');
    if (input && input.value !== state.query) input.value = state.query;
    input?.parentElement.classList.toggle('has-value', state.query !== '');
    fill('tab-lotes', `Lotes <span class="tab-n">${visibleLots().length}</span>`);
    fill('counter', counter());
    fill('legend', legend());
    fill('filters', filterChips());
    fill('list', lotList());
    fill('ficha', ficha({ back: true, close: false }));
  },

  insets() {
    if (isNarrow()) return { bottom: sheetPx(state.sheet), top: 0, left: 0, right: 0 };
    return { left: state.collapsed ? 0 : 396, top: 0, right: 0, bottom: 0 };
  },

  onSelect() {
    if (isNarrow() && state.sheet === 'peek') state.sheet = 'half';
    state.collapsed = false;
  },

  onboarding() {
    // Pista de gesto liviana + la cámara se mece sola un poco: muestra que la
    // foto se mueve sin tapar nada ni pedir "Continuar".
    showGestureHint({
      title: 'Arrastrá para mirar alrededor',
      sub: 'Tocá un lote para ver su ficha',
      after: () => pulse(isNarrow() ? '.sheet-grab' : '.v1-panel [data-value="lotes"]'),
    });
    sway();
  },
};

function sheetPx(snap) {
  const H = app.clientHeight;
  if (snap === 'full') return H - 64;
  if (snap === 'half') return Math.round(H * 0.56);
  return 148;
}

// ---------------------------------------------------------------- versión 2: flotante

const V2 = {
  shell: () => `
    <div class="v2-brand glass">
      ${brand()}
      ${stageSeg('seg--dark seg--sm')}
    </div>
    <div class="v2-tr">
      ${viewSeg('seg--dark')}
    </div>
    <div class="v2-legend glass">${legend(true)}</div>
    <div class="v2-dock">
      <div class="v2-results glass" id="v2-results">
        <nav class="tabs tabs--dark" role="tablist">
          <button type="button" role="tab" data-action="tab" data-value="lotes" data-slot="tab-lotes"></button>
          <button type="button" role="tab" data-action="tab" data-value="cerca">Lugares cercanos <span class="tab-n">${pois.length}</span></button>
          <button type="button" class="icon-btn icon-btn--dark tabs-close" data-action="cmd-close" aria-label="Cerrar">${I.close}</button>
        </nav>
        <div class="v2-pane" data-pane="lotes">
          <div data-slot="filters"></div>
          <div data-slot="list"></div>
        </div>
        <div class="v2-pane" data-pane="cerca">${poiList()}</div>
      </div>
      <div class="v2-bar glass">
        <label class="v2-search">${I.search}<input type="search" inputmode="numeric" placeholder="Buscar lote por número" aria-label="Buscar lote" data-input="query" /></label>
        <button type="button" class="v2-bar-btn" data-action="cmd-toggle" aria-controls="v2-results" data-slot="bar-count"></button>
      </div>
    </div>
    <aside class="v2-ficha" data-slot="ficha" aria-live="polite"></aside>
    <button type="button" class="v2-fab" data-action="contact" data-value="wa">${I.whatsapp}<span>Consultar</span></button>
    ${mapControls('map-ctrl--dark v2-ctrl')}
    <div class="onb-layer" data-onb></div>`,

  update() {
    app.dataset.cmd = state.cmdOpen ? '1' : '0';
    for (const t of ui.querySelectorAll('.v2-results [role=tab]')) t.setAttribute('aria-selected', String(t.dataset.value === state.tab));
    for (const p of ui.querySelectorAll('.v2-pane')) p.hidden = p.dataset.pane !== state.tab;
    const input = ui.querySelector('[data-input=query]');
    if (input && input.value !== state.query) input.value = state.query;
    fill('tab-lotes', `Lotes <span class="tab-n">${visibleLots().length}</span>`);
    fill('bar-count', `<i class="dot s-available"></i><b>${filtersActive() ? visibleLots().length : AVAILABLE}</b><span>${filtersActive() ? 'resultados' : 'disponibles'}</span>${I.up}`);
    fill('filters', `${counter()}${filterChips()}`);
    fill('list', lotList());
    fill('ficha', ficha());
  },

  insets() {
    const sel = !!state.selectedId;
    if (isNarrow()) return { bottom: sel ? Math.round(app.clientHeight * 0.5) : 96, top: 70, left: 0, right: 0 };
    return { right: sel ? 396 : 0, bottom: 84, top: 70, left: 0 };
  },

  onSelect() { state.cmdOpen = false; },

  onboarding() {
    // Coach marks sobre la interfaz real: 3 globitos cortos, salteables.
    coachMarks([
      { target: '.psv-marker--lot-badge', text: 'Cada número es un lote. Tocalo para ver medidas y estado.', fallback: 'center' },
      { target: '.v2-bar', text: 'Buscá un lote por número o filtrá por tamaño y estado.' },
      { target: '.v2-fab', text: '¿Dudas? Escribinos por WhatsApp cuando quieras.' },
    ]);
  },
};

// ---------------------------------------------------------------- versión 3: carrusel

const V3 = {
  shell: () => `
    <header class="v3-top">
      ${brand()}
      <div class="v3-chips" data-slot="chips"></div>
      <div class="v3-top-r">
        ${stageSeg('seg--sm')}
        ${viewSeg('seg--sm')}
        <button type="button" class="btn btn--wa btn--sm only-desk" data-action="contact" data-value="wa">${I.whatsapp}Contacto</button>
      </div>
    </header>
    <section class="v3-rail" aria-label="Lotes">
      <div class="v3-rail-head">
        <div class="seg seg--sm v3-mode">
          <button type="button" data-action="tab" data-value="lotes" data-slot="mode-lotes"></button>
          <button type="button" data-action="tab" data-value="cerca" aria-pressed="false">Cerca</button>
        </div>
        <div class="v3-legend only-desk">${legend(true)}</div>
        <button type="button" class="btn btn--wa btn--sm only-phone" data-action="contact" data-value="wa">${I.whatsapp}Contacto</button>
      </div>
      <div class="v3-cards" data-slot="cards" tabindex="-1"></div>
    </section>
    <aside class="v3-ficha" data-slot="ficha"></aside>
    ${mapControls('v3-ctrl')}
    <div class="onb-layer" data-onb></div>`,

  update() {
    for (const b of ui.querySelectorAll('.v3-mode button')) b.setAttribute('aria-pressed', String(b.dataset.value === state.tab));
    fill('mode-lotes', `Lotes <span class="tab-n">${visibleLots().length}</span>`);
    fill('chips', `${filterChips()}`);
    fill('cards', state.tab === 'cerca' ? pois.map(poiCard).join('') : (visibleLots().map(lotCard).join('') || `<div class="empty empty--card"><p>Ningún lote coincide.</p><button type="button" class="btn btn--ghost btn--sm" data-action="clear-filters">Limpiar filtros</button></div>`));
    for (const c of ui.querySelectorAll('.v3-card[data-lot]')) c.classList.toggle('is-sel', c.dataset.lot === state.selectedId);
    fill('ficha', ficha());
  },

  insets() {
    const sel = !!state.selectedId;
    if (isNarrow()) return { top: 112, bottom: sel ? Math.round(app.clientHeight * 0.62) : 214, left: 0, right: 0 };
    return { top: 64, bottom: 206, left: sel ? 404 : 0, right: 0 };
  },

  onSelect(id) {
    const card = ui.querySelector(`.v3-card[data-lot="${id}"]`);
    if (card) scrollCardIntoView(card);
  },

  onboarding() {
    // Vuelo de presentación: arranca abierto y se acerca a la vista inicial
    // mientras aparece el nombre; después queda una pista corta sobre las tarjetas.
    introFlight();
  },
};

const lotCard = (l) => `
  <button type="button" class="v3-card ${l.uuid === state.selectedId ? 'is-sel' : ''}" data-lot="${l.uuid}" data-hover="${l.uuid}">
    <span class="v3-card-top"><span class="lot-num s-${l.status}">${l.number}</span><small class="st s-${l.status}">${STATUS_LABEL[l.status]}</small></span>
    <b>Lote ${l.number}</b>
    <span class="v3-card-meta">${l.area_m2} m² · ${l.frente} × ${l.fondo} m</span>
    <span class="v3-card-foot">Manzana ${l.manzana}<span>Ver ${I.next}</span></span>
  </button>`;

const poiCard = (p) => `
  <button type="button" class="v3-card v3-card--poi" data-poi="${p.uuid}">
    <img src="${p.image_url}" alt="" loading="lazy" />
    <span class="v3-poi-txt"><b>${esc(p.tooltip)}</b><small>${esc(p.category)} · ${p.distance_value} ${p.distance_unit} en auto</small></span>
  </button>`;

function scrollCardIntoView(card) {
  const rail = card.parentElement;
  const left = card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2;
  rail.scrollTo({ left, behavior: 'smooth' });
}

const VERSIONS = { 1: V1, 2: V2, 3: V3 };
const V = () => VERSIONS[state.version];

// ---------------------------------------------------------------- visor

const viewerEl = document.getElementById('viewer');
const viewer = new Viewer({
  container: viewerEl,
  adapter: EquirectangularAdapter,
  panorama: data.panorama.url,
  plugins: [MarkersPlugin.withConfig({ markers: [] })],
  navbar: false,
  defaultYaw: data.panorama.homeYaw,
  defaultPitch: data.panorama.homePitch,
  defaultZoomLvl: 50,
  mousewheel: true,
  loadingTxt: '',
});
const markers = viewer.getPlugin(MarkersPlugin);
let ready = false;

viewer.addEventListener('load-progress',({ progress }) => {
  document.querySelector('.ld-txt').textContent = `Cargando panorama… ${Math.round(progress)}%`;
});

viewer.addEventListener('ready', () => {
  ready = true;
  document.getElementById('loading').classList.add('done');
  syncMarkers();
  const n = Number(params.get('lote'));
  const fromUrl = lots.find((l) => l.number === n);
  if (fromUrl) setTimeout(() => selectLot(fromUrl.uuid), 400);
  else setTimeout(() => V().onboarding(), 500);
}, { once: true });

const baseMarkers = annotationsToMarkers([...lots, ...pois], 2, null, false, labels, 'status_ring', true);

// Los markers se rearman en cada cambio (18 lotes, barato): el lote elegido
// queda resaltado en dorado y lo que no pasa los filtros se apaga.
let lastMarkerKey = '';
function syncMarkers() {
  if (!ready) return;
  const visible = new Set(visibleLots().map((l) => l.uuid));
  const key = `${state.selectedId}|${state.hoverId}|${[...visible].join(',')}|${filtersActive()}`;
  if (key === lastMarkerKey) return;
  lastMarkerKey = key;
  const dimOn = filtersActive();
  const next = baseMarkers.map((m) => {
    const [uuid, kind] = String(m.id).split('__');
    const lot = lotById.get(uuid);
    if (!lot) return m;
    const sel = uuid === state.selectedId;
    const hov = uuid === state.hoverId;
    const dim = dimOn && !visible.has(uuid) && !sel;
    if (!kind) {
      const fill = sel ? 'rgba(232,196,120,0.55)' : dim ? 'rgba(10,10,10,0.42)' : hov ? 'rgba(255,255,255,0.32)' : STATUS_FILL_COLORS[lot.status];
      return { ...m, svgStyle: { ...m.svgStyle, fill } };
    }
    if (kind === 'border') {
      return { ...m, svgStyle: { ...m.svgStyle, stroke: sel ? '#f3d38c' : dim ? 'rgba(255,255,255,0.3)' : m.svgStyle.stroke, strokeWidth: sel || hov ? '3.5' : m.svgStyle.strokeWidth } };
    }
    if (kind === 'badge') return { ...m, style: { ...m.style, opacity: dim ? 0.28 : 1 } };
    return m;
  });
  markers.setMarkers(next);
}

markers.addEventListener('select-marker', ({ marker }) => {
  const [uuid] = String(marker.id).split('__');
  if (lotById.has(uuid)) selectLot(uuid);
  else if (poiById.has(uuid)) flyToPoi(uuid);
});

const DEG = Math.PI / 180;

// Vuela a una posición dejando el punto en el centro de la zona que no tapa
// la interfaz (cada versión informa cuánto ocupa por lado).
function flyTo(pos, { zoom = 64, speed = 1100 } = {}) {
  const ins = V().insets();
  const W = app.clientWidth;
  const H = app.clientHeight;
  const vFov = viewer.dataHelper.zoomLevelToFov(zoom);
  const hFov = viewer.dataHelper.vFovToHFov(vFov);
  const dx = (ins.left - ins.right) / 2;
  const dy = (ins.top - ins.bottom) / 2;
  const yaw = pos.yaw - (dx / W) * hFov * DEG;
  const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pos.pitch + (dy / H) * vFov * DEG));
  viewer.animate({ yaw, pitch, zoom, speed });
}

function flyToLot(id, opts) {
  const m = markers.getMarker(id);
  if (m?.state?.position) flyTo(m.state.position, opts);
}

function flyToPoi(id) {
  const m = markers.getMarker(id);
  if (m?.state?.position) flyTo(m.state.position, { zoom: 40 });
  if (state.version === 3) {
    const card = ui.querySelector(`.v3-card[data-poi="${id}"]`);
    if (card) scrollCardIntoView(card);
  }
}

// ---------------------------------------------------------------- acciones

function selectLot(id) {
  state.selectedId = id;
  V().onSelect?.(id);
  update();
  dismissOnboarding();
  requestAnimationFrame(() => flyToLot(id));
}

function closeLot() {
  state.selectedId = null;
  if (state.version === 1 && isNarrow()) state.sheet = 'half';
  update();
}

function update() {
  app.dataset.v = String(state.version);
  app.dataset.selected = state.selectedId ? '1' : '0';
  V().update();
  syncMarkers();
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams();
  p.set('v', state.version);
  if (state.phone) p.set('m', '1');
  const l = selectedLot();
  if (l) p.set('lote', l.number);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function mount() {
  dismissOnboarding(true);
  ui.className = `ui v${state.version}`;
  ui.innerHTML = V().shell();
  for (const el of ui.querySelectorAll('[data-slot]')) el._html = null;
  for (const b of document.querySelectorAll('[data-proto=v]')) b.setAttribute('aria-pressed', String(Number(b.dataset.value) === state.version));
  update();
}

let toastTimer;
function toast(html, ms = 2600) {
  const t = document.getElementById('toast');
  t.innerHTML = html;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}

function contact(kind) {
  const l = selectedLot();
  if (kind === 'form') {
    toast(`Acá se abre el formulario de contacto, ya con el <b>Lote ${l.number}</b> cargado.`);
    return;
  }
  const msg = l
    ? `Hola, me interesa el Lote ${l.number} (Manzana ${l.manzana}, ${l.area_m2} m²) de ${data.project.loteo}. ${SHARE_BASE}?lote=${l.number}`
    : `Hola, quiero más información sobre ${data.project.loteo}. ${SHARE_BASE}`;
  toast(`<span class="toast-k">Se abre WhatsApp con:</span>“${esc(msg)}”`, 4200);
}

async function share() {
  const l = selectedLot();
  const url = l ? `${SHARE_BASE}?lote=${l.number}` : SHARE_BASE;
  try { await navigator.clipboard.writeText(url); } catch { /* prototipo: igual se muestra */ }
  toast(`Link copiado: <b>${esc(url.replace(/^https?:\/\//, ''))}</b>`);
}

function stepLot(dir) {
  const vis = visibleLots();
  const i = vis.findIndex((x) => x.uuid === state.selectedId);
  if (i === -1 || !vis.length) return;
  selectLot(vis[(i + dir + vis.length) % vis.length].uuid);
}

function setView(v) {
  if (v === 'sat') { toast('La vista satelital ya existe en el visor; en el prototipo no se carga.'); return; }
  state.view = v;
  const plano = document.getElementById('plano');
  plano.hidden = v !== 'plano';
  if (v === 'plano') {
    plano.querySelector('img').src = data.blueprintUrl;
    toast('En el prototipo el plano es solo la imagen.');
  }
  update();
}

const ACTIONS = {
  'toggle-available': () => { state.onlyAvailable = !state.onlyAvailable; },
  size: (v) => { state.size = v; },
  'clear-filters': () => { state.onlyAvailable = false; state.size = 'all'; state.query = ''; },
  'clear-query': () => { state.query = ''; ui.querySelector('[data-input=query]')?.focus(); },
  tab: (v) => {
    state.tab = v;
    if (state.version === 1 && isNarrow() && state.sheet === 'peek') state.sheet = 'half';
    if (state.version === 2) state.cmdOpen = true;
    if (state.selectedId && state.version !== 2) state.selectedId = null;
  },
  sheet: (v) => { state.sheet = v; },
  collapse: () => { state.collapsed = !state.collapsed; },
  'close-lot': () => closeLot(),
  'step-lot': (v) => stepLot(Number(v)),
  share: () => share(),
  contact: (v) => contact(v),
  notify: () => { state.notified.add(state.selectedId); toast('Te avisamos por WhatsApp si este lote se libera.'); },
  stage: (v) => {
    state.stage = Number(v);
    if (state.stage !== 0) toast('Prototipo: solo está cargada la Etapa 1.');
  },
  view: (v) => setView(v),
  'cmd-toggle': () => { state.cmdOpen = !state.cmdOpen; if (state.cmdOpen) state.selectedId = null; },
  'cmd-close': () => { state.cmdOpen = false; },
  'zoom-in': () => viewer.zoomIn(),
  'zoom-out': () => viewer.zoomOut(),
  'reset-view': () => viewer.animate({ yaw: data.panorama.homeYaw, pitch: data.panorama.homePitch, zoom: 50, speed: 900 }),
  fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : app.requestFullscreen?.()),
};

ui.addEventListener('click', (e) => {
  const lotEl = e.target.closest('[data-lot]');
  if (lotEl) { selectLot(lotEl.dataset.lot); return; }
  const poiEl = e.target.closest('[data-poi]');
  if (poiEl) {
    if (state.version === 1 && isNarrow()) state.sheet = 'peek';
    if (state.version === 2 && isNarrow()) state.cmdOpen = false;
    update();
    requestAnimationFrame(() => flyToPoi(poiEl.dataset.poi));
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a || !ACTIONS[a.dataset.action]) return;
  ACTIONS[a.dataset.action](a.dataset.value);
  update();
});

ui.addEventListener('input', (e) => {
  if (e.target.dataset.input !== 'query') return;
  state.query = e.target.value;
  if (state.version === 2) state.cmdOpen = true;
  state.tab = 'lotes';
  update();
});
ui.addEventListener('focusin', (e) => {
  // En celular el teclado tapa media pantalla: la hoja sube al máximo.
  if (e.target.dataset.input === 'query' && state.version === 1 && isNarrow() && state.sheet !== 'full') { state.sheet = 'full'; update(); }
  if (e.target.dataset.input === 'query' && state.version === 2 && !state.cmdOpen) { state.cmdOpen = true; state.selectedId = null; update(); }
});
ui.addEventListener('keydown', (e) => {
  if (e.target.dataset.input === 'query' && e.key === 'Enter') {
    const first = visibleLots()[0];
    if (first) selectLot(first.uuid);
  }
});

// Hover de tarjetas/filas → resalta el lote en la foto (escritorio).
ui.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-lot]');
  const id = el && e.pointerType === 'mouse' ? el.dataset.lot : null;
  if (id !== state.hoverId) { state.hoverId = id; syncMarkers(); }
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, textarea')) return;
  if (e.key === 'Escape') {
    if (onbActive) dismissOnboarding();
    else if (state.selectedId) closeLot();
    else if (state.cmdOpen) { state.cmdOpen = false; update(); }
  }
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('pb-hidden');
});

// Carrusel en celular: la tarjeta que queda centrada se previsualiza en la foto.
let railTimer;
ui.addEventListener('scroll', (e) => {
  const rail = e.target;
  if (!rail.classList?.contains('v3-cards') || !isNarrow() || state.tab !== 'lotes' || state.selectedId) return;
  clearTimeout(railTimer);
  railTimer = setTimeout(() => {
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = null;
    for (const c of rail.querySelectorAll('[data-lot]')) {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (!best || d < best.d) best = { d, id: c.dataset.lot };
    }
    if (best && best.id !== state.hoverId) {
      state.hoverId = best.id;
      syncMarkers();
      flyToLot(best.id, { zoom: 56, speed: 900 });
    }
  }, 160);
}, true);

// ---------------------------------------------------------------- hoja inferior arrastrable (v1 celular)

ui.addEventListener('pointerdown', (e) => {
  const grab = e.target.closest('[data-drag]');
  if (!grab || !isNarrow()) return;
  const panel = grab.closest('.v1-panel');
  const startY = e.clientY;
  const startH = panel.getBoundingClientRect().height;
  let moved = false;
  panel.classList.add('dragging');
  const move = (ev) => {
    const dy = ev.clientY - startY;
    if (Math.abs(dy) > 4) moved = true;
    panel.style.height = `${Math.max(120, Math.min(app.clientHeight - 40, startH - dy))}px`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    panel.classList.remove('dragging');
    const h = panel.getBoundingClientRect().height;
    panel.style.height = '';
    if (!moved) state.sheet = state.sheet === 'peek' ? 'half' : 'peek';
    else state.sheet = ['peek', 'half', 'full'].reduce((a, b) => (Math.abs(sheetPx(b) - h) < Math.abs(sheetPx(a) - h) ? b : a));
    update();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});

// ---------------------------------------------------------------- bienvenidas

let onbActive = false;
let onbCleanup = null;
const onbLayer = () => ui.querySelector('[data-onb]');

function dismissOnboarding(silent = false) {
  if (!onbActive) return;
  onbActive = false;
  const fn = onbCleanup;
  onbCleanup = null;
  fn?.(silent);
}

// La primera interacción con la foto cierra cualquier bienvenida.
viewerEl.addEventListener('pointerdown', () => dismissOnboarding(), { capture: true });
viewerEl.addEventListener('wheel', () => dismissOnboarding(), { capture: true, passive: true });

function showGestureHint({ title, sub, after }) {
  dismissOnboarding(true);
  const layer = onbLayer();
  layer.innerHTML = `
    <div class="gesture" role="status">
      <div class="gesture-track"><span class="gesture-hand">${I.hand}</span></div>
      <b>${title}</b>
      <small>${sub}</small>
    </div>`;
  requestAnimationFrame(() => layer.classList.add('on'));
  onbActive = true;
  const timer = setTimeout(() => dismissOnboarding(), 6500);
  onbCleanup = (silent) => {
    clearTimeout(timer);
    layer.classList.remove('on');
    setTimeout(() => { if (!onbActive) layer.innerHTML = ''; }, 400);
    if (!silent) after?.();
  };
}

function sway() {
  const yaw = viewer.getPosition().yaw;
  viewer.animate({ yaw: yaw + 0.22, pitch: viewer.getPosition().pitch, speed: 1800 })
    .then((done) => done !== false && onbActive && viewer.animate({ yaw, pitch: viewer.getPosition().pitch, speed: 1800 }));
}

function pulse(selector) {
  const el = ui.querySelector(selector);
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
  setTimeout(() => el.classList.remove('pulse'), 2400);
}

function coachMarks(steps) {
  dismissOnboarding(true);
  const layer = onbLayer();
  let i = 0;
  onbActive = true;
  const render = () => {
    const step = steps[i];
    const el = [...document.querySelectorAll(step.target)].find((n) => {
      const r = n.getBoundingClientRect();
      const a = app.getBoundingClientRect();
      return r.width > 0 && r.top > a.top + 80 && r.bottom < a.bottom - 120 && r.left > a.left && r.right < a.right;
    });
    const a = app.getBoundingClientRect();
    let r = el?.getBoundingClientRect();
    if (!r) r = { left: a.left + a.width / 2 - 30, top: a.top + a.height / 2 - 30, width: 60, height: 60 };
    const pad = 8;
    const box = { x: r.left - a.left - pad, y: r.top - a.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    const below = box.y + box.h / 2 < a.height / 2;
    const tipX = Math.max(16, Math.min(a.width - 296, box.x + box.w / 2 - 140));
    layer.innerHTML = `
      <div class="coach-hole" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>
      <div class="coach-tip ${below ? 'is-below' : 'is-above'}" style="left:${tipX}px;${below ? `top:${box.y + box.h + 14}px` : `bottom:${a.height - box.y + 14}px`}">
        <p>${step.text}</p>
        <div class="coach-row">
          <span class="coach-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
          <button type="button" class="link link--light" data-coach="skip">Saltar</button>
          <button type="button" class="btn btn--primary btn--sm" data-coach="next">${i === steps.length - 1 ? 'Listo' : 'Siguiente'}</button>
        </div>
      </div>`;
    layer.classList.add('on', 'coach');
  };
  const onClick = (e) => {
    const b = e.target.closest('[data-coach]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.coach === 'next' && i < steps.length - 1) { i += 1; render(); } else dismissOnboarding();
  };
  layer.addEventListener('click', onClick);
  render();
  onbCleanup = () => {
    layer.removeEventListener('click', onClick);
    layer.classList.remove('on', 'coach');
    layer.innerHTML = '';
  };
}

function introFlight() {
  dismissOnboarding(true);
  const layer = onbLayer();
  const home = { yaw: data.panorama.homeYaw, pitch: data.panorama.homePitch };
  viewer.rotate({ yaw: home.yaw - 0.9, pitch: home.pitch - 0.05 });
  viewer.zoom(5);
  layer.innerHTML = `
    <div class="intro-title">
      <small>Recorrido 360°</small>
      <b>${esc(data.project.name)} · ${esc(data.project.loteo)}</b>
      <span>${lots.length} lotes · <em>${AVAILABLE} disponibles</em></span>
    </div>
    <div class="intro-hint">${I.hand}<span>Arrastrá la foto o deslizá las tarjetas</span></div>`;
  requestAnimationFrame(() => layer.classList.add('on', 'intro'));
  onbActive = true;
  let flying = true;
  viewer.animate({ ...home, zoom: 50, speed: 2600 }).then(() => {
    flying = false;
    layer.classList.add('intro-done');
  });
  const timer = setTimeout(() => dismissOnboarding(), 9000);
  onbCleanup = () => {
    clearTimeout(timer);
    if (flying) viewer.stopAnimation?.();
    layer.classList.remove('on', 'intro', 'intro-done');
    setTimeout(() => { if (!onbActive) layer.innerHTML = ''; }, 400);
  };
}

// ---------------------------------------------------------------- barra del prototipo

function applyPhone() {
  document.documentElement.classList.toggle('phone', state.phone);
  document.querySelector('[data-proto=mobile]').setAttribute('aria-pressed', String(state.phone));
  // PSV mide el contenedor; tras cambiar el marco hay que avisarle.
  requestAnimationFrame(() => { viewer.autoSize(); update(); });
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-proto]');
  if (!b) return;
  const kind = b.dataset.proto;
  if (kind === 'v') {
    state.version = Number(b.dataset.value);
    state.tab = 'lotes';
    state.cmdOpen = false;
    mount();
    if (ready) {
      if (state.selectedId) requestAnimationFrame(() => flyToLot(state.selectedId));
      else setTimeout(() => V().onboarding(), 250);
    }
  } else if (kind === 'mobile') {
    state.phone = !state.phone;
    state.sheet = 'peek';
    applyPhone();
  } else if (kind === 'onb') {
    if (state.selectedId) closeLot();
    if (ready) V().onboarding();
  } else if (kind === 'hide') {
    document.body.classList.toggle('pb-hidden');
  }
});

new ResizeObserver(() => { if (ready) viewer.autoSize(); }).observe(app);

mount();
applyPhone();
