// Top-down map of the editor's geo calibration (GeoCalibrationMap.jsx wraps it
// for React). Same ground as the visor's satellite / render modes (@map3d),
// plus the blueprint image warped onto the map through the calibration's
// homography, the lot outlines and the numbered calibration pins.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { boxAround, createGroundBuilders, disposeObject, makeProjection } from '@map3d/ground.js';
import { applyHomography } from '../utils/homography.js';

const DEFAULT_SPAN_M = 200; // half side to frame when nothing is calibrated yet
const INNER_MARGIN_M = 300; // sharp map around what's framed; roomier than the visor's, lots may be off
const OUTER_RADIUS_M = 3000;
const FIT_MARGIN = 1.2;
// Blueprint warp: the homography is projective, so the image is laid on a grid
// fine enough that straight interpolation inside each cell is invisible.
const WARP_CELLS = 48;
// Zoom = screen px per meter (the camera frustum is in px at zoom 1).
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;

// Above the ground (which stacks itself between -1 and 0): blueprint, then lots.
const ORDER = { blueprint: 10, lots: 11 };
const LOT_COLOR = 0x22d3ee;

/**
 * Builds the map inside `container`. Returns setters for what the React side
 * changes (mode, blueprint, homography, opacity, lots, pins) and dispose().
 *
 * - `latitude`/`longitude`: the loteo's pin, the fallback center.
 * - `focus`: [[lat, lng], ...] to center and frame on (calibration points and
 *   lots already in geo); empty → the pin.
 * - `onPick({ latitude, longitude })`: a click (not a drag) on the map.
 */
export function createGeoMapScene({ container, latitude, longitude, focus = [], onPick, onLoadingChange, onError }) {
  // Origin and framing from what's already known on the map.
  let lat0 = latitude;
  let lng0 = longitude;
  let halfX = DEFAULT_SPAN_M;
  let halfZ = DEFAULT_SPAN_M;
  if (focus.length) {
    const lats = focus.map((p) => p[0]);
    const lngs = focus.map((p) => p[1]);
    lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
    lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  }
  const { toLocal, toGeo } = makeProjection(lat0, lng0);
  if (focus.length > 1) {
    const pts = focus.map(([la, ln]) => toLocal(la, ln));
    // A single pair or a tight cluster still opens at a readable scale.
    halfX = Math.max(60, ...pts.map((p) => Math.abs(p.x)));
    halfZ = Math.max(60, ...pts.map((p) => Math.abs(p.z)));
  }
  const span = Math.max(halfX, halfZ);

  let disposed = false;
  let needsRender = true;
  const requestRender = () => { needsRender = true; };

  // --- renderer
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
  container.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x19191e);
  // Flat full light: the ground materials are Lambert (lit in the visor);
  // ×π because Lambert divides by π since r155.
  scene.add(new THREE.AmbientLight(0xffffff, Math.PI));

  // Straight down, north up: up = -z because the projection puts north on -z.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 5000);
  camera.up.set(0, 0, -1);
  camera.position.set(0, 1000, 0);
  camera.lookAt(0, 0, 0);

  // Pins: HTML over the canvas, crisp at any zoom and easy to style.
  const pinLayer = document.createElement('div');
  pinLayer.className = 'geo-map-pins';
  container.appendChild(pinLayer);

  // --- ground per mode, built on first use and kept for switching back
  const builders = createGroundBuilders({
    toLocal, lat0,
    innerBox: boxAround(lat0, lng0, span + INNER_MARGIN_M),
    outerBox: boxAround(lat0, lng0, OUTER_RADIUS_M),
    maxTexture: Math.min(8192, renderer.capabilities.maxTextureSize),
    anisotropy,
  });
  const cache = {};
  let ground = null;
  let mode = null;

  async function setMode(next) {
    if (next === mode) return;
    mode = next;
    cache[next] ??= builders[next]().catch((err) => { delete cache[next]; throw err; });
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
    onLoadingChange?.(false);
    requestRender();
  }

  // --- blueprint warped through the homography (blueprint [0,1]² → lng/lat)
  const warpGeom = new THREE.BufferGeometry();
  {
    const n = WARP_CELLS + 1;
    const uv = new Float32Array(n * n * 2);
    const index = [];
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const k = j * n + i;
        // The texture is uploaded with flipY off (ImageBitmaps ignore it
        // anyway), so v grows downward like the blueprint's y.
        uv[k * 2] = i / WARP_CELLS;
        uv[k * 2 + 1] = j / WARP_CELLS;
        if (i < WARP_CELLS && j < WARP_CELLS) index.push(k, k + n, k + 1, k + 1, k + n, k + n + 1);
      }
    }
    warpGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    warpGeom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    warpGeom.setIndex(index);
  }
  const warpMat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.5, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const warpMesh = new THREE.Mesh(warpGeom, warpMat);
  warpMesh.renderOrder = ORDER.blueprint;
  warpMesh.frustumCulled = false; // its bounds change with every homography
  warpMesh.visible = false;
  scene.add(warpMesh);
  let homography = null;

  const refreshWarp = () => {
    warpMesh.visible = !!(homography && warpMat.map && warpMat.opacity > 0);
    if (homography) {
      const pos = warpGeom.attributes.position;
      const n = WARP_CELLS + 1;
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const [lng, lat] = applyHomography(homography, [i / WARP_CELLS, j / WARP_CELLS]);
          const p = toLocal(lat, lng);
          pos.setXYZ(j * n + i, p.x, 0, p.z);
        }
      }
      pos.needsUpdate = true;
    }
    requestRender();
  };

  /** Blueprint image (HTMLImageElement / ImageBitmap) or null. */
  function setBlueprint(image) {
    warpMat.map?.dispose();
    warpMat.map = null;
    if (image) {
      const t = new THREE.Texture(image);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropy;
      t.needsUpdate = true;
      warpMat.map = t;
    }
    warpMat.needsUpdate = true;
    refreshWarp();
  }

  /** 3×3 homography blueprint → (lng, lat), or null while there are < 4 valid pairs. */
  function setHomography(H) {
    homography = H;
    refreshWarp();
    applyOrientation();
  }

  // --- orientation: 'plano' turns the map so the blueprint's up is the
  // screen's up (side by side with the blueprint pane, both read the same);
  // 'north' is the usual north up. Without a homography it's always north.
  let orientation = 'plano';
  function applyOrientation() {
    const up = new THREE.Vector3(0, 0, -1);
    if (orientation === 'plano' && homography) {
      // Direction of "up" in the blueprint, measured at its center.
      const at = (u, v) => {
        const [lng, lat] = applyHomography(homography, [u, v]);
        return toLocal(lat, lng);
      };
      const c = at(0.5, 0.5);
      const t = at(0.5, 0.4);
      up.set(t.x - c.x, 0, t.z - c.z).normalize();
    }
    // Still looking straight down at the same spot, only the roll changes.
    camera.up.copy(up);
    camera.lookAt(controls.target);
    controls.update();
    requestRender();
  }

  function setOrientation(next) {
    orientation = next;
    applyOrientation();
  }

  function setOpacity(value) {
    warpMat.opacity = value;
    refreshWarp();
  }

  // --- lot outlines, rebuilt whole on every change (a few hundred segments)
  let lotLines = null;
  function setLots(rings) {
    if (lotLines) { scene.remove(lotLines); disposeObject(lotLines); }
    const pos = [];
    for (const ring of rings) {
      const pts = ring.map(([la, ln]) => toLocal(la, ln));
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        pos.push(p.x, 0, p.z, q.x, 0, q.z);
      });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lotLines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
      color: LOT_COLOR, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false,
    }));
    lotLines.renderOrder = ORDER.lots;
    lotLines.frustumCulled = false;
    scene.add(lotLines);
    requestRender();
  }

  // --- calibration pins: [{ label, geo: [lat, lng] }]
  let pins = [];
  function setPins(list) {
    pinLayer.replaceChildren();
    pins = list.map(({ label, geo }) => {
      const el = document.createElement('div');
      el.className = 'geo-map-pin';
      el.textContent = label;
      pinLayer.appendChild(el);
      const p = toLocal(geo[0], geo[1]);
      return { el, world: new THREE.Vector3(p.x, 0, p.z) };
    });
    requestRender();
  }

  const projected = new THREE.Vector3();
  function placePins() {
    for (const pin of pins) {
      projected.copy(pin.world).project(camera);
      const x = ((projected.x + 1) / 2) * size.w;
      const y = ((1 - projected.y) / 2) * size.h;
      pin.el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }

  // --- controls: pan with drag, wheel zooms toward the cursor, no rotation
  const controls = new MapControls(camera, canvas);
  controls.enableRotate = false;
  controls.screenSpacePanning = true; // the screen plane IS the ground here
  controls.zoomToCursor = true;
  controls.minZoom = MIN_ZOOM;
  controls.maxZoom = MAX_ZOOM;
  controls.enableDamping = false; // precise placement: the map stops where you leave it
  controls.addEventListener('change', requestRender);

  const size = { w: 1, h: 1 };
  const resize = () => {
    size.w = Math.max(1, container.clientWidth);
    size.h = Math.max(1, container.clientHeight);
    renderer.setSize(size.w, size.h, false);
    Object.assign(camera, { left: -size.w / 2, right: size.w / 2, top: size.h / 2, bottom: -size.h / 2 });
    camera.updateProjectionMatrix();
    requestRender();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  // Open framing everything known (or the default square around the pin).
  camera.zoom = THREE.MathUtils.clamp(
    Math.min(size.w / (2 * halfX * FIT_MARGIN), size.h / (2 * halfZ * FIT_MARGIN)), MIN_ZOOM, MAX_ZOOM,
  );
  camera.updateProjectionMatrix();

  // --- picking: a click that didn't move is a pick, anything else is a pan
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let down = null;
  const onPointerDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    if (!down || e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
    const { lat, lng } = toGeo(hit.x, hit.z);
    onPick?.({ latitude: lat, longitude: lng });
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);

  // --- loop: draws only when something changed
  let frame = 0;
  function tick() {
    if (needsRender) {
      renderer.render(scene, camera);
      placePins();
      needsRender = false;
    }
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    controls.dispose();
    if (lotLines) disposeObject(lotLines);
    disposeObject(warpMesh);
    for (const p of Object.values(cache)) {
      p.then((g) => { disposeObject(g.inner); disposeObject(g.outer); }).catch(() => {});
    }
    renderer.dispose();
    canvas.remove();
    pinLayer.remove();
  }

  return { setMode, setBlueprint, setHomography, setOrientation, setOpacity, setLots, setPins, dispose };
}
