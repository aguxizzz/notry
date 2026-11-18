// 3D map of the loteo on Three.js, behind the visor's 'satellite' and 'render'
// modes (MapViewer.jsx wraps it for React). No globe: the loteo is a flat local
// plane in meters with the map stitched into one texture (satellite) or drawn
// from vector tiles (render), and the lots as their own geometry on top.
// Replaced ArcGIS, which was unusable on low-end phones.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { annId } from '../lotData.js';
import { createLotLayer } from './lotLayer.js';
import { boxAround, createGroundBuilders, disposeObject, makeProjection, rad } from './ground.js';
import { geoSurfaceRings, lotGeoRing } from './geoSurfaces.js';
import { SURFACE_STYLE, createSurfaceLayer } from './surfaceLayer.js';
import { createPoiLayer, placePois } from './poiLayer.js';
import { corridorBounds, corridorShape, createCorridorVeil } from './poiCorridor.js';
import { createBuildingLayer, footprintsFromGeoJSON } from './buildingLayer.js';

// ---------------------------------------------------------------- settings

const INNER_MARGIN_M = 150; // sharp map around the lots (and how far you can pan)
// Satellite only: the sharp imagery grows up to this much more where the
// texture allows, so the blurry z-2 ring isn't right next to the loteo.
const SATELLITE_GROW_M = 350;
const OUTER_RADIUS_M = 3000; // blurry context ring, hidden by fog at the edge
const DEFAULT_SPAN_M = 200; // framing when the loteo has no geo lots yet
// Stock fog: starts thinning the map here and hides where the outer ring ends.
const FOG_NEAR_M = 1400;
const FOG_FAR_M = 2900;
const CAMERA_FAR_M = 6000;
const MAX_DISTANCE_M = 1500; // past this the end of the world shows through the fog

// Far POI (poiCorridor.js): the camera rises behind the loteo looking toward
// the place, the fog opens along the way. Fog and flight take the same time
// so closing ends with the camera back over the loteo.
const CORRIDOR_TILT_DEG = 52;
const CORRIDOR_MS = 1100;

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
// Frames further apart than this (under ~20 fps) mean the device can't slide
// smoothly: every step of the slide is a full redraw plus compositing the
// blurred panel on top, and on a low-end phone it stuttered at ~4 fps for a
// second and a half. Then the view jumps to the end instead. Measured between
// frames, not around render(): most of the cost lands outside that call.
const SLOW_FRAME_MS = 50;

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

// ---------------------------------------------------------------- scene

/**
 * Builds the 3D map inside `container` (it adds its own canvas). The scene
 * never decides which lot is selected: the visor tells it with setSelected()
 * (from the panel, the list or a deep link) and it reports taps through
 * `onLotClick(annotation)`. Returns { setMode, setSelected, setInsets, dispose }.
 *
 * - `annotations`: lots of the stage; only polygons that can be placed on the
 *   map are drawn (see lotGeoRing).
 * - `loteLabels`: Map lot id → number shown on the lot.
 * - `geoSurfaces` / `geoCalibrationPoints`: manzanas, calles, verdes and agua drawn in the
 *   editor's satellite view (blueprint coords) and the pairs to place them.
 * - `lite`: low-end device (devicePerf.js), smaller textures and no antialias.
 * - `onLoadingChange(bool)`: while the map of a mode is being downloaded.
 * - `onError(err)`: the map couldn't be built.
 * - `initialInsets`: what the UI covers on start (same shape as setInsets),
 *   so the opening view already leaves the phone's top card out.
 * - `pois` (all POI annotations), `northOffset`, `panoramaWidth`: see
 *   poiLayer.js; `onPoiClick(annotation)` when one is tapped, `onPoiClick(null)`
 *   when the picked one is let go (the × on its label, Esc or a tap on the
 *   map outside the lots). `demoPois` adds
 *   two made-up places inside the loteo (preview only).
 * - `buildingsUrl`: GeoJSON with the footprints of the buildings around
 *   (buildingLayer.js); null = the loteo has none downloaded.
 */
export function createMapScene({
  container, latitude, longitude, annotations, loteLabels, geoSurfaces, geoCalibrationPoints, lite = false,
  onLotClick, onLoadingChange, onError, initialInsets,
  pois = [], northOffset = null, panoramaWidth = null, demoPois = false, onPoiClick, buildingsUrl = null,
}) {
  // Biggest texture we stitch: 4096² RGBA is 64 MB of GPU memory, too much
  // for a low-end phone; 2048² is 16 MB.
  const maxTexture = lite ? 2048 : 4096;

  // Each lot with its outline on the map (see lotGeoRing: from the blueprint
  // and the current calibration when there is one). `lot` stays the original
  // annotation, it's what onLotClick hands back.
  const ringOf = lotGeoRing(geoCalibrationPoints);
  const lots = (annotations || [])
    .filter((a) => a.type === 'polygon')
    .map((lot) => ({ lot, ring: ringOf(lot) }))
    .filter(({ ring }) => ring);

  // Bbox of the lots; the scene origin is its center. Without geo lots it
  // falls back to the loteo's pin.
  const bbox = { north: -90, south: 90, east: -180, west: 180 };
  for (const { ring } of lots) {
    for (const [la, ln] of ring) {
      bbox.north = Math.max(bbox.north, la); bbox.south = Math.min(bbox.south, la);
      bbox.east = Math.max(bbox.east, ln); bbox.west = Math.min(bbox.west, ln);
    }
  }
  const lat0 = lots.length ? (bbox.north + bbox.south) / 2 : latitude;
  const lng0 = lots.length ? (bbox.east + bbox.west) / 2 : longitude;
  const projection = makeProjection(lat0, lng0);
  const { toLocal } = projection;

  // Lots in local meters, for picking, highlight and block.
  const localLots = lots.map(({ lot, ring }) => {
    const pts = ring.map(([la, ln]) => toLocal(la, ln));
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
  const innerBox = boxAround(lat0, lng0, span + INNER_MARGIN_M);
  const outerBox = boxAround(lat0, lng0, OUTER_RADIUS_M);

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
  const camera = new THREE.PerspectiveCamera(45, 1, 1, CAMERA_FAR_M);
  // One fog for both modes (setMode recolors it); a far POI pushes it back.
  const fog = new THREE.Fog(0xffffff, FOG_NEAR_M, FOG_FAR_M);

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

  // Manzanas, calles, verdes, agua and perímetro go under the lots (see the renderOrder in
  // surfaceLayer.js). Verdes and agua are kept off the lots' blueprint outlines.
  const lotBlueprintRings = lots
    .map(({ lot }) => lot.blueprint_coordinates)
    .filter((ring) => ring?.length >= 3);
  const surfaceLayer = createSurfaceLayer(
    geoSurfaceRings(geoSurfaces, geoCalibrationPoints, projection, lotBlueprintRings),
    // The perímetro's veil reaches the end of the blurry outer ring.
    { sunDir, veilRadius: OUTER_RADIUS_M, pixelRatio: renderer.getPixelRatio() },
  );
  scene.add(surfaceLayer.group);

  // --- buildings around: loaded after the scene is up, they never hold the
  // map back. In satellite they take their colors from the ground photo.
  let buildings = null;
  const syncBuildings = () => {
    if (!buildings || !mode) return;
    buildings.setStyle(mode);
    // Sharp photo first, then the blurry ring for the buildings past it.
    buildings.setGround(mode === 'satellite' ? [ground?.inner, ground?.outer] : null);
    requestRender();
  };
  if (buildingsUrl) {
    // A building standing on a lot of the loteo is what's there today (an old
    // shed, a house to be torn down): it would cover the lot being sold.
    const standsOnLot = (x, z) => localLots.some((l) => x >= l.minX && x <= l.maxX && z >= l.minZ && z <= l.maxZ && inside(l.pts, x, z));
    // Low-end devices get the whole file too (~1.5 km, ~10k buildings): it's
    // still 2 draw calls, and a 900 m cut showed a hard edge well inside the fog.
    fetch(buildingsUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((geojson) => {
        if (disposed) return;
        buildings = createBuildingLayer(footprintsFromGeoJSON(geojson, toLocal, standsOnLot));
        scene.add(buildings.group);
        syncBuildings();
      })
      .catch((err) => console.warn('mapScene: no se pudieron cargar los edificios', err));
  }

  // --- ground per mode, built on first use and kept for switching back
  const cache = {};
  let ground = null; // { inner, outer } currently in the scene

  const builders = createGroundBuilders({
    toLocal, lat0, innerBox, outerBox, maxTexture, anisotropy, satelliteGrowM: SATELLITE_GROW_M,
  });

  let mode = null;
  async function setMode(next) {
    if (next === mode) return;
    mode = next;
    // A failed build is forgotten so switching modes again retries it.
    cache[next] ??= (next === 'render' ? builders.render() : builders.satellite())
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
    surfaceLayer.setStyle(SURFACE_STYLE[mode]);
    syncBuildings();
    // ×π because since r155 Lambert divides by π: intensity 1 alone would
    // leave the ground at ~1/3 of its brightness.
    const light = LIGHT[mode];
    ambient.color.set(light.ambientColor);
    ambient.intensity = light.ambient * Math.PI;
    sun.color.set(light.sunColor);
    sun.intensity = light.sun * Math.PI;
    const sky = new THREE.Color(STYLE[mode].sky);
    scene.background = sky;
    fog.color.copy(sky);
    scene.fog = fog;
    // A corridor open while switching: same veil in the new sky, and the
    // ground on the way rebuilt in the new mode's look.
    if (corridor) {
      corridor.veil.setColor(sky);
      leaving?.veil.setColor(sky); // fading out anyway, its ground can stay as is
      loadCorridorGround(corridor);
    }
    refreshBlock(false);
    renderer.shadowMap.needsUpdate = true;
    onLoadingChange?.(false);
    requestRender();
    swapInWider(layers);
  }

  // Satellite: the wider sharp area loads behind the first ground and replaces
  // its inner plane when ready. Taken off `layers` so it's swapped only once,
  // even across mode switches; if satellite isn't on screen by then, it's
  // swapped in the cache and shows up next time.
  function swapInWider(layers) {
    const wider = layers.wider;
    if (!wider) return;
    layers.wider = null;
    wider.then((mesh) => {
      if (disposed) { disposeObject(mesh); return; }
      const old = layers.inner;
      layers.inner = mesh;
      if (ground === layers) {
        scene.remove(old);
        scene.add(mesh);
        syncBuildings(); // colors re-read from the new, wider photo
        requestRender();
      }
      disposeObject(old);
    }).catch(() => {}); // failed: the small sharp area just stays
  }

  // --- controls
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = rad(80); // never below the horizon
  controls.minDistance = 25;
  controls.maxDistance = MAX_DISTANCE_M;
  controls.screenSpacePanning = false; // pan slides over the ground, not up into the sky
  controls.autoRotateSpeed = ORBIT_DEG_PER_S / 6; // OrbitControls: 1.0 = 6°/s when given a delta
  controls.addEventListener('change', requestRender);

  // Keep the target over the sharp map so you can't pan off the edge. An open
  // corridor widens it to reach the far POI (and narrows it back on close).
  const limit = span + INNER_MARGIN_M;
  let panLimit = limit;
  controls.addEventListener('change', () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -panLimit, panLimit);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -panLimit, panLimit);
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

  // --- POIs (preview): pins inside the loteo, edge pills for the rest.
  const placedPois = placePois(pois, {
    geoPoints: geoCalibrationPoints, latitude, longitude, northOffset, panoramaWidth, toLocal,
  });
  if (demoPois) {
    // Two made-up places just outside the lots, to see what an inside POI
    // looks like on a loteo that has none.
    placedPois.push(
      { id: 'demo-acceso', exact: true, x: 0, z: halfZ + 25, ann: { type: 'poi', uuid: 'demo-acceso', tooltip: 'Acceso principal', description: 'POI de prueba.' } },
      { id: 'demo-club', exact: true, x: halfX + 35, z: -halfZ * 0.3, ann: { type: 'poi', uuid: 'demo-club', tooltip: 'Club house', description: 'POI de prueba.' } },
    );
  }
  const poiLayer = createPoiLayer({
    container,
    pois: placedPois,
    getView: () => ({ camera, size, target: controls.target }),
    onPoiClick: (ann) => onPoiClick?.(ann),
    onPoiClose: () => onPoiClick?.(null),
  });

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
  let fly = null; // { start, ms, from, to, fromTarget, toTarget, orbit }; from/to are Sphericals around the target
  let resumeTimer = null;
  // Whether the camera is on the selected lot (orbit allowed). A preset view
  // moves it to the whole loteo and the orbit must not resume around that.
  let onLot = false;

  /**
   * Animated camera move; `orbit` starts the slow turn on arrival. The camera
   * travels as heading/tilt/distance around the target, not in a straight
   * line: a straight line to the other side of the loteo passes right over
   * the target, where the camera looks straight down and spins at once.
   */
  function flyTo(toPos, toTarget, { ms = FOCUS_MS, orbit = false } = {}) {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
    if (prefersReducedMotion()) {
      fly = null;
      camera.position.copy(toPos);
      controls.target.copy(toTarget);
      controls.update();
    } else {
      const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      const to = new THREE.Spherical().setFromVector3(toPos.clone().sub(toTarget));
      // Turn the short way round: ±180° at most.
      const turn = THREE.MathUtils.euclideanModulo(to.theta - from.theta + Math.PI, Math.PI * 2) - Math.PI;
      to.theta = from.theta + turn;
      fly = {
        // A half turn gets 40% more time, or it whips around.
        start: performance.now(), ms: ms * (1 + 0.4 * Math.abs(turn) / Math.PI), orbit,
        from, to, fromTarget: controls.target.clone(), toTarget: toTarget.clone(),
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
    closeCorridor(false); // the flight to the lot below takes the camera back

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

  // --- far POI corridor (poiCorridor.js). `open` runs 0 → 1 while the fog
  // opens and back to 0 on close; `target` is where it's heading. The veil
  // and the stock fog both follow it in tick().
  let corridor = null; // { id, poi, box, veil, ground, open, target, closing, frameDist, camToPoi, fogFrom }
  // The previous far POI's corridor while switching straight to another one:
  // its veil and ground stay and fade out as the new one opens over them.
  // `fadeFrom` is the veil opacity it had when the switch started.
  let leaving = null;
  const corridorGrounds = {}; // `${mode}:${poiId}` → promise of the ground mesh

  // Ground on the way to the POI for the current mode. The fog starts opening
  // only once it's in, so the camera never looks at an empty plain.
  async function loadCorridorGround(c) {
    if (!mode) return;
    const forMode = mode;
    const key = `${forMode}:${c.id}`;
    corridorGrounds[key] ??= builders.far(forMode, c.box)
      .catch((err) => { delete corridorGrounds[key]; throw err; });
    let mesh;
    try {
      mesh = await corridorGrounds[key];
    } catch {
      return; // no ground: the fog just stays closed
    }
    if (disposed || corridor !== c || mode !== forMode) return;
    if (c.ground) scene.remove(c.ground);
    c.ground = mesh;
    scene.add(mesh);
    c.target = 1;
    requestRender();
  }

  function openCorridor(poi) {
    // Another far POI was open: no round trip to the stock fog (which, from
    // 10 km up, fogs the whole map and then sweeps it open again). Its veil
    // crossfades into the new one and the fog moves on from where it is.
    dropCorridor(leaving);
    leaving = null;
    if (corridor) {
      leaving = corridor;
      leaving.fadeFrom = leaving.veil.opacity;
    }
    const fogFrom = { near: fog.near, far: fog.far };
    const shape = corridorShape(poi, span + 300);
    const b = corridorBounds(shape);
    const nw = projection.toGeo(b.minX, b.minZ);
    const se = projection.toGeo(b.maxX, b.maxZ);
    const veil = createCorridorVeil(shape, STYLE[mode ?? 'render'].sky);
    scene.add(veil.mesh);
    // Far enough back for the whole way to fit on screen.
    const frameDist = Math.max(MAX_DISTANCE_M, poi.dist * 1.25);
    // Camera → place distance once framed: the stock fog moves out to just
    // past the place, hiding the far tiles' edges behind it (whole tiles
    // reach well beyond the veil).
    const camToPoi = Math.hypot(poi.dist * 0.7 + Math.sin(rad(CORRIDOR_TILT_DEG)) * frameDist, Math.cos(rad(CORRIDOR_TILT_DEG)) * frameDist);
    corridor = {
      id: poi.id, poi, veil, ground: null, open: 0, target: 0, frameDist, camToPoi, fogFrom,
      box: { north: nw.lat, south: se.lat, west: nw.lng, east: se.lng },
    };
    applyCorridorLimits();
    loadCorridorGround(corridor);

    // Behind the loteo, looking at the place, aimed at a third of the way:
    // further out and the loteo drops off the bottom of the screen.
    const dir = new THREE.Vector3(poi.x / poi.dist, 0, poi.z / poi.dist);
    const target = dir.clone().multiplyScalar(poi.dist * 0.3);
    const tilt = rad(CORRIDOR_TILT_DEG);
    const toPos = target.clone().addScaledVector(dir, -Math.sin(tilt) * frameDist);
    toPos.y = Math.cos(tilt) * frameDist;
    flyTo(toPos, target, { ms: CORRIDOR_MS });
  }

  // Starts closing; removeCorridor() finishes once the fog is back and the
  // camera landed. `flyBack`: return to the loteo (nothing else will move it).
  function closeCorridor(flyBack) {
    if (!corridor) return;
    // A switch still crossfading: the old place's veil goes now, or it would
    // come back into view as this one fades out.
    dropCorridor(leaving);
    leaving = null;
    corridor.target = 0;
    corridor.closing = true;
    // Closing heads back to the stock fog, whatever the opening started from.
    corridor.fogFrom = { near: FOG_NEAR_M, far: FOG_FAR_M };
    if (flyBack && !selected) goToView('overview');
    requestRender();
  }

  // Camera reach and pan room for the open corridor(s): while switching, the
  // bigger of the two, so the camera isn't cut off before it gets back.
  function applyCorridorLimits() {
    const frameDist = Math.max(corridor.frameDist, leaving?.frameDist ?? 0);
    const dist = Math.max(corridor.poi.dist, leaving?.poi.dist ?? 0);
    camera.far = frameDist * 6;
    camera.updateProjectionMatrix();
    controls.maxDistance = frameDist * 1.4;
    panLimit = dist + 500;
  }

  // Takes one corridor's veil and ground out of the scene.
  function dropCorridor(c) {
    if (!c) return;
    scene.remove(c.veil.mesh);
    c.veil.dispose();
    if (c.ground) scene.remove(c.ground); // cached, freed on dispose
  }

  // Drops the corridor at once and puts the stock fog and limits back.
  function removeCorridor() {
    if (!corridor) return;
    dropCorridor(leaving);
    leaving = null;
    dropCorridor(corridor);
    corridor = null;
    fog.near = FOG_NEAR_M;
    fog.far = FOG_FAR_M;
    camera.far = CAMERA_FAR_M;
    camera.updateProjectionMatrix();
    controls.maxDistance = MAX_DISTANCE_M;
    panLimit = limit;
    requestRender();
  }

  // Veil and fog for the current `open` (eased): the veil covers what's off
  // the corridor while the fog moves from where it was (stock, or the
  // previous place's) out to just past this place.
  function applyCorridor() {
    const k = corridor.open < 0.5 ? 2 * corridor.open ** 2 : 1 - (-2 * corridor.open + 2) ** 2 / 2;
    corridor.veil.setOpacity(k);
    fog.near = THREE.MathUtils.lerp(corridor.fogFrom.near, corridor.camToPoi * 1.05, k);
    fog.far = THREE.MathUtils.lerp(corridor.fogFrom.far, corridor.camToPoi * 1.5, k);
    if (!leaving) return;
    leaving.veil.setOpacity(leaving.fadeFrom * (1 - k));
    if (corridor.open === 1) {
      dropCorridor(leaving);
      leaving = null;
      applyCorridorLimits();
    }
  }

  /**
   * Marks the POI with this id (or none) and turns the camera toward it: a
   * near one is framed together with the lots; a far one opens the fog
   * corridor to it (see openCorridor).
   */
  let selectedPoiId = null;
  function setSelectedPoi(id) {
    if (id === selectedPoiId) return;
    selectedPoiId = id;
    poiLayer.setSelected(id);
    requestRender();
    const poi = id == null ? null : poiLayer.find(id);
    if (!poi?.far) closeCorridor(false);
    if (!poi) {
      // Let go (×, Esc or a tap on the map): back over the whole loteo. Not
      // when a lot took its place, that one's flight is already under way.
      if (!selected) goToView('overview');
      return;
    }
    onLot = false;
    if (poi.far) {
      openCorridor(poi);
      return;
    }
    const heading = Math.atan2(poi.x, poi.z);
    const tilt = rad(55);
    const target = new THREE.Vector3(poi.x / 2, 0, poi.z / 2);
    let dist = Math.max(Math.max(halfX, halfZ) * 2.6, poi.dist * 1.4);
    dist = THREE.MathUtils.clamp(dist, controls.minDistance, MAX_DISTANCE_M);
    // Camera on the opposite side from the POI, so it shows up ahead.
    const toPos = target.clone().add(new THREE.Vector3(
      -Math.sin(heading) * Math.sin(tilt) * dist, Math.cos(tilt) * dist, -Math.cos(heading) * Math.sin(tilt) * dist,
    ));
    flyTo(toPos, target, { ms: 1100 });
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
    // A tap on the map outside the lots lets go of the picked POI.
    else if (selectedPoiId != null) onPoiClick?.(null);
  };
  // Esc too, unless it's meant for a field being typed in.
  const onKeyDown = (e) => {
    if (e.key !== 'Escape' || selectedPoiId == null || e.target.matches?.('input, textarea')) return;
    onPoiClick?.(null);
  };
  window.addEventListener('keydown', onKeyDown);
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
  const flySph = new THREE.Spherical(); // reused every flight frame
  let prev = performance.now();
  let frame = 0;

  function tick(now) {
    const frameMs = now - prev;
    const dt = Math.min(0.1, frameMs / 1000);
    prev = now;

    // Slide toward the panel shift instead of jumping when the panel moves,
    // unless the device is too slow to make it look like a slide.
    if (shift.x !== shift.tx || shift.y !== shift.ty) {
      const k = frameMs > SLOW_FRAME_MS ? 1 : 1 - Math.exp(-INSET_EASE * dt);
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
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, k);
      // Distance eased in log scale: going from 300 m to 10 km (a far POI)
      // a plain lerp rushes the first part and crawls at the end.
      flySph.set(
        fly.from.radius * (fly.to.radius / fly.from.radius) ** k,
        THREE.MathUtils.lerp(fly.from.phi, fly.to.phi, k),
        THREE.MathUtils.lerp(fly.from.theta, fly.to.theta, k),
      );
      camera.position.setFromSpherical(flySph).add(controls.target);
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
    if (corridor && corridor.open !== corridor.target) {
      const step = prefersReducedMotion() ? 1 : (dt * 1000) / CORRIDOR_MS;
      corridor.open = corridor.target > corridor.open
        ? Math.min(corridor.target, corridor.open + step)
        : Math.max(corridor.target, corridor.open - step);
      applyCorridor();
      needsRender = true;
    }
    // Closed and the camera is back: only now the stock limits return, or
    // maxDistance would snap the camera mid-flight. `closing`, not just
    // open = 0: a corridor whose ground is still loading is also at 0.
    if (corridor?.closing && corridor.open === 0 && !fly) removeCorridor();
    // Stop orbiting once the lot leaves the screen (the user went elsewhere).
    if (controls.autoRotate && selected) {
      projected.copy(selected.center).project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) controls.autoRotate = false;
    }
    if (controls.update(dt)) needsRender = true;

    if (needsRender) {
      lotLayer.update(camera, controls.target); // numbers turn with the heading
      renderer.render(scene, camera);
      poiLayer.update(); // HTML overlay follows the frame just drawn
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
    window.removeEventListener('keydown', onKeyDown);
    controls.dispose();
    for (const mesh of [block, highlight, hover?.mesh]) removeMesh(mesh);
    lotLayer.dispose();
    surfaceLayer.dispose();
    buildings?.dispose();
    poiLayer.dispose();
    removeCorridor();
    for (const p of Object.values(corridorGrounds)) p.then(disposeObject).catch(() => {});
    // Grounds of both modes, also the one not on screen. A build still in
    // flight is freed when it lands.
    for (const p of Object.values(cache)) {
      p.then((g) => {
        disposeObject(g.inner);
        disposeObject(g.outer);
        g.wider?.then(disposeObject).catch(() => {}); // never swapped in (satellite not shown again)
      }).catch(() => {});
    }
    renderer.dispose();
    canvas.remove();
  }

  return {
    setMode, setSelected, setSelectedPoi, setInsets, goToView,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    dispose,
  };
}
