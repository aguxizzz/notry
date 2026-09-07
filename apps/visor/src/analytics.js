// Analítica del visor: embudo de conversión (entrada → click en lote →
// whatsapp/formulario → envío de solicitud). Sin autenticación, best-effort:
// una falla de red nunca debe afectar la experiencia del visitante.
import { API_BASE } from './api/config.js';

const EVENTS_URL = `${API_BASE}/public/visor-events`;
const SESSION_KEY = 'notry_visor_session_id';

function generateUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = generateUuid();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch (_) {
    return generateUuid();
  }
}

// Detecta el canal de origen de la visita a partir de `?ref=`/`?utm_source=`
// o, si no hay, del referrer. Usa el mismo vocabulario que `ProspectOrigin`
// en el backend (visor_whatsapp, visor_direct, etc.) porque ya se usa para
// el campo `origin` de la precalificación — reusarlo evita tener dos
// detectores de canal divergentes en el visor.
export function detectOrigin() {
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || params.get('utm_source') || '').toLowerCase();
  if (ref) {
    if (ref.includes('whatsapp')) return 'visor_whatsapp';
    if (ref.includes('youtube'))  return 'visor_youtube';
    if (ref.includes('tiktok'))   return 'visor_tiktok';
    if (ref.includes('facebook') || ref.includes('fb')) return 'visor_facebook';
    if (ref.includes('google'))   return 'visor_google';
  }
  const referrer = document.referrer.toLowerCase();
  if (!referrer) return 'visor_direct';
  if (referrer.includes('whatsapp')) return 'visor_whatsapp';
  if (referrer.includes('youtube'))  return 'visor_youtube';
  if (referrer.includes('tiktok'))   return 'visor_tiktok';
  if (referrer.includes('facebook')) return 'visor_facebook';
  if (referrer.includes('google'))   return 'visor_google';
  return 'visor_direct';
}

// Calculado una vez: el referrer/query no cambian durante la sesión del visor (SPA).
const CHANNEL = detectOrigin();

export function trackEvent(loteoId, eventType, target = {}) {
  if (!loteoId) return;
  const body = {
    loteo_id: loteoId,
    session_id: getSessionId(),
    event_type: eventType,
    channel: CHANNEL,
    target_type: target.type ?? null,
    target_id: target.id ?? null,
  };
  fetch(EVENTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.warn('POST visor event:', err));
}
