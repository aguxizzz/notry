import { createContext, useContext } from 'react';
import { API_BASE } from './config.js';
import * as mock from './data.js';

// El visor trabaja siempre sobre un mismo "modelo de edificio", venga de la
// demo inventada (data.js) o de la API. Todo lo geométrico está en el espacio
// de la planta (`plan`): la fachada 3D, las plantas y la cámara lo comparten.

export const STATUS = {
  available: { label: 'Disponible', color: '#22c55e' },
  reserved: { label: 'Reservado', color: '#3b82f6' },
  sold: { label: 'Vendido', color: '#ef4444' },
  unavailable: { label: 'No disponible', color: '#9ca3af' },
};

export function typologyLabel(unit) {
  if (unit.ambientes == null) return null;
  return unit.ambientes === 1 ? 'Monoambiente' : `${unit.ambientes} ambientes`;
}

// Alto en la fachada (viewBox) por tipo de piso, si el piso no trae uno propio.
const FLOOR_HEIGHT = { ground: 84, units: 60, amenities: 60, roof: 34 };
const DEFAULT_FACADE = { width: 1600, height: 900, ground: 860, x: 660, w: 280 };

function finish({ floors, units, ...rest }) {
  const floorById = Object.fromEntries(floors.map((f) => [f.id, f]));
  const unitsByFloor = {};
  for (const unit of units) (unitsByFloor[unit.floor] ??= []).push(unit);
  const unitsOfFloor = (id) => unitsByFloor[id] || [];
  const availableCount = (id) => unitsOfFloor(id).filter((u) => u.status === 'available').length;
  const statuses = Object.keys(STATUS).filter((key) => units.some((u) => u.status === key));
  return { ...rest, floors, floorById, units, unitsOfFloor, availableCount, statuses };
}

// Apila los pisos desde el suelo hacia arriba y les resuelve la posición vertical.
function stack(levels, ground) {
  return levels.reduce((acc, level, index) => {
    const bottom = index ? acc[index - 1].y : ground;
    acc.push({ ...level, index, y: bottom - level.h });
    return acc;
  }, []);
}

// ── Demo ───────────────────────────────────────────────────────

export const mockBuilding = finish({
  demo: true,
  name: mock.PROJECT_NAME,
  facade: mock.FACADE,
  plan: mock.PLAN,
  pinScale: 1,
  defaultFloorId: '4',
  floors: mock.FLOORS.map((f) => ({ ...f, zones: mock.ZONES[f.id] || null })),
  units: mock.UNITS.map((u) => ({ ...u, code: u.id, shape: mock.UNIT_SHAPES[u.letter] })),
});

// ── API ────────────────────────────────────────────────────────

function centroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  points.forEach(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  });
  if (Math.abs(area) < 1e-6) {
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

const num = (value) => (value == null ? null : Number(value));

function bbox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function grow(box, by) {
  return { x: box.x - by, y: box.y - by, w: box.w + 2 * by, h: box.h + 2 * by };
}

// La misma alineación que el editor (editor-deptos/src/geometry.js,
// alignmentTransform): escala y rotación alrededor del centro de la imagen y
// después desplazamiento. Lleva imagen y polígonos al marco del plano original,
// que está derecho; sin ella el render de IA queda torcido.
function alignment(a, w, h) {
  const { x = 0, y = 0, scale = 1, rotation = 0 } = a || {};
  const cx = w / 2;
  const cy = h / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad) * scale;
  const sin = Math.sin(rad) * scale;
  return {
    apply: ([px, py]) => [
      (px - cx) * cos - (py - cy) * sin + x + cx,
      (px - cx) * sin + (py - cy) * cos + y + cy,
    ],
    svg: `translate(${x + cx} ${y + cy}) rotate(${rotation}) scale(${scale}) translate(${-cx} ${-cy})`,
  };
}

// Giro de toda la planta para que el lado que da al frente (`plan_front` del
// edificio) quede abajo, debajo de la fachada. Se aplica al final, sobre el marco
// común de `width` × `height`; con 90° el marco pasa a ser de `height` × `width`.
function turn(front, width, height) {
  switch (front) {
    case 'left': // 90° antihorario: el borde izquierdo baja
      return { width: height, height: width, apply: ([x, y]) => [y, width - x], svg: `translate(0 ${width}) rotate(-90)` };
    case 'right': // 90° horario: el borde derecho baja
      return { width: height, height: width, apply: ([x, y]) => [height - y, x], svg: `translate(${height} 0) rotate(90)` };
    case 'top':
      return { width, height, apply: ([x, y]) => [width - x, height - y], svg: `translate(${width} ${height}) rotate(180)` };
    default:
      return { width, height, apply: (p) => p, svg: '' };
  }
}

// Baja `dy` todo lo de un piso ya armado: imagen, contorno, huella y sus unidades
// (que viven en la lista general, se reconocen por `floor`).
function shiftFloor(level, units, dy) {
  const move = ([x, y]) => [x, y + dy];
  if (level.image) level.image = { ...level.image, transform: `translate(0 ${dy}) ${level.image.transform}` };
  if (level.shape) level.shape = level.shape.map(move);
  level.footprint = { ...level.footprint, y: level.footprint.y + dy };
  for (const unit of units) {
    if (unit.floor !== level.id) continue;
    unit.shape = { points: unit.shape.points.map(move), pin: move(unit.shape.pin) };
  }
}

// El render trae fondo (terreno, pasto, papel blanco…) alrededor del edificio. Se
// recorta al contorno dibujado en el editor (`outline`); si el piso no tiene, a la
// caja de sus unidades (ya alineadas) con un margen para el muro exterior.
const WALL_MARGIN = 0.008;

export function fromApi(data) {
  const sorted = [...data.floors].sort((a, b) => a.level - b.level);

  // Espacio común de planta: el de la primera imagen. Un piso con otra
  // resolución se encaja (centrado, sin deformar) dentro de ese marco.
  const ref = sorted.find((f) => f.plan_width && f.plan_height);
  const width = ref?.plan_width || 1600;
  const height = ref?.plan_height || 1000;
  const margin = Math.max(width, height) * WALL_MARGIN;
  const frame = turn(data.plan_front, width, height);

  const units = [];
  const levels = sorted.map((f) => {
    const fw = f.plan_width || width;
    const fh = f.plan_height || height;
    const k = Math.min(width / fw, height / fh);
    const ox = (width - fw * k) / 2;
    const oy = (height - fh * k) / 2;
    const align = alignment(f.alignment, fw, fh);
    const toPlan = (p) => {
      const [x, y] = align.apply(p);
      return frame.apply([ox + x * k, oy + y * k]);
    };

    const unitPoints = [];
    for (const u of f.units) {
      if (!u.polygon || u.polygon.length < 3) continue;
      const points = u.polygon.map(toPlan);
      unitPoints.push(...points);
      units.push({
        id: u.id,
        code: u.code,
        floor: f.id,
        status: STATUS[u.status] ? u.status : 'unavailable',
        ambientes: u.ambientes,
        dormitorios: u.dormitorios,
        banos: u.banos,
        total: num(u.total_m2),
        cubierta: num(u.covered_m2),
        semi: num(u.semi_m2),
        images: u.image_urls || [],
        // El back ya lo manda recortado a {amount, currency} y solo en disponibles.
        price: u.pricing?.amount != null ? { amount: num(u.pricing.amount), currency: u.pricing.currency || 'USD' } : null,
        shape: { points, pin: u.pin ? toPlan(u.pin) : centroid(points) },
      });
    }

    // Contorno del edificio en el espacio de planta (null = recorte por caja).
    const shape = f.outline?.length >= 3 ? f.outline.map(toPlan) : null;

    return {
      id: f.id,
      label: f.kind === 'ground' ? 'PB' : f.code,
      name: f.name,
      kind: f.kind,
      h: f.facade_height || FLOOR_HEIGHT[f.kind] || FLOOR_HEIGHT.units,
      summary: f.summary,
      zones: f.zones,
      shape,
      footprint: shape ? bbox(shape) : unitPoints.length ? grow(bbox(unitPoints), margin) : null,
      image: f.plan_image_url
        ? {
            href: f.plan_image_url,
            width: fw,
            height: fh,
            // Mismo orden que toPlan leído de afuera hacia adentro: giro, encaje, alineación.
            transform: `${frame.svg} translate(${ox} ${oy}) scale(${k}) ${align.svg}`,
          }
        : null,
    };
  });

  // Cada piso se encaja por su imagen, y las imágenes no comparten encuadre: el
  // borde frontal de cada contorno cae a distinta altura. La fachada está en el
  // borde de abajo de la huella total, así que se baja cada piso hasta esa línea;
  // si no, queda un hueco entre la fachada y el frente del piso.
  const sized = levels.filter((l) => l.footprint);
  const frontY = Math.max(...sized.map((l) => l.footprint.y + l.footprint.h));
  for (const level of sized) {
    const dy = frontY - (level.footprint.y + level.footprint.h);
    if (dy > 0.5) shiftFloor(level, units, dy);
  }

  // Huella del edificio: la unión de las de cada piso. Los pisos sin unidades
  // (amenities, terraza) se recortan con ella.
  const footprints = sized.map((l) => l.footprint);
  const all = footprints.length
    ? bbox(footprints.flatMap((b) => [[b.x, b.y], [b.x + b.w, b.y + b.h]]))
    : { x: 0, y: 0, w: frame.width, h: frame.height };
  for (const level of levels) level.footprint ??= all;
  const plan = { width: frame.width, height: frame.height, ...all };

  const facade = { ...DEFAULT_FACADE, ...(data.facade || {}) };
  const floors = stack(levels, facade.ground);
  const withUnits = floors.filter((f) => units.some((u) => u.floor === f.id));
  const firstFree = withUnits.find((f) => units.some((u) => u.floor === f.id && u.status === 'available'));

  return finish({
    demo: false,
    name: data.name,
    facade,
    plan,
    // Pines y etiquetas están dibujados para una planta de ~1600 de ancho. Va el
    // ancho sin girar: el tamaño de la planta no cambia por rotarla.
    pinScale: width / 1600,
    defaultFloorId: (firstFree || withUnits[0] || floors[0])?.id,
    floors,
    units,
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `ref` is the slug of the public link (?edificio=citrino-ii) or the building's uuid,
// which the first links used and the editor preview still uses.
export async function fetchBuilding(ref) {
  const path = UUID_RE.test(ref) ? ref : `by-slug/${encodeURIComponent(ref)}`;
  const res = await fetch(`${API_BASE}/public/buildings/${path}`);
  if (!res.ok) throw new Error(res.status === 404 ? 'No encontramos este edificio.' : 'No se pudo cargar el edificio.');
  return fromApi(await res.json());
}

// Sin proveedor (p. ej. en design-lab) se usa la demo.
export const BuildingContext = createContext(mockBuilding);
export const useBuilding = () => useContext(BuildingContext);
