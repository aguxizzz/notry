// Top-down map of the editor's geo calibration (GeoCalibrationMap.jsx wraps it
// for React). Same ground as the visor's satellite / render modes (@map3d),
// plus the blueprint image warped onto the map through the calibration's
// homography, the lot outlines, the numbered calibration pins and the texts
// written on the map (same layer as the visor's, @map3d/textLayer.js).
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { boxAround, createGroundBuilders, disposeObject, makeProjection } from '@map3d/ground.js';
import { flatFillGeometry } from '@map3d/flatFill.js';
import { createTextLayer, loadTextFonts } from '@map3d/textLayer.js';
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

// Above the ground (which stacks itself between -1 and 0): blueprint, drawn
// manzanas/calles, lots, texts, and the stroke being drawn on top of everything.
const ORDER = { blueprint: 10, surfaces: 10.5, lots: 11, texts: 11.5, drawing: 12 };
const LOT_COLOR = 0x22d3ee;
// Same colors as the blueprint pane (GeoCalibrationOverlay), so a shape reads
// the same on both sides.
// The perimeter is only a border (fillOpacity 0): filled, it would cover the
// whole loteo and hide everything inside.
const SURFACE_STYLE = {
  manzana: { fill: 0xddb86c, fillOpacity: 0.3, line: 0xddb86c },
  calle: { fill: 0x94a3b8, fillOpacity: 0.55, line: 0xe2e8f0 },
  verde: { fill: 0x4ade80, fillOpacity: 0.35, line: 0x86efac },
  agua: { fill: 0x38bdf8, fillOpacity: 0.45, line: 0x7dd3fc },
  perimetro: { fill: 0xf472b6, fillOpacity: 0, line: 0xf472b6 },
};
const SELECTED_LINE = 0xffffff;
// "Ajustar": how close (screen px) a press must be to a pin or corner to grab it.
const GRAB_PX = 14;
const BLUEPRINT_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const DRAWING_COLOR = 0xf59e0b;

/**
 * CSS color of the lot styles ('rgba(34,197,94,0.15)', '#22c55e') → Three.js
 * color + opacity. THREE.Color drops the alpha of rgba(), so it's read apart.
 * Anything missing or unparseable returns `fallback`.
 */
function cssColor(css, fallback) {
  if (typeof css !== 'string') return fallback;
  const rgba = /^rgba?\(([^)]+)\)$/.exec(css.trim());
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map(Number);
    return { color: new THREE.Color(`rgb(${r},${g},${b})`), opacity: a };
  }
  return css.startsWith('#') ? { color: new THREE.Color(css), opacity: 1 } : fallback;
}

/**
 * Builds the map inside `container`. Returns setters for what the React side
 * changes (mode, blueprint, homography, opacity, lots, pins) and dispose().
 *
 * - `latitude`/`longitude`: the loteo's pin, the fallback center.
 * - `focus`: [[lat, lng], ...] to center and frame on (calibration points and
 *   lots already in geo); empty → the pin.
 * - `onPick({ latitude, longitude })`: a click (not a drag) on the map.
 * - `onAdjust({ phase, target, from, to })`: drag of the blueprint while
 *   setAdjust(true); phase 'start' | 'move' | 'end', target { type: 'move' |
 *   'corner' | 'pin', id? }, from/to as { latitude, longitude } on the ground.
 * - `canDragAt({ latitude, longitude })` → true when a press there grabs
 *   something (a text); the drag then goes to `onDrag({ phase, from, to, alt })`
 *   with the same shape as onAdjust (+ whether Alt is held), and the press is
 *   neither a pan nor a pick.
 */
export function createGeoMapScene({
  container, latitude, longitude, focus = [], onPick, onAdjust, canDragAt, onDrag, onLoadingChange, onError,
}) {
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
    // Recolored with the new ground, not before: while it loads the old one is still shown.
    textLayer?.setMode(next);
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
    const first = !homography && H;
    homography = H;
    refreshWarp();
    // Turned only when the calibration first appears (or on setOrientation),
    // not on every change: while "Ajustar" rotates the blueprint the camera
    // must hold still, or the blueprint would stay put and the photo spin.
    if (first) applyOrientation();
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

  // --- lots: [{ ring: [[lat, lng]...], style? }], filled and outlined with
  // the same per-status style as the blueprint and the panorama (lotStyles.js).
  // Rebuilt whole on every change (a few hundred lots). Lots of the same style
  // share their materials, so a whole status changes color in one place.
  const lotGroup = new THREE.Group();
  scene.add(lotGroup);
  function setLots(lots) {
    for (const child of [...lotGroup.children]) { lotGroup.remove(child); disposeObject(child); }
    const materials = new Map();
    const materialsFor = (style) => {
      const key = `${style?.fill}|${style?.stroke}|${style?.fillOpacity}`;
      if (!materials.has(key)) {
        // No status (a lot still pending) falls back to the old cyan outline,
        // with a faint fill so it still reads as a surface.
        const fill = cssColor(style?.fill, { color: LOT_COLOR, opacity: 0.12 });
        const line = cssColor(style?.stroke, { color: LOT_COLOR, opacity: 0.9 });
        materials.set(key, {
          fill: new THREE.MeshBasicMaterial({
            color: fill.color, opacity: style?.fillOpacity ?? fill.opacity,
            transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
          }),
          line: new THREE.LineBasicMaterial({
            color: line.color, opacity: line.opacity, transparent: true, depthTest: false, depthWrite: false,
          }),
        });
      }
      return materials.get(key);
    };
    for (const { ring, style } of lots) {
      const pts = ring.map(([la, ln]) => toLocal(la, ln));
      const mats = materialsFor(style);
      // Built in (east, north) and laid on the ground with rotateX. A lot has
      // no holes, so ShapeGeometry is safe here (see flatFill.js).
      const geom = new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z))));
      geom.rotateX(-Math.PI / 2);
      const fill = new THREE.Mesh(geom, mats.fill);
      fill.renderOrder = ORDER.lots;
      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, p.z))),
        mats.line,
      );
      // Borders above every fill, so a neighbour's fill never dims them.
      outline.renderOrder = ORDER.lots + 0.1;
      lotGroup.add(fill, outline);
    }
    lotGroup.traverse((o) => { o.frustumCulled = false; });
    requestRender();
  }

  // --- drawn manzanas/calles: [{ kind, id, ring: [[lat, lng]...], holes?,
  // selected?, outlineOnly? }] plus the stroke in progress. Rebuilt whole on
  // every change, like the lots. The merged calles come with holes (the
  // manzanas a street grid encloses); `outlineOnly` is the selection border.
  const surfaceGroup = new THREE.Group();
  scene.add(surfaceGroup);
  const overlayMat = (props) => ({ transparent: true, depthTest: false, depthWrite: false, ...props });

  function setSurfaces({ shapes = [], drawing = [] } = {}) {
    for (const child of [...surfaceGroup.children]) { surfaceGroup.remove(child); disposeObject(child); }
    for (const shape of shapes) {
      // A selected lot comes only as an outline and has no surface style of its own.
      const style = SURFACE_STYLE[shape.kind] ?? SURFACE_STYLE.manzana;
      const local = (ring) => ring.map(([la, ln]) => toLocal(la, ln));
      const outer = local(shape.ring);
      const holes = (shape.holes ?? []).map(local);
      if (!shape.outlineOnly && style.fillOpacity > 0) {
        // Same triangulation as the visor (flatFill.js): ShapeGeometry's
        // earcut can fill a wedge when a polygon has holes.
        const xz = (pts) => pts.map((p) => [p.x, p.z]);
        const geom = flatFillGeometry([{ outer: xz(outer), holes: holes.map(xz) }]);
        const fill = new THREE.Mesh(geom, new THREE.MeshBasicMaterial(overlayMat({
          color: style.fill, opacity: style.fillOpacity, side: THREE.DoubleSide,
        })));
        fill.renderOrder = ORDER.surfaces;
        surfaceGroup.add(fill);
      }
      // Outer border and each hole's; the selection border goes above the rest.
      const lineMat = new THREE.LineBasicMaterial(overlayMat({ color: shape.selected ? SELECTED_LINE : style.line }));
      for (const pts of [outer, ...holes]) {
        const outline = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, 0, p.z))),
          lineMat,
        );
        // The selection border goes over the lots too, or a selected lot's
        // own border would hide it.
        outline.renderOrder = shape.outlineOnly ? ORDER.lots + 0.2 : ORDER.surfaces + 0.1;
        surfaceGroup.add(outline);
      }
    }
    if (drawing.length) {
      const pts = drawing.map(([la, ln]) => {
        const p = toLocal(la, ln);
        return new THREE.Vector3(p.x, 0, p.z);
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial(overlayMat({ color: DRAWING_COLOR })),
      );
      // Vertices as fixed-size dots (sizeAttenuation off = pixels at any zoom).
      const dots = new THREE.Points(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial(overlayMat({ color: DRAWING_COLOR, size: 8, sizeAttenuation: false })),
      );
      line.renderOrder = ORDER.drawing;
      dots.renderOrder = ORDER.drawing;
      surfaceGroup.add(line, dots);
    }
    surfaceGroup.traverse((o) => { o.frustumCulled = false; });
    requestRender();
  }

  // --- texts: [{ id, lat, lng, text, size, angle, font, color, outline }],
  // rebuilt whole on every change (a handful). The selected one gets an amber border.
  let textLayer = null;
  let lastTexts = [[], null];
  // Until the fonts arrive the texts are drawn in the fallback font; once
  // they do, the last texts are built again with the real ones.
  loadTextFonts().then(() => { if (!disposed) setTexts(...lastTexts); });
  function setTexts(texts = [], selectedId = null) {
    lastTexts = [texts, selectedId];
    if (textLayer) { scene.remove(textLayer.group); textLayer.dispose(); }
    const items = texts.map((t) => ({ ...t, ...toLocal(t.lat, t.lng) }));
    // No depth test: this flat map orders its layers by renderOrder alone.
    // `mode` paints the "auto" colored texts like the visor would in that mode.
    textLayer = createTextLayer(items, {
      anisotropy, selectedId, depthTest: false, renderOrder: ORDER.texts, mode: mode ?? 'satellite',
    });
    scene.add(textLayer.group);
    requestRender();
  }

  /** Crosshair while drawing, so a click reads as "add a point", not "pan". */
  function setCursor(drawingTool) {
    canvas.style.cursor = drawingTool ? 'crosshair' : '';
  }

  // --- calibration pins: [{ id, label, geo: [lat, lng] }]
  let pins = [];
  function setPins(list) {
    for (const pin of pins) pin.el.remove();
    pins = list.map(({ id, label, geo }) => {
      const el = document.createElement('div');
      el.className = 'geo-map-pin';
      el.textContent = label;
      pinLayer.appendChild(el);
      const p = toLocal(geo[0], geo[1]);
      return { id, el, world: new THREE.Vector3(p.x, 0, p.z), screen: { x: 0, y: 0 } };
    });
    requestRender();
  }

  // Corners of the warped blueprint, the "Ajustar" scale/rotate handles. HTML
  // like the pins; only shown in adjust mode with a calibration.
  const corners = BLUEPRINT_CORNERS.map(() => {
    const el = document.createElement('div');
    el.className = 'geo-map-handle';
    el.hidden = true;
    pinLayer.appendChild(el);
    return { el, world: new THREE.Vector3(), screen: { x: 0, y: 0 } };
  });
  let adjust = false;
  const cornersActive = () => adjust && !!homography;

  const projected = new THREE.Vector3();
  const toScreen = (world, out) => {
    projected.copy(world).project(camera);
    out.x = ((projected.x + 1) / 2) * size.w;
    out.y = ((1 - projected.y) / 2) * size.h;
  };
  function placePins() {
    for (const pin of pins) {
      toScreen(pin.world, pin.screen);
      pin.el.style.transform = `translate(${pin.screen.x}px, ${pin.screen.y}px)`;
    }
    corners.forEach((c, i) => {
      c.el.hidden = !cornersActive();
      if (c.el.hidden) return;
      const [lng, lat] = applyHomography(homography, BLUEPRINT_CORNERS[i]);
      const p = toLocal(lat, lng);
      c.world.set(p.x, 0, p.z);
      toScreen(c.world, c.screen);
      c.el.style.transform = `translate(${c.screen.x}px, ${c.screen.y}px)`;
    });
  }

  function setAdjust(on) {
    adjust = on;
    if (!on) canvas.style.cursor = '';
    requestRender();
  }

  // --- controls: pan with right drag, wheel zooms toward the cursor, no rotation
  const controls = new MapControls(camera, canvas);
  controls.enableRotate = false;
  // Right drag pans, like the panorama and the blueprint. Left is left for
  // picks and "Ajustar" grabs (null = no action); middle keeps panning too.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
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

  // --- "Ajustar": grab a pin, a corner or the blueprint itself. Listened on
  // the container in the capture phase, so a grab is caught before
  // MapControls (on the canvas) turns the press into a pan.
  const groundAt = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    const { lat, lng } = toGeo(hit.x, hit.z);
    return { latitude: lat, longitude: lng, x: hit.x, z: hit.z };
  };
  // Point-in-quad on the ground: H maps the blueprint's rectangle to a
  // quadrilateral with straight sides, so its 4 corners are enough.
  const insideBlueprint = (x, z) => {
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i, i += 1) {
      const a = corners[i].world;
      const b = corners[j].world;
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  function grabTarget(e) {
    if (!cornersActive()) return null;
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const near = (c) => Math.hypot(c.screen.x - sx, c.screen.y - sy) <= GRAB_PX;
    // Pins first: they're small and often sit right on a corner.
    const pin = pins.find(near);
    if (pin) return { type: 'pin', id: pin.id };
    if (corners.some(near)) return { type: 'corner' };
    const g = groundAt(e);
    return g && insideBlueprint(g.x, g.z) ? { type: 'move' } : null;
  }
  const CURSOR = { pin: 'grab', corner: 'nwse-resize', move: 'move' };

  // { target, from, report }: report is onAdjust for the blueprint's handles
  // and onDrag for something the React side said it can grab (a text).
  let grab = null;
  const geoOf = (g) => ({ latitude: g.latitude, longitude: g.longitude });
  const onGrabMove = (e) => {
    const g = groundAt(e);
    if (grab && g) grab.report?.({ phase: 'move', target: grab.target, from: grab.from, to: geoOf(g), alt: e.altKey });
  };
  const onGrabEnd = (e) => {
    window.removeEventListener('pointermove', onGrabMove);
    window.removeEventListener('pointerup', onGrabEnd);
    const g = groundAt(e);
    if (grab) grab.report?.({ phase: 'end', target: grab.target, from: grab.from, to: g ? geoOf(g) : grab.from });
    grab = null;
  };
  const onGrabStart = (e) => {
    if (e.button !== 0) return;
    // The blueprint's handles first ("Ajustar"); otherwise whatever the React
    // side can grab under the pointer.
    let target = grabTarget(e);
    let report = onAdjust;
    const g = groundAt(e);
    if (!g) return;
    if (!target && canDragAt?.(geoOf(g))) {
      target = { type: 'drag' };
      report = onDrag;
    }
    if (!target) return;
    e.stopPropagation(); // MapControls never sees it: no pan
    e.preventDefault();
    grab = { target, from: geoOf(g), report };
    report?.({ phase: 'start', target, from: grab.from, to: grab.from });
    window.addEventListener('pointermove', onGrabMove);
    window.addEventListener('pointerup', onGrabEnd);
  };
  // Hover cursor tells what a press would grab.
  const onHover = (e) => {
    if (!cornersActive() || grab || e.buttons) return;
    const target = grabTarget(e);
    canvas.style.cursor = target ? CURSOR[target.type] : '';
  };
  container.addEventListener('pointerdown', onGrabStart, true);
  canvas.addEventListener('pointermove', onHover);

  // --- loop: draws only when something changed
  let frame = 0;
  function tick() {
    if (needsRender) {
      textLayer?.update(camera);
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
    container.removeEventListener('pointerdown', onGrabStart, true);
    canvas.removeEventListener('pointermove', onHover);
    window.removeEventListener('pointermove', onGrabMove);
    window.removeEventListener('pointerup', onGrabEnd);
    controls.dispose();
    disposeObject(lotGroup);
    disposeObject(surfaceGroup);
    disposeObject(warpMesh);
    textLayer?.dispose();
    for (const p of Object.values(cache)) {
      p.then((g) => { disposeObject(g.inner); disposeObject(g.outer); }).catch(() => {});
    }
    renderer.dispose();
    canvas.remove();
    pinLayer.remove();
  }

  return {
    setMode, setBlueprint, setHomography, setOrientation, setOpacity, setLots, setPins, setSurfaces, setTexts,
    setCursor, setAdjust, dispose,
  };
}
