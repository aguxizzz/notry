// Reglas del dominio (pisos y unidades), sin geometría ni React.

export const FLOOR_KINDS = { units: 'Unidades', ground: 'Planta baja', amenities: 'Amenities', roof: 'Terraza' };

export const STATUSES = {
  available: { label: 'Disponible', color: '#22c55e' },
  reserved: { label: 'Reservado', color: '#3b82f6' },
  sold: { label: 'Vendido', color: '#ef4444' },
  unavailable: { label: 'No disponible', color: '#9ca3af' },
};

// Datos de una unidad que viajan al copiarla o duplicar su piso (no el código ni el estado).
export const UNIT_DATA_FIELDS = ['ambientes', 'dormitorios', 'banos', 'total_m2', 'covered_m2', 'semi_m2', 'polygon', 'pin', 'rooms', 'image_urls'];

// Piso siguiente por encima del último: el primero es PB y después 1, 2, 3…
export function nextFloor(floors) {
  if (!floors.length) return { code: 'PB', name: 'Planta baja', kind: 'ground', level: 0 };
  const level = Math.max(...floors.map((f) => f.level)) + 1;
  const used = new Set(floors.map((f) => f.code));
  let n = Math.max(0, ...floors.map((f) => Number(f.code)).filter(Number.isInteger)) + 1;
  while (used.has(String(n))) n++;
  return { code: String(n), name: `Piso ${n}`, kind: 'units', level };
}

// Letra siguiente libre para el código de unidad (A, B, C…) dentro de un piso.
export function nextUnitCode(floor) {
  const used = new Set((floor.units || []).map((u) => u.code));
  for (let i = 0; i < 26; i++) {
    const candidate = `${floor.code}${String.fromCharCode(65 + i)}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${floor.code}${used.size + 1}`;
}
