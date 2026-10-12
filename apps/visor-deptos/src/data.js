// Datos de demo. Todo es estático: no hay API ni persistencia.
// La geometría (fachada y plantas) son placeholders hasta tener planos reales.

export const PROJECT_NAME = 'Torre Demo';

export const STATUS = {
  available: { label: 'Disponible', color: '#22c55e' },
  reserved: { label: 'Reservado', color: '#3b82f6' },
  sold: { label: 'Vendido', color: '#ef4444' },
};

// ── Fachada ────────────────────────────────────────────────────
// viewBox 1600×900. Los pisos se apilan desde el suelo hacia arriba.
export const FACADE = { width: 1600, height: 900, ground: 860, x: 660, w: 280 };

const LEVELS = [
  { id: 'PB', label: 'PB', name: 'Planta baja', kind: 'pb', h: 84, summary: 'Hall · Local · Cocheras' },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    id: String(n),
    label: String(n),
    name: `Piso ${n}`,
    kind: 'units',
    h: 60,
  })),
  { id: 'AM', label: 'Amenities', name: 'Amenities', kind: 'amenities', h: 60, summary: 'SUM · Gimnasio · Coworking' },
  { id: 'TE', label: 'Techo', name: 'Terraza', kind: 'roof', h: 34, summary: 'Pileta · Solárium' },
];

// De abajo hacia arriba, con la posición vertical ya resuelta.
export const FLOORS = LEVELS.reduce((acc, level, index) => {
  const prev = acc[index - 1];
  const bottom = prev ? prev.y : FACADE.ground;
  acc.push({ ...level, index, y: bottom - level.h });
  return acc;
}, []);

export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f]));

// ── Planta ─────────────────────────────────────────────────────
// viewBox 1600×760. Huella del edificio: x 120–1480, y 200–560.
export const PLAN = { width: 1600, height: 760, x: 120, y: 200, w: 1360, h: 360 };

export const UNIT_SHAPES = {
  A: {
    points: [[1000, 360], [1480, 360], [1480, 560], [860, 560], [860, 440], [1000, 440]],
    pin: [1210, 465],
    balcony: { x: 1430, y: 360, w: 50, h: 200 },
    walls: [[1060, 440, 1060, 560], [1250, 410, 1250, 560], [860, 500, 960, 500]],
  },
  B: {
    points: [[1000, 200], [1480, 200], [1480, 360], [1000, 360]],
    pin: [1250, 280],
    balcony: { x: 1430, y: 200, w: 50, h: 160 },
    walls: [[1120, 200, 1120, 360], [1290, 200, 1290, 310]],
  },
  C: {
    points: [[120, 200], [600, 200], [600, 380], [120, 380]],
    pin: [360, 290],
    balcony: { x: 120, y: 200, w: 50, h: 180 },
    walls: [[390, 200, 390, 330], [500, 200, 500, 380]],
  },
  D: {
    points: [[120, 380], [600, 380], [600, 560], [120, 560]],
    pin: [360, 470],
    balcony: { x: 120, y: 380, w: 50, h: 180 },
    walls: [[400, 430, 400, 560], [500, 380, 500, 560]],
  },
};

const TYPOLOGIES = {
  A: { ambientes: 3, dormitorios: 2, banos: 2, total: 100, cubierta: 88.4, semi: 11.6 },
  B: { ambientes: 1, dormitorios: 0, banos: 1, total: 44.1, cubierta: 39.6, semi: 4.5 },
  C: { ambientes: 1, dormitorios: 0, banos: 1, total: 43.73, cubierta: 39.2, semi: 6.53 },
  D: { ambientes: 2, dormitorios: 1, banos: 1, total: 61.7, cubierta: 54.2, semi: 7.5 },
};

// Estado por piso, en orden A B C D (d = disponible, r = reservado, v = vendido).
const AVAILABILITY = {
  1: 'vvrv',
  2: 'dvvv',
  3: 'vvvr',
  4: 'ddvd',
  5: 'ddvv',
  6: 'drvv',
  7: 'vvvv',
  8: 'ddvv',
};
const STATUS_BY_CODE = { d: 'available', r: 'reserved', v: 'sold' };

export const UNITS = Object.entries(AVAILABILITY).flatMap(([floor, codes]) =>
  ['A', 'B', 'C', 'D'].map((letter, i) => ({
    id: `${floor}${letter}`,
    floor,
    letter,
    status: STATUS_BY_CODE[codes[i]],
    ...TYPOLOGIES[letter],
  }))
);

export function unitsOfFloor(floorId) {
  return UNITS.filter((u) => u.floor === floorId);
}

export function availableCount(floorId) {
  return unitsOfFloor(floorId).filter((u) => u.status === 'available').length;
}

export function typologyLabel(unit) {
  return unit.ambientes === 1 ? 'Monoambiente' : `${unit.ambientes} ambientes`;
}

// Niveles sin unidades: zonas rotuladas, no clickeables.
export const ZONES = {
  PB: [
    { label: 'Local comercial', x: 120, y: 200, w: 480, h: 360 },
    { label: 'Hall de acceso', x: 600, y: 440, w: 400, h: 120 },
    { label: 'Cocheras', x: 1000, y: 200, w: 480, h: 360 },
  ],
  AM: [
    { label: 'SUM', x: 120, y: 200, w: 480, h: 360 },
    { label: 'Gimnasio', x: 1000, y: 200, w: 480, h: 160 },
    { label: 'Coworking', x: 1000, y: 360, w: 480, h: 200 },
  ],
  TE: [
    { label: 'Solárium', x: 120, y: 200, w: 480, h: 360 },
    { label: 'Terraza', x: 1000, y: 200, w: 480, h: 360, labelY: 480 },
    { label: 'Pileta', x: 1180, y: 232, w: 260, h: 150, water: true },
  ],
};
