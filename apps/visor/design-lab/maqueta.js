// Prototype of the satellite/render mode on Three.js instead of ArcGIS. No
// globe: the loteo is a flat local plane in meters. Satellite stitches map
// tiles into one texture; render draws the ground from vector tiles
// (maqueta-vector.js); lots are their own geometry on top (maqueta-lots.js).
// Goal: compare FPS on low-end phones against SatelliteViewer.jsx before
// replacing anything.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { API_BASE } from '../src/api/config.js';
import { annId } from '../src/lotData.js';
import { getLoteLabels } from '../src/loteLabels.js';
import { isLowTierDevice } from '../src/devicePerf.js';
import { createLotLayer } from '../src/map3d/lotLayer.js';
import { VECTOR_MAX_ZOOM, buildVectorGround, loadVectorRange, paintVectorCanvas } from '../src/map3d/vectorGround.js';

const params = new URLSearchParams(window.location.search);
const LITE = isLowTierDevice(navigator, params.get('lite'));

// ---------------------------------------------------------------- settings

// Satellite tiles. Esri imagery tops out at z18 in most of rural Argentina
// (z19 returns "no data" tiles). MapTiler goes to z22 and serves 512 px tiles
// (twice the detail of a 256 px tile at the same z); it needs a free key
// (VITE_MAPTILER_KEY in .env.local, restricted to our origins in MapTiler's
// dashboard). ?sat=esri|maptiler picks one to compare. Render doesn't use
// raster tiles any more: its ground is drawn from vector tiles
// (maqueta-vector.js), because Esri's gray basemap only had data up to z16
// there and looked blurry up close.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
const SATELLITE_SOURCES = {
  esri: {
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    maxZoom: 18,
    tileSize: 256,
    attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
  },
  maptiler: {
    url: (z, x, y) => `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=${MAPTILER_KEY}`,
    maxZoom: 22,
    tileSize: 512,
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">© MapTiler</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>',
  },
};
// Esri by default: at the test loteo (Misiones) MapTiler's z18-z20 turned out
// to be its z17 image upscaled, blurrier than Esri's z18. MapTiler stays
// behind ?sat=maptiler for checking other areas.
const SATELLITE = SATELLITE_SOURCES[params.get('sat')] ?? SATELLITE_SOURCES.esri;
// Biggest texture we stitch. A 4096² RGBA texture is 64 MB of GPU memory,
// too much for a low-end phone; 2048² is 16 MB.
const MAX_TEXTURE = LITE ? 2048 : 4096;
const INNER_MARGIN_M = 150; // sharp map around the lots
const OUTER_RADIUS_M = 3000; // blurry context ring, hidden by fog at the edge

// Detail patch (satellite only): the stitched ground can't go past ~0.5 m/px
// without blowing the texture budget, so when the camera gets close a small
// sharper square is laid on top around the point being looked at. z19 with
// 512 px tiles ≈ 0.12 m/px, about one texture pixel per screen pixel at the
// distance the camera flies to a lot. ?detail=<z> to try other zooms.
const DETAIL_ZOOM = Number(params.get('detail')) || 19;
const DETAIL_SIZE_M = LITE ? 180 : 260;
const DETAIL_MAX_DIST_M = 450; // farther than this the base ground is enough
const DETAIL_FADE = 0.15; // fraction of each side that fades into the base map

// Same numbers as SatelliteViewer.jsx so the two feel comparable.
const BLOCK_HEIGHT_M = 3;
const BLOCK_GROW_MS = 550;
const BLOCK_COLOR = 0xc5a059;
const FOCUS_TILT_DEG = 55;
const FOCUS_MS = 900;
const ORBIT_DEG_PER_S = 5.5;
const ORBIT_RESUME_MS = 2500;

// Sun at 16 h solar time on the equinox (phase 3b), see sunDirection().
const SUN_HOUR = 16;

// Credits shown in the corner per mode; the text comes from each provider's terms.
const ATTRIBUTION = {
  satellite: SATELLITE.attribution,
  render: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};

const STYLE = {
  satellite: { sky: 0xdfe6ea, fillAlpha: 0.35, text: 0xffffff, halo: 0x000000, haloAlpha: 0.75 },
  render: { sky: 0xf3f1ec, fillAlpha: 0.8, text: 0x1f2937, halo: 0xffffff, haloAlpha: 0.9 },
};

// ---------------------------------------------------------------- geo math

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;

// Local tangent plane around (lat0, lng0): x = meters east, z = meters south
// (so north is -z, "up" on screen with the default camera). Over a couple of
// km the error against a real projection is centimeters.
function makeProjection(lat0, lng0) {
  const k = Math.cos(rad(lat0));
  return {
    toLocal: (lat, lng) => ({ x: R * rad(lng - lng0) * k, z: -R * rad(lat - lat0) }),
    // Inverse of toLocal, for asking tiles around a point of the scene.
    toGeo: (x, z) => ({ lat: lat0 - (z / R) * (180 / Math.PI), lng: lng0 + (x / (R * k)) * (180 / Math.PI) }),
  };
}

// Web Mercator tile coordinates (fractional) for a lat/lng.
const tileX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const tileY = (lat, z) => ((1 - Math.asinh(Math.tan(rad(lat))) / Math.PI) / 2) * 2 ** z;
const tileLng = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

const metersToDeg = (m, lat) => ({ lat: m / 111320, lng: m / (111320 * Math.cos(rad(lat))) });

/**
 * Highest zoom (≤ maxZoom) whose tile grid for the bbox fits in MAX_TEXTURE.
 * tileSize matters: 512 px tiles fill the texture twice as fast per zoom.
 */
function pickTileRange(bbox, maxZoom, tileSize = 256) {
  for (let z = maxZoom; z > 1; z -= 1) {
    const x0 = Math.floor(tileX(bbox.west, z));
    const x1 = Math.floor(tileX(bbox.east, z));
    const y0 = Math.floor(tileY(bbox.north, z));
    const y1 = Math.floor(tileY(bbox.south, z));
    const cols = x1 - x0 + 1;
    const rows = y1 - y0 + 1;
    const side = Math.max(cols, rows) * tileSize;
    if (side > MAX_TEXTURE) continue;
    return { z, x0, x1, y0, y1, cols, rows };
  }
  throw new Error('bbox too large');
}

// Solar direction in local axes for SUN_HOUR on the equinox (declination 0).
// Hour angle H grows in the afternoon; the formulas are the usual
// equatorial → east/north/up rotation with δ = 0.
function sunDirection(lat) {
  const H = rad(15 * (SUN_HOUR - 12));
  const phi = rad(lat);
  const east = -Math.sin(H);
  const north = -Math.cos(H) * Math.sin(phi);
  const up = Math.cos(H) * Math.cos(phi);
  return new THREE.Vector3(east, up, -north).normalize();
}

// ---------------------------------------------------------------- data

// Same sources as the visor: ?data=<group_visor_data url>, or ?p=<project>&l=<loteo>.
async function loadData() {
  let url = params.get('data');
  if (!url && params.get('p')) {
    url = params.get('l')
      ? `${API_BASE}/public/projects/by-slug/${params.get('p')}/loteos/by-slug/${params.get('l')}/group_visor_data`
      : `${API_BASE}/public/projects/by-slug/${params.get('p')}/group_visor_data`;
  }
  if (!url) throw new Error('Falta ?data=<url de group_visor_data> o ?p=<proyecto>&l=<loteo>');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`La API devolvió ${res.status}`);
  const data = await res.json();
  const visors = Array.isArray(data.stages) ? data.stages.map((s) => s.visor).filter(Boolean) : [data];

  // Lots from every stage (they share the geo frame), deduped by id.
  const byId = new Map();
  for (const v of visors) {
    for (const ann of v.annotations ?? []) {
      if (ann.type === 'polygon' && ann.geo_coordinates?.length >= 3) byId.set(annId(ann), ann);
    }
  }
  const anchor = visors.find((v) => v.latitude != null);
  return { lots: [...byId.values()], lat: anchor?.latitude, lng: anchor?.longitude };
}

// ---------------------------------------------------------------- tiles

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = 'anonymous'; // without it the canvas gets tainted and can't be a texture
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null); // a missing tile leaves a hole, not a crash
  img.src = src;
});

/**
 * Stitches the tile grid into one canvas. One texture = one draw call for the
 * whole map, which is the main difference with ArcGIS (hundreds of tiles,
 * streamed and re-tiled while the camera moves).
 */
async function stitchTiles(range, source, onProgress) {
  const size = source.tileSize ?? 256;
  const canvas = document.createElement('canvas');
  canvas.width = range.cols * size;
  canvas.height = range.rows * size;
  const ctx = canvas.getContext('2d');
  const jobs = [];
  for (let ty = range.y0; ty <= range.y1; ty += 1) {
    for (let tx = range.x0; tx <= range.x1; tx += 1) {
      jobs.push(loadImage(source.url(range.z, tx, ty)).then((img) => {
        if (img) ctx.drawImage(img, (tx - range.x0) * size, (ty - range.y0) * size, size, size);
        onProgress?.();
      }));
    }
  }
  await Promise.all(jobs);
  return canvas;
}

// Flat plane covering a tile range, in local meters. Canvas top = north.
function tilePlane(range, texture, proj, material) {
  const nw = proj.toLocal(tileLat(range.y0, range.z), tileLng(range.x0, range.z));
  const se = proj.toLocal(tileLat(range.y1 + 1, range.z), tileLng(range.x1 + 1, range.z));
  const geom = new THREE.PlaneGeometry(se.x - nw.x, se.z - nw.z);
  geom.rotateX(-Math.PI / 2);
  material.map = texture;
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.set((nw.x + se.x) / 2, 0, (nw.z + se.z) / 2);
  return mesh;
}

// ---------------------------------------------------------------- scene

async function main() {
  const loading = document.getElementById('loading');
  const hud = document.getElementById('hud');
  const t0 = performance.now();

  const { lots, lat: visorLat, lng: visorLng } = await loadData();
  if (!lots.length) throw new Error('El loteo no tiene lotes con geo_coordinates');

  // Bbox of the lots; the scene origin is its center.
  const bbox = { north: -90, south: 90, east: -180, west: 180 };
  for (const lot of lots) {
    for (const [la, ln] of lot.geo_coordinates) {
      bbox.north = Math.max(bbox.north, la); bbox.south = Math.min(bbox.south, la);
      bbox.east = Math.max(bbox.east, ln); bbox.west = Math.min(bbox.west, ln);
    }
  }
  const lat0 = (bbox.north + bbox.south) / 2 || visorLat;
  const lng0 = (bbox.east + bbox.west) / 2 || visorLng;
  const proj = makeProjection(lat0, lng0);
  const labels = getLoteLabels(lots);

  const pad = metersToDeg(INNER_MARGIN_M, lat0);
  const innerBox = { north: bbox.north + pad.lat, south: bbox.south - pad.lat, east: bbox.east + pad.lng, west: bbox.west - pad.lng };
  const outer = metersToDeg(OUTER_RADIUS_M, lat0);
  const outerBox = { north: lat0 + outer.lat, south: lat0 - outer.lat, east: lng0 + outer.lng, west: lng0 - outer.lng };

  // Lots in local meters, for picking and for the block.
  const localLots = lots.map((lot) => {
    const pts = lot.geo_coordinates.map(([la, ln]) => proj.toLocal(la, ln));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    return {
      lot, pts,
      minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
      center: new THREE.Vector3(xs.reduce((a, b) => a + b) / xs.length, 0, zs.reduce((a, b) => a + b) / zs.length),
    };
  });

  // Declared first: controls and setMode call requestRender() during setup.
  let needsRender = true;
  function requestRender() { needsRender = true; }
  const stats = { frames: 0, fps: 0, last: performance.now(), frameMs: 0, tiles: 0, zoom: '' };

  // --- renderer
  const canvas = document.getElementById('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LITE ? 1 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The scene is static except for the block: the shadow map is redrawn only
  // when the block changes, not every frame. That makes shadows almost free.
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 6000);

  // Light: ambient + sun tuned so the flat ground keeps its real colors
  // (0.75 + 0.6·sin(elevation≈25°) ≈ 1) and the shadow reads ~25% darker.
  // ×π because since r155 Lambert divides by π: intensity 1 alone would leave
  // the map at ~1/3 of its brightness.
  scene.add(new THREE.AmbientLight(0xffffff, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6 * Math.PI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const sunDir = sunDirection(lat0);

  // --- map layers: an inner ground + an outer ring per mode, built on first use
  let ground = null; // { inner, outer } currently in the scene
  const cache = {};

  // Lots are built once and survive mode switches; only their colors change.
  const lotLayer = createLotLayer(localLots, labels, {
    pixelRatio: renderer.getPixelRatio(),
    anisotropy: LITE ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy()),
  });
  scene.add(lotLayer.group);

  const tex = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = LITE ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  };
  const tileCount = (...ranges) => ranges.reduce((s, r) => s + r.cols * r.rows, 0);
  const progressFor = (total) => {
    let done = 0;
    return () => { done += 1; loading.textContent = `Cargando mapa… ${done}/${total}`; };
  };
  // The outer ring ignores light and never writes depth: it is drawn first
  // (renderOrder -1) and the inner ground always wins on top, no z-fighting.
  const outerRing = (range, canvas2d) => {
    const mesh = tilePlane(range, tex(canvas2d), proj, new THREE.MeshBasicMaterial({ depthWrite: false }));
    mesh.renderOrder = -1;
    return mesh;
  };

  async function buildSatellite() {
    const innerRange = pickTileRange(innerBox, SATELLITE.maxZoom, SATELLITE.tileSize);
    const outerRange = pickTileRange(outerBox, innerRange.z - 2, SATELLITE.tileSize);
    const tiles = tileCount(innerRange, outerRange);
    const progress = progressFor(tiles);
    const [innerCanvas, outerCanvas] = await Promise.all([
      stitchTiles(innerRange, SATELLITE, progress),
      stitchTiles(outerRange, SATELLITE, progress),
    ]);
    const inner = tilePlane(innerRange, tex(innerCanvas), proj, new THREE.MeshLambertMaterial());
    inner.receiveShadow = true;
    // Ground meters per texture pixel: the real measure of detail, since the
    // zoom number alone hides the tile size.
    const mpp = ((156543.03 * Math.cos(rad(lat0))) / 2 ** innerRange.z) * (256 / SATELLITE.tileSize);
    const src = SATELLITE === SATELLITE_SOURCES.maptiler ? 'maptiler' : 'esri';
    return { inner, outer: outerRing(outerRange, outerCanvas), tiles, baseZoom: innerRange.z, zoom: `${innerRange.z}/${outerRange.z} ${src} · ${mpp.toFixed(2)} m/px` };
  }

  async function buildRender() {
    const innerRange = pickTileRange(innerBox, VECTOR_MAX_ZOOM);
    const outerRange = pickTileRange(outerBox, VECTOR_MAX_ZOOM - 2); // fewer minor roads far away
    const tiles = tileCount(innerRange, outerRange);
    const progress = progressFor(tiles);
    const [near, far] = await Promise.all([
      loadVectorRange(innerRange, progress),
      loadVectorRange(outerRange, progress),
    ]);
    const toLocal = (X, Y) => proj.toLocal(tileLat(Y, innerRange.z), tileLng(X, innerRange.z));
    const nw = toLocal(innerRange.x0, innerRange.y0);
    const se = toLocal(innerRange.x1 + 1, innerRange.y1 + 1);
    const inner = buildVectorGround(near, toLocal, { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z });

    // The ring is far and fogged: half the max texture is plenty.
    const tilePx = Math.min(1024, Math.floor(MAX_TEXTURE / 2 / Math.max(outerRange.cols, outerRange.rows)));
    const metersPerPx = ((156543.03 * Math.cos(rad(lat0))) / 2 ** outerRange.z) * (256 / tilePx);
    const outer = outerRing(outerRange, paintVectorCanvas(far, outerRange, tilePx, metersPerPx));
    return { inner, outer, tiles, zoom: `${innerRange.z}/${outerRange.z} vector` };
  }

  async function buildLayers(mode) {
    cache[mode] ??= mode === 'render' ? buildRender() : buildSatellite();
    return cache[mode];
  }

  let mode = params.get('mode') === 'render' ? 'render' : 'satellite';
  async function setMode(next) {
    mode = next;
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    loading.classList.remove('done');
    const layers = await buildLayers(mode);
    if (mode !== next) return; // switched again while loading
    if (ground) scene.remove(ground.inner, ground.outer);
    ground = layers;
    scene.add(ground.outer, ground.inner);
    lotLayer.setStyle(STYLE[mode]);
    document.getElementById('attrib').innerHTML = ATTRIBUTION[mode];
    const sky = new THREE.Color(STYLE[mode].sky);
    scene.background = sky;
    // Fog hides where the outer ring ends.
    scene.fog = new THREE.Fog(sky, 1400, 2900);
    stats.tiles = layers.tiles;
    stats.zoom = layers.zoom;
    renderer.shadowMap.needsUpdate = true;
    loading.classList.add('done');
    requestRender();
  }

  // --- controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = rad(80); // never below the horizon
  controls.minDistance = 25;
  controls.maxDistance = 1500; // past this the end of the world shows through the fog
  controls.screenSpacePanning = false; // pan slides over the ground, not up into the sky
  controls.autoRotateSpeed = ORBIT_DEG_PER_S / 6; // OrbitControls: 1.0 = 6°/s when given a delta
  controls.addEventListener('change', () => requestRender());

  // Frame the whole loteo, north up.
  const span = Math.max(...localLots.map((l) => Math.max(Math.abs(l.minX), Math.abs(l.maxX), Math.abs(l.minZ), Math.abs(l.maxZ))));
  controls.target.set(0, 0, 0);
  camera.position.set(0, span * 2.2, span * 1.8);
  controls.update();

  // Keep the target inside the map so you can't pan off the edge.
  const limit = span + INNER_MARGIN_M;
  controls.addEventListener('change', () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
  });

  // --- detail patch (see DETAIL_ZOOM). One patch at a time: it is rebuilt
  // when the camera target wanders off its center, dropped when zooming out.
  let detail = null; // { mesh, center, z, mpp }
  let detailLoading = false;
  let detailCheckAt = 0;

  function dropDetail() {
    if (!detail) return;
    scene.remove(detail.mesh);
    detail.mesh.geometry.dispose();
    detail.mesh.material.map.dispose();
    detail.mesh.material.dispose();
    detail = null;
    requestRender();
  }

  // Multiplies the canvas alpha by a ramp on each axis, so the patch edge
  // melts into the blurrier base map instead of showing a hard square.
  function fadeEdges(canvas2d) {
    const ctx = canvas2d.getContext('2d');
    ctx.globalCompositeOperation = 'destination-in';
    for (const horizontal of [true, false]) {
      const len = horizontal ? canvas2d.width : canvas2d.height;
      const g = horizontal ? ctx.createLinearGradient(0, 0, len, 0) : ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(DETAIL_FADE, 'rgba(0,0,0,1)');
      g.addColorStop(1 - DETAIL_FADE, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas2d.width, canvas2d.height);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  async function loadDetail(center) {
    const half = DETAIL_SIZE_M / 2;
    const nw = proj.toGeo(center.x - half, center.z - half);
    const se = proj.toGeo(center.x + half, center.z + half);
    const range = pickTileRange({ north: nw.lat, south: se.lat, west: nw.lng, east: se.lng }, Math.min(DETAIL_ZOOM, SATELLITE.maxZoom), SATELLITE.tileSize);
    // Not sharper than the base ground (e.g. Esri, already at its max): skip.
    if (range.z <= ground.baseZoom) return null;
    const canvas2d = await stitchTiles(range, SATELLITE);
    fadeEdges(canvas2d);
    const mesh = tilePlane(range, tex(canvas2d), proj, new THREE.MeshLambertMaterial({
      transparent: true,
      depthWrite: false,
      // In front of the base ground, behind the lots (they use offset -1 and up).
      polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5,
    }));
    mesh.receiveShadow = true;
    mesh.renderOrder = 0.5; // lots are 1+: they still draw on top
    const mpp = ((156543.03 * Math.cos(rad(lat0))) / 2 ** range.z) * (256 / SATELLITE.tileSize);
    return { mesh, center: center.clone(), z: range.z, mpp };
  }

  // Called from the loop a couple of times per second, never per frame.
  function updateDetail() {
    if (mode !== 'satellite' || !ground) { dropDetail(); return; }
    const close = camera.position.distanceTo(controls.target) < DETAIL_MAX_DIST_M;
    if (!close) { dropDetail(); return; }
    // Still covered: the target hasn't left the middle of the current patch.
    if (detail && Math.hypot(controls.target.x - detail.center.x, controls.target.z - detail.center.z) < DETAIL_SIZE_M * 0.2) return;
    if (detailLoading) return;
    detailLoading = true;
    const forMode = mode;
    loadDetail(controls.target).then((next) => {
      detailLoading = false;
      if (!next) return;
      // The user may have zoomed out or switched to render while it loaded.
      if (mode !== forMode) {
        next.mesh.geometry.dispose();
        next.mesh.material.map.dispose();
        next.mesh.material.dispose();
        return;
      }
      dropDetail();
      detail = next;
      scene.add(detail.mesh);
      renderer.shadowMap.needsUpdate = true;
      requestRender();
    });
  }

  // --- selection: gold block + shadow + fly + orbit
  let selected = null;
  let block = null;
  let grow = null; // { start }
  let fly = null; // { start, fromPos, toPos, fromTarget, toTarget }
  let resumeTimer = null;

  function makeBlock(entry) {
    // Shape in (east, north); after rotateX(-90°) the extrusion points up and
    // north lands on -z, matching the ground plane.
    const shape = new THREE.Shape(entry.pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geom = new THREE.ExtrudeGeometry(shape, { depth: BLOCK_HEIGHT_M, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: BLOCK_COLOR, transparent: true, opacity: 0.92 }));
    mesh.castShadow = true;
    // White edges: without them the faces of a low block blend into one tone.
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: 0xffffff })));
    return mesh;
  }

  function select(entry) {
    if (block) {
      scene.remove(block);
      block.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      block = null;
    }
    selected = entry;
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    if (!entry) { renderer.shadowMap.needsUpdate = true; requestRender(); return; }

    block = makeBlock(entry);
    block.scale.y = 0.001;
    scene.add(block);
    grow = { start: performance.now() };

    // Shadow camera only around the lot: small area = sharp shadow with a small map.
    const size = Math.max(entry.maxX - entry.minX, entry.maxZ - entry.minZ) + 40;
    Object.assign(sun.shadow.camera, { left: -size, right: size, top: size, bottom: -size, near: 1, far: 600 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.copy(entry.center);
    sun.position.copy(entry.center).addScaledVector(sunDir, 300);

    // Fly: keep the current heading, set tilt and a distance that fits the lot.
    const dist = Math.max(70, size * 2.2);
    const offset = camera.position.clone().sub(controls.target);
    const heading = Math.atan2(offset.x, offset.z);
    const tilt = rad(FOCUS_TILT_DEG);
    const toPos = entry.center.clone().add(new THREE.Vector3(
      Math.sin(heading) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, Math.cos(heading) * Math.sin(tilt) * dist,
    ));
    fly = { start: performance.now(), fromPos: camera.position.clone(), toPos, fromTarget: controls.target.clone(), toTarget: entry.center.clone() };
    requestRender();
  }

  // Any touch pauses the orbit; it resumes a while after the last one.
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    fly = null;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener('end', () => {
    if (!selected) return;
    resumeTimer = setTimeout(() => { if (selected) { controls.autoRotate = true; requestRender(); } }, ORBIT_RESUME_MS);
  });

  // Picking: one raycast against the ground plane, then point-in-polygon on
  // the lots in meters. No per-lot meshes needed.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const inside = (pts, x, z) => {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      if ((pts[i].z > z) !== (pts[j].z > z)
        && x < ((pts[j].x - pts[i].x) * (z - pts[i].z)) / (pts[j].z - pts[i].z) + pts[i].x) hit = !hit;
    }
    return hit;
  };
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    // A drag is navigation, not a tap.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const p = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
    if (!p) return;
    const hit = localLots.find((l) => p.x >= l.minX && p.x <= l.maxX && p.z >= l.minZ && p.z <= l.maxZ && inside(l.pts, p.x, p.z));
    select(hit && hit !== selected ? hit : null);
  });

  document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    requestRender();
  });

  // --- loop: render only when something changed. Idle = 0 GPU work, which
  // also matters for battery on a phone. (needsRender/stats live at the top.)
  const ease = (t) => 1 - (1 - t) ** 3;
  const projected = new THREE.Vector3();
  let prev = performance.now();

  function tick(now) {
    const dt = (now - prev) / 1000;
    prev = now;

    if (fly) {
      const t = Math.min(1, (now - fly.start) / FOCUS_MS);
      const k = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; // in-out cubic, like ArcGIS goTo
      camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
      if (t === 1) { fly = null; if (selected) controls.autoRotate = true; }
      needsRender = true;
    }
    if (grow && block) {
      const t = Math.min(1, (now - grow.start) / BLOCK_GROW_MS);
      block.scale.y = Math.max(0.001, ease(t));
      renderer.shadowMap.needsUpdate = true;
      if (t === 1) grow = null;
      needsRender = true;
    }
    // Stop orbiting once the lot leaves the screen (user went elsewhere).
    if (controls.autoRotate && selected) {
      projected.copy(selected.center).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) controls.autoRotate = false;
    }
    if (controls.update(dt)) needsRender = true;
    if (now - detailCheckAt > 500) {
      detailCheckAt = now;
      updateDetail();
    }

    if (needsRender) {
      const s = performance.now();
      lotLayer.update(camera, controls.target); // numbers turn with the heading
      renderer.render(scene, camera);
      stats.frameMs = stats.frameMs * 0.9 + (performance.now() - s) * 0.1;
      stats.frames += 1;
      needsRender = false;
    }
    if (now - stats.last >= 1000) {
      stats.fps = Math.round((stats.frames * 1000) / (now - stats.last));
      stats.frames = 0;
      stats.last = now;
      const info = renderer.info;
      hud.textContent = [
        `fps ${stats.fps}${stats.fps === 0 ? ' (quieto, no dibuja)' : ''}`,
        `cpu/cuadro ${stats.frameMs.toFixed(1)} ms`,
        `draw calls ${info.render.calls} · tri ${info.render.triangles}`,
        `teselas ${stats.tiles} · zoom ${stats.zoom}`,
        `detalle ${detail ? `z${detail.z} · ${detail.mpp.toFixed(2)} m/px` : detailLoading ? 'cargando…' : 'no (lejos o sin más zoom)'}`,
        `${LITE ? 'lite' : 'normal'} · dpr ${renderer.getPixelRatio()} · carga ${loadSecs}s`,
      ].join('\n');
    }
    requestAnimationFrame(tick);
  }

  await setMode(mode);
  const loadSecs = ((performance.now() - t0) / 1000).toFixed(1);
  requestAnimationFrame(tick);
}

main().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  loading.classList.remove('done');
  loading.textContent = err.message;
});
