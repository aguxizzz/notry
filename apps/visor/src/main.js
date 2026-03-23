import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';

import { createViewer } from './viewer.js';
import { annotationsToMarkers } from './annotations.js';

const CONTAINER_SELECTOR = '#viewer-container';
const API_URL = '/api/viewer/current';
const FALLBACK_DATA_URL = '/data/viewer.json';

/** Parámetro de búsqueda para URL externa de datos (ej: ?data=https://.../viewer.json) */
const DATA_URL_PARAM = 'data';

/**
 * URLs para envío de datos (cambiar aquí cuando tengas el backend definitivo).
 * - CLICK_TRACKING_URL: se llama con POST { id } cada vez que el usuario hace click en un lote.
 * - PRE_CALIFICACION_URL: se llama con POST { id } cuando el usuario pulsa "Pre calificación".
 */
const CLICK_TRACKING_URL = 'https://ejemplo.com/api/lote/click';
const PRE_CALIFICACION_URL = 'https://ejemplo.com/api/lote/pre-calificacion';

const infoBackdrop = document.getElementById('info-backdrop');
const infoPanel = document.getElementById('info-panel');
const infoPanelContent = document.getElementById('info-panel-content');
const infoPanelView = document.getElementById('info-panel-view');
const infoPanelForm = document.getElementById('info-panel-form');
const infoPanelLotTitle = document.getElementById('info-panel-lot-title');
const infoContent = document.getElementById('info-content');
const infoActions = document.getElementById('info-actions');
const precalDetailTitle = document.getElementById('precal-detail-title');
const precalDetailMeta = document.getElementById('precal-detail-meta');
const precalificacionForm = document.getElementById('precalificacion-form');

/** Id del lote actual (para enviar con el formulario de pre calificación). */
let currentMarkerId = null;

/** Altura del contenido de la vista info (para animar al volver desde el formulario). */
let currentInfoHeight = 200;

/** Detalle del lote actual (título, precio, área) para mostrar en el panel de precalificación. */
let currentLotDetail = { title: '', precio: '', area: '' };

/**
 * Devuelve la URL de datos desde la query string, si existe.
 * @returns {string|null}
 */
function getDataUrlFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get(DATA_URL_PARAM);
  if (!url || typeof url !== 'string') return null;
  return url.trim() || null;
}

/**
 * Obtiene los datos del visor: primero URL de query (?data=...), luego API, luego fallback local.
 * @returns {Promise<{ panoramaUrl: string, imageWidth?: number, imageHeight?: number, annotations: Array }>}
 */
async function fetchViewerData() {
  const queryDataUrl = getDataUrlFromQuery();
  if (queryDataUrl) {
    try {
      const res = await fetch(queryDataUrl);
      if (res.ok) return await res.json();
      throw new Error(`La URL devolvió ${res.status}`);
    } catch (err) {
      throw new Error(`No se pudo cargar el JSON desde la URL: ${err.message}`);
    }
  }
  try {
    const res = await fetch(API_URL);
    if (res.ok) return await res.json();
  } catch (_) {
    // Backend no disponible: usar datos locales
  }
  const res = await fetch(FALLBACK_DATA_URL);
  if (!res.ok) throw new Error('No se pudo cargar el panorama ni los datos de prueba.');
  return await res.json();
}

/**
 * Envía POST a la URL indicada con el id del lote en el body.
 * @param {string} url
 * @param {string} id
 */
function postLoteId(url, id) {
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  }).catch((err) => console.warn('POST lote:', err));
}

/**
 * Envía la solicitud de pre calificación con id del lote, nombre y número.
 * @param {string} id
 * @param {string} nombre
 * @param {string} numero
 */
function postPrecalificacion(id, nombre, numero, presupuesto) {
  fetch(PRE_CALIFICACION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, nombre, numero, presupuesto: presupuesto ?? '' }),
  }).catch((err) => console.warn('POST pre calificación:', err));
}

/**
 * Establece la altura del área de contenido del panel (animada por CSS).
 * @param {number} heightPx
 */
function setPanelContentHeight(heightPx) {
  infoPanel.style.setProperty('--info-panel-content-height', `${heightPx}px`);
}

/**
 * Mide la altura natural del contenido de la vista info (con position static).
 * @returns {number}
 */
function measureInfoViewHeight() {
  infoPanelContent.style.minHeight = '0';
  infoPanelContent.style.height = 'auto';
  infoPanelView.style.position = 'static';
  const h = infoPanelView.offsetHeight;
  infoPanelView.style.position = '';
  infoPanelContent.style.minHeight = '';
  infoPanelContent.style.height = '';
  return h;
}

/**
 * Mide la altura natural del formulario de pre calificación.
 * @returns {number}
 */
function measureFormHeight() {
  infoPanelForm.style.visibility = 'hidden';
  infoPanelForm.style.position = 'static';
  infoPanelContent.style.minHeight = '0';
  infoPanelContent.style.height = 'auto';
  const h = infoPanelForm.offsetHeight;
  infoPanelForm.style.visibility = '';
  infoPanelForm.style.position = '';
  infoPanelContent.style.minHeight = '';
  infoPanelContent.style.height = '';
  return h;
}

/**
 * Muestra el formulario de pre calificación: anima la altura del panel y hace crossfade.
 */
function showPrecalificacionForm() {
  precalDetailTitle.textContent = currentLotDetail.title;
  const metaParts = [];
  if (currentLotDetail.precio) metaParts.push(`Precio: ${currentLotDetail.precio}`);
  if (currentLotDetail.area) metaParts.push(`Área: ${currentLotDetail.area}`);
  precalDetailMeta.textContent = metaParts.join(' · ');

  const formHeight = measureFormHeight();
  setPanelContentHeight(formHeight);
  infoPanelView.classList.add('hidden');
  infoPanelForm.classList.add('visible');
  infoPanel.classList.add('info-panel--form-visible');
  precalificacionForm.nombre.value = '';
  precalificacionForm.numero.value = '';
  precalificacionForm.presupuesto.value = '';
  document.getElementById('precal-nombre').focus();
}

/**
 * Vuelve a la vista de detalle del lote y oculta el formulario (animando la altura).
 */
function showInfoView() {
  infoPanel.classList.remove('info-panel--form-visible');
  setPanelContentHeight(currentInfoHeight);
  infoPanelForm.classList.remove('visible');
  infoPanelView.classList.remove('hidden');
}

/**
 * Muestra u oculta el modal centrado con el detalle del marcador (y el fondo opaco).
 * @param {string|null} title
 * @param {string|null} content
 * @param {string|null} [markerId] - Si se pasa, se muestra el botón "Pre calificación" que envía este id.
 * @param {{ precio?: string, area?: string }} [detail] - Opcional: precio y área para la línea bajo el título.
 */
function setInfoPanel(title, content, markerId, detail = {}) {
  if (!title && !content) {
    infoBackdrop.classList.remove('visible');
    infoActions.innerHTML = '';
    showInfoView();
    currentMarkerId = null;
    return;
  }
  currentMarkerId = markerId ?? null;
  showInfoView();

  infoPanelLotTitle.textContent = title ?? '';
  const { precio, area } = detail;
  currentLotDetail = {
    title: title ?? '',
    precio: precio != null ? String(precio).trim() : '',
    area: area != null ? String(area).trim() : '',
  };
  infoContent.innerHTML = content ?? '';

  infoActions.innerHTML = '';
  if (markerId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Pre calificación';
    btn.addEventListener('click', () => {
      showPrecalificacionForm();
    });
    infoActions.appendChild(btn);
  }

  // Medir la altura de la vista info antes de mostrar para evitar salto
  const h = measureInfoViewHeight();
  currentInfoHeight = h;
  setPanelContentHeight(h);

  infoBackdrop.classList.add('visible');
}

async function init() {
  const data = await fetchViewerData();
  const annotations = data.annotations ?? [];
  const markers = annotationsToMarkers(annotations);
  const annotationsById = Object.fromEntries(annotations.map((a) => [a.id, a]));

  const { viewer, markersPlugin } = createViewer(
    CONTAINER_SELECTOR,
    data.panoramaUrl,
    markers
  );

  markersPlugin.addEventListener('select-marker', ({ marker }) => {
    const ann = annotationsById[marker.id];
    // Los marcadores de tipo "text" son solo etiquetas: no abrir modal ni pre-calificación.
    if (ann?.type === 'text') {
      markersPlugin.hideMarkerPanel();
      return;
    }
    postLoteId(CLICK_TRACKING_URL, marker.id);
    const title = ann?.tooltip ?? marker.id;
    
    // Generar contenido dinámico de HTML basado en los datos puros (precio, área, etc)
    let content = ann?.content; // Si de casualidad hay contenido manual, lo respetamos (retrocompatibilidad)
    if (!content && (ann?.precio || ann?.area)) {
      const parts = [];
      if (title) parts.push(`<p>Detalle de <strong>${title}</strong>.</p>`);
      if (ann.precio) parts.push(`<p>Precio: ${ann.precio}</p>`);
      if (ann.area) parts.push(`<p>Área: ${ann.area}</p>`);
      content = parts.join('');
    } else if (!content) {
      content = ann?.tooltip ?? '';
    }

    const detail = {
      precio: ann?.precio,
      area: ann?.area,
    };
    setInfoPanel(title, content, marker.id, detail);
  });

  markersPlugin.addEventListener('unselect-marker', () => {
    setInfoPanel(null, null);
  });

  // Cerrar el modal al hacer click en el fondo opaco (no en la ventana) o en la X
  infoBackdrop.addEventListener('click', (e) => {
    if (e.target === infoBackdrop) setInfoPanel(null, null);
  });
  document.getElementById('info-panel-close').addEventListener('click', () => {
    setInfoPanel(null, null);
  });
  document.getElementById('info-panel-back').addEventListener('click', () => {
    showInfoView();
  });

  precalificacionForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = document.getElementById('precal-nombre').value.trim();
    const numero = document.getElementById('precal-numero').value.trim();
    const presupuesto = document.getElementById('precal-presupuesto').value.trim();
    if (currentMarkerId && (nombre || numero)) {
      postPrecalificacion(currentMarkerId, nombre, numero, presupuesto);
      setInfoPanel(null, null);
    }
  });

  // Hover en marcadores de tipo "text": tienen pointer-events none, así que detectamos la posición del cursor.
  // Se configura en 'ready' para que los elementos del plugin existan ya en el DOM.
  const textMarkerIds = annotations.filter((a) => a.type === 'text').map((a) => a.id);
  const hoverClass = 'psv-marker--label-hover';
  const container = document.querySelector(CONTAINER_SELECTOR);

  viewer.addEventListener('ready', () => {
    console.log('Visor listo');

    if (textMarkerIds.length === 0) return;

    const updateHover = (x, y) => {
      for (const id of textMarkerIds) {
        const el = document.getElementById(`psv-marker-${id}`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        el.classList.toggle(hoverClass, inside);
      }
    };

    // Usar document para recibir mousemove aunque el cursor esté sobre el marcador (que tiene pointer-events: none)
    document.addEventListener('mousemove', (e) => {
      updateHover(e.clientX, e.clientY);
    });

    if (container) {
      container.addEventListener('mouseleave', () => {
        for (const id of textMarkerIds) {
          document.getElementById(`psv-marker-${id}`)?.classList.remove(hoverClass);
        }
      });
    }
  });
}

init().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif;">Error: ${err.message}. Puedes usar <code>?data=URL</code> para cargar un JSON desde una URL, o asegúrate de tener <code>public/data/viewer.json</code> y una imagen de panorama válida.</p>`;
});
