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

export function trackEvent(loteoId, eventType, target = {}) {
  if (!loteoId) return;
  const body = {
    loteo_id: loteoId,
    session_id: getSessionId(),
    event_type: eventType,
    target_type: target.type ?? null,
    target_id: target.id ?? null,
  };
  fetch(EVENTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.warn('POST visor event:', err));
}
