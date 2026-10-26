// De dónde sale el JSON del visor y cómo se normaliza. Sin React ni PSV: se
// puede testear solo (viewerData.test.js).

import { API_BASE } from './api/config.js';

const API_URL = '/api/viewer/current';
const DATA_URL_PARAM = 'data';

// Slugs en el path — URL amigable alternativa a ?data=:
//   /paseoberlin           → [projectSlug]
//   /paseoberlin/mitte     → [projectSlug, loteoSlug] (loteo puntual dentro del proyecto)
function getSlugPartsFromPath() {
  return window.location.pathname.split('/').filter(Boolean);
}

// Resuelve de dónde sacar el JSON del visor: ?data=<url> explícito tiene
// prioridad (usado por enlaces internos que apuntan a un loteo puntual),
// si no hay se intenta el/los slug(s) del path (URL pública amigable).
export function getViewerDataUrl() {
  const params = new URLSearchParams(window.location.search);
  const queryUrl = params.get(DATA_URL_PARAM);
  if (queryUrl && typeof queryUrl === 'string' && queryUrl.trim()) return queryUrl.trim();

  const [projectSlug, loteoSlug] = getSlugPartsFromPath();
  if (projectSlug && loteoSlug) {
    return `${API_BASE}/public/projects/by-slug/${projectSlug}/loteos/by-slug/${loteoSlug}/group_visor_data`;
  }
  if (projectSlug) {
    return `${API_BASE}/public/projects/by-slug/${projectSlug}/group_visor_data`;
  }

  return null;
}

// El slug de proyecto en el path (si lo hay), para pedir el branding aparte
// del group_visor_data — el logo tiene que aparecer en pantalla de carga
// aunque el fetch pesado (lotes, pois, etc.) todavía no haya respondido.
// El loteo (si viene) es para que la galería de carga sea la misma etapa con la que abre.
export function getBrandingSlugsFromPath() {
  const [projectSlug, loteoSlug] = getSlugPartsFromPath();
  return { projectSlug: projectSlug ?? null, loteoSlug: loteoSlug ?? null };
}

export async function fetchProjectBranding(projectSlug, loteoSlug = null) {
  if (!projectSlug) return null;
  const query = loteoSlug ? `?loteo=${encodeURIComponent(loteoSlug)}` : '';
  try {
    const res = await fetch(`${API_BASE}/public/projects/by-slug/${projectSlug}/branding${query}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

// Fotos del desarrollo para la pantalla de carga: [{ url, caption }]. El back
// las entrega ya resueltas (las del loteo, o las del proyecto como respaldo).
// Acepta también strings sueltos por si alguna vez llegan solo URLs.
const MAX_LOADING_GALLERY = 6;
export function normalizeLoadingGallery(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === 'string' ? { url: item } : item))
    .filter((item) => typeof item?.url === 'string' && item.url)
    .map((item) => ({ url: item.url, caption: item.caption?.trim() || '' }))
    .slice(0, MAX_LOADING_GALLERY);
}

export async function fetchViewerData() {
  const queryDataUrl = getViewerDataUrl();
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(API_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.json();
  } catch (_) {
    // Backend no disponible o tardó demasiado
  }
  return null;
}

// Normaliza la respuesta a un grupo de etapas. Soporta la forma nueva
// (group_visor_data: { stages, entry_stage_id }) y la vieja (visor_data plano),
// que se envuelve como un grupo de una sola etapa.
export function normalizeToGroup(data) {
  if (data && Array.isArray(data.stages)) {
    return {
      projectId: data.project_id ?? null,
      entryStageId: data.entry_stage_id ?? data.stages[0]?.id ?? null,
      stages: data.stages,
      project: data.project ?? null,
      loteoLogoUrl: data.loteo_logo_url ?? null,
      loadingGallery: normalizeLoadingGallery(data.loading_gallery),
      whatsappPhone: data.whatsapp_phone ?? null,
      hideContactForm: data.hide_contact_form ?? false,
      __usingFallback: data.__usingFallback,
    };
  }
  return {
    projectId: null,
    entryStageId: 'single',
    stages: [{ id: 'single', name: '', orden: 0, visor: data }],
    project: null,
    loteoLogoUrl: null,
    loadingGallery: normalizeLoadingGallery(data?.loading_gallery),
    whatsappPhone: data?.whatsapp_phone ?? null,
    hideContactForm: data?.hide_contact_form ?? false,
    __usingFallback: data?.__usingFallback,
  };
}
