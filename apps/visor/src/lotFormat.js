// Formato de datos del lote y registro local de precalificaciones enviadas.

export const STATUS_LABEL = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido', unavailable: 'No disponible' };

// Consulta general (no de un lote) por WhatsApp.
export const projectWaText = (project, stageName) => `Hola, quiero más información sobre ${project?.name ?? stageName ?? 'el loteo'}.`;

export const formatPrice = (price) => {
  if (!price) return '';
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const SUBMITTED_LOTS_KEY = 'notry_precal_submitted';

export const getSubmittedLotsSet = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SUBMITTED_LOTS_KEY));
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
};

export const markLotAsSubmitted = (key) => {
  try {
    const set = getSubmittedLotsSet();
    set.add(key);
    localStorage.setItem(SUBMITTED_LOTS_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage no disponible (modo privado, etc.) — no bloqueante
  }
};
