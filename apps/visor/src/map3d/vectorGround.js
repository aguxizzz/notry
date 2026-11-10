// Render-mode ground of the 3D map (mapScene.js), drawn from OpenStreetMap
// vector tiles (OpenFreeMap, OpenMapTiles schema) instead of a gray raster
// basemap. Near the lots it is real geometry, sharp at any zoom like the lots
// (lotLayer.js); the far ring is painted into a canvas, fog hides it anyway.
import * as THREE from 'three';
import { VectorTile, classifyRings } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

// Free, no API key. The TileJSON points to the current weekly planet build,
// so the tile URL is read from it instead of hardcoding a dated path.
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
// OpenMapTiles stops at z14; past that the data is the same, only stretched,
// which costs nothing here because we draw geometry, not pixels.
export const VECTOR_MAX_ZOOM = 14;

export const PALETTE = {
  land: '#ebe7de',
  farmland: '#e6e3d1',
  grass: '#dde6cc',
  wood: '#cfdcbd',
  residential: '#e4dfd5',
  water: '#b7d0e0',
  dryWater: '#cfdbe0',
  building: '#d6cfc2',
  casing: '#d2cbbd',
  road: '#ffffff',
  rail: '#c4bdb0',
};

// Polygon kinds, bottom to top.
const POLY_ORDER = ['farmland', 'grass', 'wood', 'residential', 'water', 'building'];

const URBAN = new Set(['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial', 'retail']);
const GREEN = new Set(['cemetery', 'pitch', 'playground', 'stadium']);

function polygonKind(layer, cls) {
  switch (layer) {
    case 'landcover':
      if (cls === 'farmland') return 'farmland';
      if (cls === 'wood' || cls === 'forest') return 'wood';
      if (cls === 'grass' || cls === 'wetland') return 'grass';
      return null;
    case 'landuse':
      if (URBAN.has(cls)) return 'residential';
      if (GREEN.has(cls)) return 'grass';
      return null;
    case 'park': return 'grass';
    case 'water': return 'water';
    case 'building': return 'building';
    default: return null;
  }
}

// Widths in meters by OpenMapTiles class: roughly real, a little generous so
// a rural road still reads from the overview distance.
const ROAD_WIDTH_M = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9,
  minor: 7, service: 4.5, track: 3.5, path: 1.5, raceway: 6, busway: 7,
};
const RAIL_WIDTH_M = 1.5;
const CASING_M = 1; // darker border on each side of a road

function lineStyle(layer, props) {
  if (layer === 'transportation') {
    if (props.brunnel === 'tunnel') return null; // underground, would cut across blocks
    if (props.class === 'rail' || props.class === 'transit') return { kind: 'rail', width: RAIL_WIDTH_M };
    // Unknown classes ("minor_construction", ferry...) are skipped on purpose.
    const width = ROAD_WIDTH_M[props.class];
    return width ? { kind: 'road', width } : null;
  }
  if (layer === 'waterway') {
    // Culverts run under roads and buildings: on the satellite there's nothing
    // to see, and drawn on top they look like water crossing a roof.
    if (props.brunnel === 'tunnel') return null;
    // Creeks that only carry water after rain: thinner and paler, so they read
    // as a hint and not as a real stream.
    if (props.intermittent === 1) return { kind: 'dryWater', width: 1.5 };
    return { kind: 'water', width: props.class === 'river' ? 10 : 3 };
  }
  return null;
}

// ---------------------------------------------------------------- loading

let urlTemplate = null;

async function tileUrl(z, x, y) {
  urlTemplate ??= fetch(TILEJSON_URL).then((r) => r.json()).then((j) => j.tiles[0])
    // Forget a failed lookup, or one bad network moment breaks render for the
    // whole session (the promise is cached at module level).
    .catch((err) => { urlTemplate = null; throw err; });
  return (await urlTemplate).replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/**
 * Decodes one tile into plain data in fractional tile coordinates (X, Y at
 * the tile's zoom), which both the mesh builder and the canvas painter use.
 */
function decodeTile(tile, x, y) {
  const polys = []; // { kind, rings: [outer, ...holes] }, each ring [[X, Y], ...]
  const lines = []; // { kind, width, pts: [[X, Y], ...] }
  for (const [name, layer] of Object.entries(tile.layers)) {
    const toTile = (p) => [x + p.x / layer.extent, y + p.y / layer.extent];
    for (let i = 0; i < layer.length; i += 1) {
      const f = layer.feature(i);
      if (f.type === 3) {
        const kind = polygonKind(name, f.properties.class);
        if (!kind) continue;
        // One MVT feature can hold several polygons; classifyRings splits them
        // into [outer, ...holes] groups by ring winding.
        for (const rings of classifyRings(f.loadGeometry())) {
          polys.push({ kind, rings: rings.map((r) => r.map(toTile)) });
        }
      } else if (f.type === 2) {
        const style = lineStyle(name, f.properties);
        if (!style) continue;
        for (const line of f.loadGeometry()) lines.push({ ...style, pts: line.map(toTile) });
      }
    }
  }
  return { polys, lines };
}

async function loadTile(z, x, y) {
  try {
    const res = await fetch(await tileUrl(z, x, y));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeTile(new VectorTile(new PbfReader(new Uint8Array(buf))), x, y);
  } catch {
    return null; // a missing tile leaves bare land, not a crash
  }
}

/** Loads every tile of a range (same shape as pickTileRange) and merges them. */
export async function loadVectorRange(range, onProgress) {
  const jobs = [];
  for (let ty = range.y0; ty <= range.y1; ty += 1) {
    for (let tx = range.x0; tx <= range.x1; tx += 1) {
      jobs.push(loadTile(range.z, tx, ty).then((t) => { onProgress?.(); return t; }));
    }
  }
  const tiles = (await Promise.all(jobs)).filter(Boolean);
  // Features crossing a tile edge come once per tile, overlapping a bit in the
  // tile buffer. Same color and opaque, so the overlap doesn't show.
  return { polys: tiles.flatMap((t) => t.polys), lines: tiles.flatMap((t) => t.lines) };
}

// ---------------------------------------------------------------- geometry

// Pushes a triangle facing up (+y), whatever the winding of the source data.
function pushTri(pos, index, a, b, c) {
  const up = (pos[b * 3 + 2] - pos[a * 3 + 2]) * (pos[c * 3] - pos[a * 3])
    - (pos[b * 3] - pos[a * 3]) * (pos[c * 3 + 2] - pos[a * 3 + 2]);
  if (up > 0) index.push(a, b, c);
  else index.push(a, c, b);
}

function flatGeometry(pos, index) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geom.setIndex(index);
  return geom;
}

function polygonGeometry(polys, toLocal) {
  const pos = [];
  const index = [];
  for (const { rings } of polys) {
    const [outer, ...holes] = rings.map((r) => r.map(([X, Y]) => {
      const p = toLocal(X, Y);
      return new THREE.Vector2(p.x, p.z);
    }));
    if (outer.length < 3) continue;
    // triangulateShape drops the repeated closing point of each ring in place,
    // and numbers the vertices as outer then holes, the order pushed below.
    const tris = THREE.ShapeUtils.triangulateShape(outer, holes);
    const base = pos.length / 3;
    for (const v of [outer, ...holes].flat()) pos.push(v.x, 0, v.y);
    for (const [a, b, c] of tris) pushTri(pos, index, base + a, base + b, base + c);
  }
  return flatGeometry(pos, index);
}

const JOIN_SIDES = 8;

/**
 * Lines as flat ribbons in meters: one quad per segment plus a small disc at
 * every vertex, which fills the gaps at bends and rounds the ends.
 */
function strokeGeometry(lines, toLocal, extra = 0) {
  const pos = [];
  const index = [];
  for (const line of lines) {
    const pts = line.pts.map(([X, Y]) => toLocal(X, Y));
    const r = line.width / 2 + extra;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-6) continue;
      const nx = (-(b.z - a.z) / len) * r;
      const nz = ((b.x - a.x) / len) * r;
      const base = pos.length / 3;
      pos.push(a.x + nx, 0, a.z + nz, a.x - nx, 0, a.z - nz, b.x - nx, 0, b.z - nz, b.x + nx, 0, b.z + nz);
      pushTri(pos, index, base, base + 1, base + 2);
      pushTri(pos, index, base, base + 2, base + 3);
    }
    for (const p of pts) {
      const center = pos.length / 3;
      pos.push(p.x, 0, p.z);
      for (let k = 0; k < JOIN_SIDES; k += 1) {
        const t = (k / JOIN_SIDES) * Math.PI * 2;
        pos.push(p.x + Math.cos(t) * r, 0, p.z + Math.sin(t) * r);
      }
      for (let k = 0; k < JOIN_SIDES; k += 1) {
        pushTri(pos, index, center, center + 1 + k, center + 1 + ((k + 1) % JOIN_SIDES));
      }
    }
  }
  return flatGeometry(pos, index);
}

/**
 * The near ground as meshes, one per layer (≈10 draw calls). They ignore the
 * depth buffer and are stacked by renderOrder: everything is on the same
 * plane, so depth would only produce flicker. Lots, block and labels come
 * later in the frame and land on top. `toLocal(X, Y)` maps tile coordinates
 * of the data's zoom to local meters; `bounds` is the area to cover with
 * bare land so the block's shadow always has something to fall on.
 */
export function buildVectorGround(data, toLocal, bounds) {
  const group = new THREE.Group();
  let order = -0.95; // after the outer ring (-1), before anything at 0
  const add = (geom, color) => {
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color, depthTest: false, depthWrite: false }));
    mesh.receiveShadow = true;
    mesh.renderOrder = order;
    order += 0.01;
    group.add(mesh);
  };

  const base = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  base.rotateX(-Math.PI / 2);
  base.translate((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  add(base, PALETTE.land);

  for (const kind of POLY_ORDER) {
    if (kind === 'building') continue; // goes on top of the roads, see below
    const polys = data.polys.filter((p) => p.kind === kind);
    if (polys.length) add(polygonGeometry(polys, toLocal), PALETTE[kind]);
  }
  const of = (kind) => data.lines.filter((l) => l.kind === kind);
  if (of('dryWater').length) add(strokeGeometry(of('dryWater'), toLocal), PALETTE.dryWater);
  if (of('water').length) add(strokeGeometry(of('water'), toLocal), PALETTE.water);
  // All casings before all fills, so crossings merge instead of showing a seam.
  if (of('road').length) {
    add(strokeGeometry(of('road'), toLocal, CASING_M), PALETTE.casing);
    add(strokeGeometry(of('road'), toLocal), PALETTE.road);
  }
  if (of('rail').length) add(strokeGeometry(of('rail'), toLocal), PALETTE.rail);
  const buildings = data.polys.filter((p) => p.kind === 'building');
  if (buildings.length) add(polygonGeometry(buildings, toLocal), PALETTE.building);

  return group;
}

// ---------------------------------------------------------------- far ring

/**
 * Paints the same layers into a canvas for the far ring. `tilePx` is the size
 * of one tile in the canvas and `metersPerPx` turns road widths into pixels.
 */
export function paintVectorCanvas(data, range, tilePx, metersPerPx) {
  const canvas = document.createElement('canvas');
  canvas.width = range.cols * tilePx;
  canvas.height = range.rows * tilePx;
  const ctx = canvas.getContext('2d');
  const toPx = ([X, Y]) => [(X - range.x0) * tilePx, (Y - range.y0) * tilePx];
  const trace = (pts) => pts.forEach((p, i) => {
    const [x, y] = toPx(p);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  });

  ctx.fillStyle = PALETTE.land;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const kind of POLY_ORDER) {
    ctx.fillStyle = PALETTE[kind];
    ctx.beginPath();
    for (const p of data.polys) {
      if (p.kind !== kind) continue;
      for (const ring of p.rings) { trace(ring); ctx.closePath(); }
    }
    ctx.fill('evenodd'); // holes (courtyards, islands) stay empty
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const stroke = (kind, color, extra = 0) => {
    ctx.strokeStyle = color;
    for (const l of data.lines) {
      if (l.kind !== kind) continue;
      ctx.lineWidth = Math.max(0.6, (l.width + extra * 2) / metersPerPx);
      ctx.beginPath();
      trace(l.pts);
      ctx.stroke();
    }
  };
  stroke('dryWater', PALETTE.dryWater);
  stroke('water', PALETTE.water);
  stroke('road', PALETTE.casing, CASING_M);
  stroke('road', PALETTE.road);
  stroke('rail', PALETTE.rail);
  return canvas;
}
