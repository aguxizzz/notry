// Helpers para prospectos. Antes `daysSinceContact` y `NEGLECTED_THRESHOLD_DAYS`
// vivían exportados desde el componente UI `NeglectedProspectsPanel.jsx`, lo que
// obligaba a las vistas a importar lógica de negocio desde un componente de
// presentación. Moverlo a un util desacopla la vista del panel y deja la
// constante/tasa en un único lugar al que ambos pueden suscribirse.

export const NEGLECTED_THRESHOLD_DAYS = 15;

export function daysSinceContact(isoDate) {
  // A prospect without a contact history is new, not overdue. Returning null
  // also prevents UI counters from rendering the misleading "Infinity días".
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
