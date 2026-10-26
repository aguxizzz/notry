import { useState, useMemo, useCallback } from 'react';
import { DEEP_LINK_LOT } from '../urlParams.js';

const storageKey = (projectId) => `notry_visor_onboarding_seen_${projectId ?? 'default'}`;

function wasSeen(projectId) {
  try {
    return Boolean(sessionStorage.getItem(storageKey(projectId)));
  } catch (_) {
    return false;
  }
}

/**
 * Bienvenida con la pista de gestos: una sola vez por sesión de pestaña,
 * recién cuando la primera etapa terminó de cargar (para no tapar la pantalla
 * de carga). Si se entra por link a un lote, la ficha ya explica todo.
 */
export function useOnboarding({ ready, projectId }) {
  const [dismissed, setDismissed] = useState(false);
  const seen = useMemo(() => wasSeen(projectId), [projectId]);
  const visible = ready && !dismissed && !seen && !DEEP_LINK_LOT;

  const dismiss = useCallback(() => {
    setDismissed(true);
    try { sessionStorage.setItem(storageKey(projectId), '1'); } catch (_) { /* sessionStorage no disponible */ }
  }, [projectId]);

  return { visible, dismiss };
}
