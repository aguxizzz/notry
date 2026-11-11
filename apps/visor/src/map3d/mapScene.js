// 3D map of the loteo on Three.js, behind the visor's 'satellite' and 'render'
// modes (MapViewer.jsx wraps it for React). No globe: the loteo is a flat local
// plane in meters with the map stitched into one texture (satellite) or drawn
// from vector tiles (render), and the lots as their own geometry on top.
// Replaced ArcGIS, which was unusable on low-end phones.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { annId } from '../lotData.js';
import { createLotLayer } from './lotLayer.js';
import { VECTOR_MAX_ZOOM, buildVectorGround, loadVectorRange, paintVectorCanvas } from './vectorGround.js';

// ---------------------------------------------------------------- settings

// Esri World Imagery, free without a key. Tops out at z18 (~0.5 m/px) in rural
// Argentina; MapTiler was tried and its z19-20 there is its z17 upscaled.
const SATELLITE = {
  url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  maxZoom: 18,
  tileSize: 256,
};

const INNER_MARGIN_M = 150; // sharp map around the lots
const OUTER_RADIUS_M = 3000; // blurry context ring, hidden by fog at the edge
const DEFAULT_SPAN_M = 200; // framing when the loteo has no geo lots yet

// Selected lot: same numbers the ArcGIS version had, tested on a real loteo.
// The block is low on purpose (3 m): marks the lot without reading as a house.
const BLOCK_HEIGHT_M = 3;
const BLOCK_GROW_MS = 550;
const BLOCK_COLOR = 0xc5a059; // brand gold, like the selected lot in panorama
const FOCUS_TILT_DEG = 55;
const FOCUS_MS = 900;
// Preset cameras over the whole loteo, both north up. 'overview' is the 3/4
// view the map opens with; 'top' looks straight down, like the plano.
const VIEWS = {
  overview: { tiltDeg: 40 },
  top: { tiltDeg: 0.05 }, // not exactly 0: straight down, OrbitControls loses the heading
};
const VIEW_MARGIN = 1.15; // breathing room around the lots when framing them
const ZOOM_STEP = 0.7; // distance factor per +/- button press
const ZOOM_MS = 350;
// Slow turn around the selected lot, same speed and pause as panorama's orbit.
const ORBIT_DEG_PER_S = 5.5;
const ORBIT_RESUME_MS = 2500;
// How fast the view slides when the panel opens or closes (per second, as an
// exponential approach; ~0.3 s to get there).
const INSET_EASE = 12;

// Sun at 8 h solar time on the equinox: early morning light from the east,
// same look from any country and hemisphere, ~25-30° high in Argentina.
const SUN_HOUR = 8;

// Light per mode. Ground brightness ≈ ambient + sun·sin(elevation), with
// sin ≈ 0.45 at SUN_HOUR. Satellite stays neutral at ≈1 so the photo keeps its
// real colors; render goes a bit under 1 (less glare on its light palette)
// with a warm sun and a slightly cool fill, like a clear morning.
const LIGHT = {
  satellite: { ambient: 0.75, ambientColor: 0xffffff, sun: 0.6, sunColor: 0xffffff },
  render: { ambient: 0.55, ambientColor: 0xe8eeff, sun: 0.75, sunColor: 0xffd2a0 },
};

const STYLE = {
  satellite: { sky: 0xdfe6ea, fillAlpha: 0.35, text: 0xffffff, halo: 0x000000, haloAlpha: 0.75 },
  render: { sky: 0xf3f1ec, fillAlpha: 0.8, text: 0x1f2937, halo: 0xffffff, haloAlpha: 0.9 },
};

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ---------------------------------------------------------------- geo math

const R = 6378137;
const rad = (d) => (d * Math.PI) / 180;

// Local tangent plane around (lat0, lng0): x = meters east, z = meters south
// (north is -z, "up" on screen with the default camera). Over a couple of km
// the error against a real projection is centimeters.
function makeProjection(lat0, lng0) {
  const k = Math.cos(rad(lat0));
  return (lat, lng) => ({ x: R * rad(lng - lng0) * k, z: -R * rad(lat - lat0) });
}

// Web Mercator tile coordinates (fractional) for a lat/lng, and back.
const tileX = (lng, z) => ((lng + 180) / 360) * 2 ** z;
const tileY = (lat, z) => ((1 - Math.asinh(Math.tan(rad(lat))) / Math.PI) / 2) * 2 ** z;
const tileLng = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

const metersToDeg = (m, lat) => ({ lat: m / 111320, lng: m / (111320 * Math.cos(rad(lat))) });

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

// Sun direction in local axes for SUN_HOUR on the equinox (declination 0):
// the usual equatorial → east/north/up rotation with δ = 0.
function sunDirection(lat) {
  const H = rad(15 * (SUN_HOUR - 12));
  const phi = rad(lat);
  const east = -Math.sin(H);
  const north = -Math.cos(H) * Math.sin(phi);
  const up = Math.cos(H) * Math.cos(phi);
  return new THREE.Vector3(east, up, -north).normalize();
}

// Ray-casting point-in-polygon on the lot outline in meters.
function inside(pts, x, z) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    if ((pts[i].z > z) !== (pts[j].z > z)
      && x < ((pts[j].x - pts[i].x) * (z - pts[i].z)) / (pts[j].z - pts[i].z) + pts[i].x) hit = !hit;
  }
  return hit;
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

// Frees geometries, materials and their textures under an object.
function disposeObject(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m?.map?.dispose();
      m?.dispose();
    }
  });
}

// ---------------------------------------------------------------- scene

/**
 * Builds the 3D map inside `container` (it adds its own canvas). The scene
 * never decides which lot is selected: the visor tells it with setSelected()
 * (from the panel, the list or a deep link) and it reports taps through
 * `onLotClick(annotation)`. Returns { setMode, setSelected, setInsets, dispose }.
 *
 * - `annotations`: lots of the stage; only polygons with geo_coordinates are drawn.
 * - `loteLabels`: Map lot id → number shown on the lot.
 * - `lite`: low-end device (devicePerf.js), smaller textures and no antialias.
 * - `onLoadingChange(bool)`: while the map of a mode is being downloaded.
 * - `onError(err)`: the map couldn't be built.
 * - `initialInsets`: what the UI covers on start (same shape as setInsets),
 *   so the opening view already leaves the phone's top card out.
 */
export function createMapScene({
  container, latitude, longitude, annotations, loteLabels, lite = false,
  onLotClick, onLoadingChange, onError, initialInsets,
}) {
  // Biggest texture we stitch: 4096² RGBA is 64 MB of GPU memory, too much
  // for a low-end phone; 2048² is 16 MB.
  const maxTexture = lite ? 2048 : 4096;

  const lots = (annotations || []).filter((a) => a.type === 'polygon' && a.geo_coordinates?.length >= 3);

  // Bbox of the lots; the scene origin is its center. Without geo lots it
  // falls back to the loteo's pin.
  const bbox = { north: -90, south: 90, east: -180, west: 180 };
  for (const lot of lots) {
    for (const [la, ln] of lot.geo_coordinates) {
      bbox.north = Math.max(bbox.north, la); bbox.south = Math.min(bbox.south, la);
      bbox.east = Math.max(bbox.east, ln); bbox.west = Math.min(bbox.west, ln);
    }
  }
  const lat0 = lots.length ? (bbox.north + bbox.south) / 2 : latitude;
  const lng0 = lots.length ? (bbox.east + bbox.west) / 2 : longitude;
  const toLocal = makeProjection(lat0, lng0);

  // Lots in local meters, for picking, highlight and block.
  const localLots = lots.map((lot) => {
    const pts = lot.geo_coordinates.map(([la, ln]) => toLocal(la, ln));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    return {
      id: annId(lot), lot, pts,
      minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs),
      center: new THREE.Vector3(xs.reduce((a, b) => a + b) / xs.length, 0, zs.reduce((a, b) => a + b) / zs.length),
    };
  });
  const lotById = new Map(localLots.map((l) => [l.id, l]));

  // Half extent of the lots per axis (the origin is their center); span is
  // the bigger of the two, for the map area around them.
  const halfX = localLots.length ? Math.max(...localLots.map((l) => Math.max(-l.minX, l.maxX))) : DEFAULT_SPAN_M;
  const halfZ = localLots.length ? Math.max(...localLots.map((l) => Math.max(-l.minZ, l.maxZ))) : DEFAULT_SPAN_M;
  const span = Math.max(halfX, halfZ);
  const pad = metersToDeg(span + INNER_MARGIN_M, lat0);
  const innerBox = { north: lat0 + pad.lat, south: lat0 - pad.lat, east: lng0 + pad.lng, west: lng0 - pad.lng };
  const outer = metersToDeg(OUTER_RADIUS_M, lat0);
  const outerBox = { north: lat0 + outer.lat, south: lat0 - outer.lat, east: lng0 + outer.lng, west: lng0 - outer.lng };

  let disposed = false;
  let needsRender = true;
  const requestRender = () => { needsRender = true; };

  // --- renderer
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The scene is static except for the block: the shadow map is redrawn only
  // when the block changes, not every frame. That makes shadows almost free.
  renderer.shadowMap.autoUpdate = false;
  const anisotropy = lite ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 6000);

  // Ambient + sun; color and intensity are set per mode in setMode (LIGHT).
  const ambient = new THREE.AmbientLight();
  scene.add(ambient);
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const sunDir = sunDirection(lat0);
  // Aimed from the start, not only when a lot is picked: left at its default
  // (straight overhead) the sun hits the ground at full strength and the
  // render palette burns out to white, roads included.
  sun.position.copy(sunDir).multiplyScalar(300);

  const lotLayer = createLotLayer(localLots, loteLabels ?? new Map(), {
    pixelRatio: renderer.getPixelRatio(),
    anisotropy,
  });
  scene.add(lotLayer.group);

  // --- ground per mode, built on first use and kept for switching back
  const cache = {};
  let ground = null; // { inner, outer } currently in the scene

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

  async function buildSatellite() {
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

  async function buildRender() {
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

  let mode = null;
  async function setMode(next) {
    if (next === mode) return;
    mode = next;
    // A failed build is forgotten so switching modes again retries it.
    cache[next] ??= (next === 'render' ? buildRender() : buildSatellite())
      .catch((err) => { delete cache[next]; throw err; });
    onLoadingChange?.(true);
    let layers;
    try {
      layers = await cache[next];
    } catch (err) {
      if (!disposed && mode === next) { onLoadingChange?.(false); onError?.(err); }
      return;
    }
    if (disposed || mode !== next) return; // switched again while loading
    if (ground) scene.remove(ground.inner, ground.outer);
    ground = layers;
    scene.add(ground.outer, ground.inner);
    lotLayer.setStyle(STYLE[mode]);
    // ×π because since r155 Lambert divides by π: intensity 1 alone would
    // leave the ground at ~1/3 of its brightness.
    const light = LIGHT[mode];
    ambient.color.set(light.ambientColor);
    ambient.intensity = light.ambient * Math.PI;
    sun.color.set(light.sunColor);
    sun.intensity = light.sun * Math.PI;
    const sky = new THREE.Color(STYLE[mode].sky);
    scene.background = sky;
    scene.fog = new THREE.Fog(sky, 1400, 2900); // hides where the outer ring ends
    refreshBlock(false);
    renderer.shadowMap.needsUpdate = true;
    onLoadingChange?.(false);
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
  controls.addEventListener('change', requestRender);

  // Keep the target over the sharp map so you can't pan off the edge.
  const limit = span + INNER_MARGIN_M;
  controls.addEventListener('change', () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
  });

  // --- panel insets: the part of the screen the lot panel covers. The
  // projection center is shifted (setViewOffset) so the camera target sits in
  // the middle of the free area: flights, orbit and framing all stay centered
  // there without touching the camera itself.
  const size = { w: 1, h: 1 };
  const shift = { x: 0, y: 0, tx: 0, ty: 0 }; // current and target, in CSS px
  const applyShift = () => {
    camera.setViewOffset(size.w, size.h, shift.x, shift.y, size.w, size.h);
    camera.updateProjectionMatrix();
  };
  const insets = { top: 0, bottom: 0, left: 0 };
  function setInsets({ top = 0, bottom = 0, left = 0 } = {}) {
    Object.assign(insets, { top, bottom, left });
    // Free area center = screen center + (left/2, (top-bottom)/2); the window
    // moves the opposite way for the content to land there.
    shift.tx = -left / 2;
    shift.ty = (bottom - top) / 2;
    requestRender();
  }

  /**
   * Camera pose that fits all the lots in the part of the screen the panel
   * leaves free, looking north with the given tilt from vertical. Returns
   * { position, target }.
   */
  function viewPose(tiltDeg) {
    const freeW = Math.max(1, size.w - insets.left);
    const freeH = Math.max(1, size.h - insets.top - insets.bottom);
    const tanV = Math.tan(rad(camera.fov / 2));
    // Distance where the lots fill the free area seen from straight above.
    // Tilting makes the near edge come closer and the far one recede; dividing
    // the depth by cos(tilt) is a cheap stand-in that keeps both on screen.
    const tilt = rad(tiltDeg);
    const depth = halfZ / Math.max(0.5, Math.cos(tilt));
    const dist = VIEW_MARGIN * Math.max(depth / (tanV * (freeH / size.h)), halfX / (tanV * camera.aspect * (freeW / size.w)));
    const d = THREE.MathUtils.clamp(dist, controls.minDistance, controls.maxDistance);
    // Camera to the south (+z) of the target, so north (-z) is up on screen.
    const target = new THREE.Vector3(0, 0, 0);
    const position = new THREE.Vector3(0, Math.cos(tilt) * d, Math.sin(tilt) * d);
    return { position, target };
  }

  const resize = () => {
    size.w = Math.max(1, container.clientWidth);
    size.h = Math.max(1, container.clientHeight);
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    applyShift();
    requestRender();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // Open on the whole loteo. After resize and the insets: the framing depends
  // on the aspect and on what the UI covers. The shift is applied at once,
  // there's nothing on screen yet to slide.
  if (initialInsets) {
    setInsets(initialInsets);
    shift.x = shift.tx;
    shift.y = shift.ty;
    applyShift();
  }
  {
    const { position, target } = viewPose(VIEWS.overview.tiltDeg);
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  }

  // --- selection: highlight + gold block (render only) + flight + orbit
  let selected = null;
  let block = null;
  let highlight = null;
  let hover = null; // { entry, mesh }
  let grow = null; // { start }
  let fly = null; // { start, ms, fromPos, toPos, fromTarget, toTarget, orbit }
  let resumeTimer = null;
  // Whether the camera is on the selected lot (orbit allowed). A preset view
  // moves it to the whole loteo and the orbit must not resume around that.
  let onLot = false;

  // Animated camera move; `orbit` starts the slow turn on arrival.
  function flyTo(toPos, toTarget, { ms = FOCUS_MS, orbit = false } = {}) {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    if (prefersReducedMotion()) {
      fly = null;
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
      controls.update();
    } else {
      fly = {
        start: performance.now(), ms, orbit,
        fromPos: camera.position.clone(), toPos: toPos.clone(),
        fromTarget: controls.target.clone(), toTarget: toTarget.clone(),
      };
    }
    requestRender();
  }

  // Flat copy of a lot's outline, laid between the lot fills and the borders.
  const lotMesh = (entry, color, opacity) => {
    const shape = new THREE.Shape(entry.pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2); // (east, north) → (x, 0, z) with north on -z
    const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color, opacity, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -1.5,
    }));
    mesh.renderOrder = 1.5; // over the fills (1), under the borders (2)
    return mesh;
  };

  const removeMesh = (mesh) => {
    if (!mesh) return;
    scene.remove(mesh);
    disposeObject(mesh);
  };

  function makeBlock(entry) {
    // Shape in (east, north); after rotateX(-90°) the extrusion points up.
    const shape = new THREE.Shape(entry.pts.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geom = new THREE.ExtrudeGeometry(shape, { depth: BLOCK_HEIGHT_M, bevelEnabled: false });
    geom.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ color: BLOCK_COLOR, transparent: true, opacity: 0.92 }));
    mesh.castShadow = true;
    // White edges: without them the faces of a low block blend into one tone.
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: 0xffffff })));
    return mesh;
  }

  // Block only in render: over the satellite photo a gold volume covers the
  // very thing the buyer wants to see. `animate` grows it from the ground; on
  // a mode switch it appears already built.
  function refreshBlock(animate) {
    removeMesh(block);
    block = null;
    grow = null;
    if (!selected || mode !== 'render') {
      renderer.shadowMap.needsUpdate = true;
      requestRender();
      return;
    }
    block = makeBlock(selected);
    scene.add(block);
    if (animate && !prefersReducedMotion()) {
      block.scale.y = 0.001;
      grow = { start: performance.now() };
    }
    // Shadow camera only around the lot: small area = sharp shadow with a small map.
    const s = Math.max(selected.maxX - selected.minX, selected.maxZ - selected.minZ) + 40;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 600 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.copy(selected.center);
    sun.position.copy(selected.center).addScaledVector(sunDir, 300);
    renderer.shadowMap.needsUpdate = true;
    requestRender();
  }

  /** Selects the lot with this id (or none), flying to it. */
  function setSelected(id) {
    const entry = id == null ? null : lotById.get(id) ?? null;
    if (entry === selected) return;
    selected = entry;
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    removeMesh(highlight);
    highlight = null;
    refreshBlock(true);
    onLot = false;
    // A lot without geo_coordinates still opens its ficha; the map stays put.
    if (!entry) return;
    onLot = true;

    highlight = lotMesh(entry, BLOCK_COLOR, 0.55);
    scene.add(highlight);

    // Fly: keep the current heading, set the tilt and a distance that fits the lot.
    const s = Math.max(entry.maxX - entry.minX, entry.maxZ - entry.minZ) + 40;
    const dist = Math.max(70, s * 2.2);
    const offset = camera.position.clone().sub(controls.target);
    const heading = Math.atan2(offset.x, offset.z);
    const tilt = rad(FOCUS_TILT_DEG);
    const toPos = entry.center.clone().add(new THREE.Vector3(
      Math.sin(heading) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, Math.cos(heading) * Math.sin(tilt) * dist,
    ));
    flyTo(toPos, entry.center, { orbit: true });
  }

  /** Flies to a preset view of the whole loteo ('overview' or 'top'). */
  function goToView(name) {
    const view = VIEWS[name];
    if (!view) return;
    onLot = false;
    const { position, target } = viewPose(view.tiltDeg);
    flyTo(position, target);
  }

  /** Moves closer (factor < 1) or farther (> 1) along the current view line. */
  function zoomBy(factor) {
    const offset = camera.position.clone().sub(controls.target);
    const d = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    flyTo(controls.target.clone().add(offset.setLength(d)), controls.target, { ms: ZOOM_MS, orbit: onLot && !!selected });
  }

  // Any touch pauses the orbit; it resumes a while after the last one.
  const onControlStart = () => {
    controls.autoRotate = false;
    fly = null;
    clearTimeout(resumeTimer);
  };
  const onControlEnd = () => {
    if (!selected || !onLot || prefersReducedMotion()) return;
    resumeTimer = setTimeout(() => {
      if (selected && onLot && !disposed) { controls.autoRotate = true; requestRender(); }
    }, ORBIT_RESUME_MS);
  };
  controls.addEventListener('start', onControlStart);
  controls.addEventListener('end', onControlEnd);

  // --- picking: one raycast against the ground plane, then point-in-polygon
  // on the lots in meters. No per-lot meshes needed; the block sits on top of
  // its lot, so tapping it hits the same lot.
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hitPoint = new THREE.Vector3();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera); // includes the panel shift (setViewOffset)
    if (!raycaster.ray.intersectPlane(groundPlane, hitPoint)) return null;
    const { x, z } = hitPoint;
    return localLots.find((l) => x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ && inside(l.pts, x, z)) ?? null;
  }

  let down = null;
  const onPointerDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    // A drag is navigation, not a tap.
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    down = null;
    const hit = pick(e);
    if (hit) onLotClick?.(hit.lot);
  };
  // Mouse hover: white veil + pointer cursor, like the other modes. Skipped
  // while a button is down (that's a drag).
  const onPointerMove = (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const hit = pick(e);
    if (hit === (hover?.entry ?? null)) return;
    removeMesh(hover?.mesh);
    hover = hit ? { entry: hit, mesh: lotMesh(hit, 0xffffff, 0.35) } : null;
    if (hover) scene.add(hover.mesh);
    canvas.style.cursor = hit ? 'pointer' : '';
    requestRender();
  };
  const onPointerLeave = () => {
    removeMesh(hover?.mesh);
    hover = null;
    canvas.style.cursor = '';
    requestRender();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);

  // --- loop: draws only when something changed. Idle = no GPU work, which
  // also matters for battery on a phone.
  const ease = (t) => 1 - (1 - t) ** 3;
  const projected = new THREE.Vector3();
  let prev = performance.now();
  let frame = 0;

  function tick(now) {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;

    // Slide toward the panel shift instead of jumping when the panel moves.
    if (shift.x !== shift.tx || shift.y !== shift.ty) {
      const k = 1 - Math.exp(-INSET_EASE * dt);
      shift.x += (shift.tx - shift.x) * k;
      shift.y += (shift.ty - shift.y) * k;
      if (Math.abs(shift.tx - shift.x) < 0.5 && Math.abs(shift.ty - shift.y) < 0.5) {
        shift.x = shift.tx;
        shift.y = shift.ty;
      }
      applyShift();
      needsRender = true;
    }
    if (fly) {
      const t = Math.min(1, (now - fly.start) / fly.ms);
      const k = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; // in-out cubic
      camera.position.lerpVectors(fly.fromPos, fly.toPos, k);
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
      if (t === 1) {
        if (fly.orbit && selected) controls.autoRotate = true;
        fly = null;
      }
      needsRender = true;
    }
    if (grow && block) {
      const t = Math.min(1, (now - grow.start) / BLOCK_GROW_MS);
      block.scale.y = Math.max(0.001, ease(t));
      renderer.shadowMap.needsUpdate = true;
      if (t === 1) grow = null;
      needsRender = true;
    }
    // Stop orbiting once the lot leaves the screen (the user went elsewhere).
    if (controls.autoRotate && selected) {
      projected.copy(selected.center).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) controls.autoRotate = false;
    }
    if (controls.update(dt)) needsRender = true;

    if (needsRender) {
      lotLayer.update(camera, controls.target); // numbers turn with the heading
      renderer.render(scene, camera);
      needsRender = false;
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    clearTimeout(resumeTimer);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    controls.dispose();
    for (const mesh of [block, highlight, hover?.mesh]) removeMesh(mesh);
    lotLayer.dispose();
    // Grounds of both modes, also the one not on screen. A build still in
    // flight is freed when it lands.
    for (const p of Object.values(cache)) {
      p.then((g) => { disposeObject(g.inner); disposeObject(g.outer); }).catch(() => {});
    }
    renderer.dispose();
    canvas.remove();
  }

  return {
    setMode, setSelected, setInsets, goToView,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    dispose,
  };
}
