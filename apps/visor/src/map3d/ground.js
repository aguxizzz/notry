// Map ground shared by the visor's 3D map (mapScene.js) and the editor's geo
// calibration map (apps/editor imports this file through its @map3d alias):
// local-meters projection, tile math, and the satellite / render ground meshes.
// Nothing here knows about lots, selection or cameras.
import * as THREE from 'three';
import { VECTOR_MAX_ZOOM, buildVectorGround, loadVectorRange, paintVectorCanvas } from './vectorGround.js';

// Esri World Imagery, free without a key. Tops out at z18 (~0.5 m/px) in rural
// Argentina; MapTiler was tried and its z19-20 there is its z17 upscaled.
const SATELLITE = {
  url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  maxZoom: 18,
  tileSize: 256,
};

// ---------------------------------------------------------------- geo math

const R = 6378137;
export const rad = (d) => (d * Math.PI) / 180;

/**
 * Local tangent plane around (lat0, lng0): x = meters east, z = meters south
 * (north is -z, "up" on screen with the default camera). Over a couple of km
 * the error against a real projection is centimeters. Returns { toLocal,
 * toGeo }, exact inverses of each other.
 */
export function makeProjection(lat0, lng0) {
  const k = Math.cos(rad(lat0));
  const toLocal = (lat, lng) => ({ x: R * rad(lng - lng0) * k, z: -R * rad(lat - lat0) });
  const toGeo = (x, z) => ({ lat: lat0 - (z / R) * (180 / Math.PI), lng: lng0 + (x / (R * k)) * (180 / Math.PI) });
  return { toLocal, toGeo };
}

// Web Mercator tile coordinates (fractional) for a lat/lng, and back.
const tileX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const tileY = (lat, z) => ((1 - Math.asinh(Math.tan(rad(lat))) / Math.PI) / 2) * 2 ** z;
const tileLng = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

export const metersToDeg = (m, lat) => ({ lat: m / 111320, lng: m / (111320 * Math.cos(rad(lat))) });

/** Box of `meters` around (lat, lng) on each side, as { north, south, east, west }. */
export function boxAround(lat, lng, meters) {
  const d = metersToDeg(meters, lat);
  return { north: lat + d.lat, south: lat - d.lat, east: lng + d.lng, west: lng - d.lng };
}

/** Highest zoom (≤ maxZoom) whose tile grid for the bbox fits in maxTexture. */
function pickTileRange(bbox, maxZoom, maxTexture, tileSize = 256) {
  for (let z = maxZoom; z > 1; z -= 1) {
    const x0 = Math.floor(tileX(bbox.west, z));
    const x1 = Math.floor(tileX(bbox.east, z));
    const y0 = Math.floor(tileY(bbox.north, z));
    const y1 = Math.floor(tileY(bbox.south, z));
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    if (Math.max(cols, rows) * tileSize > maxTexture) continue;
    return { z, x0, x1, y0, y1, cols, rows };
  }
  throw new Error('bbox too large');
}

// ---------------------------------------------------------------- tiles

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // without it the canvas is tainted and can't be a texture
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null); // a missing tile leaves a hole, not a crash
  img.src = src;
});

/**
 * Stitches a tile grid into one canvas. One texture = one draw call for the
 * whole map, the main difference with ArcGIS (hundreds of tiles streamed and
 * re-tiled while the camera moves).
 */
async function stitchTiles(range, source) {
  const size = source.tileSize;
  const canvas = document.createElement('canvas');
  canvas.width = range.cols * size;
  canvas.height = range.rows * size;
  const ctx = canvas.getContext('2d');
  const jobs = [];
  for (let ty = range.y0; ty <= range.y1; ty += 1) {
    for (let tx = range.x0; tx <= range.x1; tx += 1) {
      jobs.push(loadImage(source.url(range.z, tx, ty)).then((img) => {
        if (img) ctx.drawImage(img, (tx - range.x0) * size, (ty - range.y0) * size, size, size);
      }));
    }
  }
  await Promise.all(jobs);
  return canvas;
}

/** Frees geometries, materials and their textures under an object. */
export function disposeObject(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m?.map?.dispose();
      m?.dispose();
    }
  });
}

// ---------------------------------------------------------------- ground

/**
 * Builders for the ground of each mode, around the scene origin. `innerBox` is
 * the sharp area, `outerBox` the blurry context ring. Each builder returns a
 * promise of { inner, outer } meshes; the caller adds, caches and frees them.
 *
 * - `toLocal`: the scene's projection (makeProjection(...).toLocal).
 * - `lat0`: latitude of the origin, for the meters-per-pixel of the far ring.
 * - `maxTexture`: biggest stitched canvas side (2048 on low-end phones).
 */
export function createGroundBuilders({ toLocal, lat0, innerBox, outerBox, maxTexture, anisotropy = 1 }) {
  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };

  // Flat plane covering a tile range, in local meters. Canvas top = north.
  const tilePlane = (range, texture, material) => {
    const nw = toLocal(tileLat(range.y0, range.z), tileLng(range.x0, range.z));
    const se = toLocal(tileLat(range.y1 + 1, range.z), tileLng(range.x1 + 1, range.z));
    const geom = new THREE.PlaneGeometry(se.x - nw.x, se.z - nw.z);
    geom.rotateX(-Math.PI / 2);
    material.map = texture;
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set((nw.x + se.x) / 2, 0, (nw.z + se.z) / 2);
    return mesh;
  };

  // The outer ring ignores light and never writes depth: drawn first
  // (renderOrder -1), the inner ground always wins on top, no z-fighting.
  const outerRing = (range, canvas2d) => {
    const mesh = tilePlane(range, tex(canvas2d), new THREE.MeshBasicMaterial({ depthWrite: false }));
    mesh.renderOrder = -1;
    return mesh;
  };

  async function satellite() {
    const innerRange = pickTileRange(innerBox, SATELLITE.maxZoom, maxTexture, SATELLITE.tileSize);
    const outerRange = pickTileRange(outerBox, innerRange.z - 2, maxTexture, SATELLITE.tileSize);
    const [innerCanvas, outerCanvas] = await Promise.all([
      stitchTiles(innerRange, SATELLITE),
      stitchTiles(outerRange, SATELLITE),
    ]);
    const inner = tilePlane(innerRange, tex(innerCanvas), new THREE.MeshLambertMaterial());
    inner.receiveShadow = true;
    return { inner, outer: outerRing(outerRange, outerCanvas) };
  }

  async function render() {
    const innerRange = pickTileRange(innerBox, VECTOR_MAX_ZOOM, maxTexture);
    const outerRange = pickTileRange(outerBox, VECTOR_MAX_ZOOM - 2, maxTexture); // fewer minor roads far away
    const [near, far] = await Promise.all([loadVectorRange(innerRange), loadVectorRange(outerRange)]);
    const tileToLocal = (X, Y) => toLocal(tileLat(Y, innerRange.z), tileLng(X, innerRange.z));
    const nw = tileToLocal(innerRange.x0, innerRange.y0);
    const se = tileToLocal(innerRange.x1 + 1, innerRange.y1 + 1);
    const inner = buildVectorGround(near, tileToLocal, { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z });

    // The ring is far and fogged: half the max texture is plenty.
    const tilePx = Math.min(1024, Math.floor(maxTexture / 2 / Math.max(outerRange.cols, outerRange.rows)));
    const metersPerPx = ((156543.03 * Math.cos(rad(lat0))) / 2 ** outerRange.z) * (256 / tilePx);
    return { inner, outer: outerRing(outerRange, paintVectorCanvas(far, outerRange, tilePx, metersPerPx)) };
  }

  return { satellite, render };
}
