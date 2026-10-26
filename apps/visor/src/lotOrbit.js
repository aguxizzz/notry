// Órbita 3D alrededor de un lote, sobre el mismo canvas de Photo Sphere Viewer.
//
// Idea: si el terreno es plano, cada punto del suelo se ve desde el dron en una
// dirección conocida, así que el color de ese punto sale directo de la foto
// equirrectangular. El panorama se proyecta por shader sobre un disco de suelo
// + una esfera centrada en el dron: visto desde el dron es idéntico al
// panorama, y al despegar la cámara se puede orbitar.
//
// Se dibuja con el renderer de PSV (mismo contexto WebGL), así se reusa la
// textura ya subida a la GPU en vez de duplicarla, y entrar/salir no tiene
// corte: la cámara arranca y termina exactamente en la pose de PSV.
// Prototipo original: design-lab/orbita-lote.js.

import * as THREE from 'three';
import { annId, annStatus, annPoints, STATUS_COLORS } from './lotData.js';
import './lotOrbit.css';
import { perfMark, perfTime } from './perfTrace.js';

// La altura del dron solo fija la unidad de la escena: con suelo plano todo
// escala junto, así que no cambia lo que se ve.
const DRONE_HEIGHT = 100;
const DRONE = new THREE.Vector3(0, DRONE_HEIGHT, 0);
const GROUND_RADIUS = DRONE_HEIGHT * 25;

const ORBIT_FOV = 38;
const ORBIT_SPEED = THREE.MathUtils.degToRad(5.5); // por segundo
const ORBIT_ELEVATION = THREE.MathUtils.degToRad(40);
// Radio del lote como fracción de media altura de pantalla.
const LOT_FILL = 0.35;
// Nivelación del suelo con la cámara despegada (grados); desde el dron vale 0.
// Por loteo se calcula con fitGroundTilt; este valor fijo (elegido a ojo sobre
// demoloteo) queda de respaldo cuando no hay lotes suficientes para medir.
const LEVEL_TILT_X = -8;
const LEVEL_TILT_Z = -8;
const FIT_MIN_LOTS = 4;
const FIT_MAX_TILT = 15;
const LEVEL_BLEND_SECONDS = 2.2;
// Vuelo de entrada: un solo movimiento desde el dron hasta la órbita.
const FLY_IN_MS = 1600;
// Vuelta al dron: más corta, se repite cada vez que se cierra una ficha.
const FLY_OUT_MS = 1300;
const DRAG_RESUME_MS = 2500;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);
const dirFromAngles = (yaw, pitch) => new THREE.Vector3(
  Math.cos(pitch) * Math.sin(yaw),
  Math.sin(pitch),
  -Math.cos(pitch) * Math.cos(yaw),
);

/**
 * Lotes (anotaciones tipo polygon) en el formato que consume la órbita. El
 * relleno base replica cómo se ven en el panorama: transparente salvo estilo
 * status_fill. Recomendados y modo foco van aparte (focusFill / setFocus).
 */
export function annotationsToOrbitLots(annotations, { badgeStyle = 'default' } = {}) {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .filter((ann) => ann.type === 'polygon' && ann.visible !== false)
    .map((ann) => {
      const statusColor = STATUS_COLORS[annStatus(ann)] ?? '#ffffff';
      return {
        id: annId(ann),
        label: ann.tooltip ?? null,
        points: annPoints(ann),
        statusColor,
        fill: { color: statusColor, opacity: badgeStyle === 'status_fill' ? 0.16 : 0 },
      };
    });
}

/** Si el lote queda afuera del filtro de la lista (visibleIds null = sin filtro). */
export const isFilteredOut = (def, { visibleIds = null } = {}) => Boolean(visibleIds) && !visibleIds.has(def.id);

/**
 * Relleno de un lote de la órbita según filtro y recomendados: oscuro si no
 * pasa el filtro (como en el panorama), dorado si es recomendado, gris en
 * modo foco si no lo es, y si no, su relleno base.
 */
export function focusFill(def, { recommendedIds = null, focusMode = false, visibleIds = null } = {}) {
  if (isFilteredOut(def, { visibleIds })) return { color: 0x0a0a0a, opacity: 0.42 };
  if (recommendedIds?.has(def.id)) return { color: 0xc5a059, opacity: 0.42 };
  if (focusMode && recommendedIds?.size > 0) return { color: 0xa0a0a0, opacity: 0.2 };
  return def.fill;
}

/**
 * Manzanas/calles pintadas (markers de renderSurfacesToMarkers) como
 * superficies planas para la órbita.
 */
export function markersToOrbitSurfaces(markers) {
  return (markers ?? [])
    .filter((marker) => marker.polygonPixels?.length >= 3)
    .map((marker) => ({
      points: marker.polygonPixels,
      color: marker.svgStyle?.fill ?? '#cfc9ba',
      opacity: Number(marker.svgStyle?.fillOpacity ?? 1),
      stroke: marker.svgStyle?.stroke && marker.svgStyle.stroke !== 'none' ? marker.svgStyle.stroke : null,
    }));
}

/**
 * Markers HTML puntuales de PSV (números de lote, POIs con foto o callout,
 * íconos de POI) para dibujarlos encima de la órbita con el mismo aspecto.
 */
export function markersToOrbitPins(markers) {
  return (markers ?? [])
    .filter((marker) => marker.visible !== false && marker.position?.textureX != null && (marker.html || marker.element))
    .map((marker) => {
      const [baseId, kind] = String(marker.id).split('__');
      return {
        id: marker.id,
        badgeOf: kind === 'badge' ? baseId : null,
        html: marker.html ?? null,
        element: marker.element ?? null,
        pixel: [marker.position.textureX, marker.position.textureY],
        size: marker.size ?? null,
        anchor: marker.anchor ?? 'center',
        className: marker.className ?? '',
        opacity: Number(marker.style?.opacity ?? 1),
      };
    });
}

function levelMatrix(mix, tilt) {
  const k = mix * mix * (3 - 2 * mix);
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(tilt.x) * k,
    0,
    THREE.MathUtils.degToRad(tilt.z) * k,
    'XYZ',
  );
  return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
}

const pixelDir = ([x, y], pano) => dirFromAngles((x / pano.fullWidth - 0.5) * Math.PI * 2, (0.5 - y / pano.fullHeight) * Math.PI);

/**
 * Inclinación del suelo para un loteo, medida en sus propios lotes: los lotes
 * son rectángulos, así que con el suelo bien nivelado sus esquinas proyectadas
 * quedan en 90°. Busca la nivelación que minimiza el desvío de esas esquinas.
 * Solo usa lotes de 4 vértices; con menos de FIT_MIN_LOTS devuelve null.
 */
export function fitGroundTilt(lotDefs, pano) {
  const quads = [];
  for (const def of lotDefs ?? []) {
    let points = def.points ?? [];
    const first = points[0];
    const last = points[points.length - 1];
    if (points.length > 3 && first[0] === last[0] && first[1] === last[1]) points = points.slice(0, -1);
    if (points.length === 4) quads.push(points.map((p) => pixelDir(p, pano)));
  }
  if (quads.length < FIT_MIN_LOTS) return null;

  const probe = new THREE.Vector3();
  const ground = [0, 1, 2, 3].map(() => new THREE.Vector2());
  const a = new THREE.Vector2();
  const b = new THREE.Vector2();
  const cost = (x, z) => {
    const matrix = levelMatrix(1, { x, z });
    let total = 0;
    for (const dirs of quads) {
      for (let i = 0; i < 4; i += 1) {
        if (!groundPoint(dirs[i], matrix, probe)) return Infinity;
        ground[i].set(probe.x, probe.z);
      }
      for (let i = 0; i < 4; i += 1) {
        a.subVectors(ground[(i + 3) % 4], ground[i]).normalize();
        b.subVectors(ground[(i + 1) % 4], ground[i]).normalize();
        // cos del ángulo de la esquina: 0 en 90°.
        total += a.dot(b) ** 2;
      }
    }
    return total;
  };

  // Grilla gruesa y después fina alrededor del mejor.
  let best = { x: 0, z: 0, cost: cost(0, 0) };
  const search = (cx, cz, span, step) => {
    for (let x = cx - span; x <= cx + span + 1e-9; x += step) {
      for (let z = cz - span; z <= cz + span + 1e-9; z += step) {
        if (Math.abs(x) > FIT_MAX_TILT || Math.abs(z) > FIT_MAX_TILT) continue;
        const c = cost(x, z);
        if (c < best.cost) best = { x, z, cost: c };
      }
    }
  };
  search(0, 0, FIT_MAX_TILT, 1);
  search(best.x, best.z, 1, 0.25);
  return { x: best.x, z: best.z, lots: quads.length };
}

const scratch = new THREE.Vector3();
// Punto del suelo que el dron ve en la dirección `dir`; null si no cae en el
// suelo (sobre el horizonte).
function groundPoint(dir, level, out) {
  scratch.copy(dir).applyMatrix3(level);
  if (scratch.y > -0.03) return null;
  const t = DRONE_HEIGHT / -scratch.y;
  return out.set(scratch.x * t, 0, scratch.z * t);
}

function createPanoMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uDrone: { value: DRONE },
      uLevelInv: { value: new THREE.Matrix3() },
      uLod: { value: 0 },
      uFocus: { value: new THREE.Vector3() },
      uFocusRadius: { value: 1 },
      uDim: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uDrone;
      uniform mat3 uLevelInv;
      uniform float uLod;
      uniform vec3 uFocus;
      uniform float uFocusRadius;
      uniform float uDim;
      varying vec3 vWorld;
      const float PI = 3.141592653589793;
      void main() {
        vec3 d = normalize(uLevelInv * (vWorld - uDrone));
        float lon = atan(d.x, -d.z);
        float lat = asin(clamp(d.y, -1.0, 1.0));
        float u = lon / (2.0 * PI) + 0.5;
        float v = lat / PI + 0.5;
        // La costura de atan() rompe las derivadas y deja una línea: se calculan
        // con dos parametrizaciones y se usa la que no salta.
        float uAlt = fract(u + 0.5);
        float dudx = abs(dFdx(u)) < abs(dFdx(uAlt)) ? dFdx(u) : dFdx(uAlt);
        float dudy = abs(dFdy(u)) < abs(dFdy(uAlt)) ? dFdy(u) : dFdy(uAlt);
        // uLod 0 = sin mipmaps, igual a como PSV dibuja el panorama; sube a 1 al
        // despegar, donde el suelo rasante sin mipmaps titila.
        vec4 color = textureGrad(uMap, vec2(u, v), uLod * vec2(dudx, dFdx(v)), uLod * vec2(dudy, dFdy(v)));
        // Con un lote elegido, el entorno se oscurece de a poco hacia afuera
        // para que el lote quede como foco.
        float away = smoothstep(uFocusRadius * 1.3, uFocusRadius * 7.0, distance(vWorld, uFocus));
        color.rgb *= 1.0 - 0.5 * uDim * away;
        gl_FragColor = color;
      }
    `,
    side: THREE.DoubleSide,
  });
}

/**
 * @param {import('@photo-sphere-viewer/core').Viewer} viewer
 * @param {object} options
 * @param {(id: string) => void} [options.onPick] - click en otro lote estando en órbita
 * @param {() => ({ right?: number, bottom?: number } | null)} [options.getInsets] -
 *   px que tapa la ficha del lote; el lote se encuadra en lo que queda libre
 * @param {(yaw: number) => void} [options.onHeading] - rumbo de la cámara
 *   (mismo marco que el yaw de PSV) mientras manda la órbita, para la brújula
 */
export function createLotOrbit(viewer, { onPick, getInsets, onHeading, mipmaps = true } = {}) {
  let gl = null;
  let scene = null;
  let panoMaterial = null;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.5, GROUND_RADIUS * 4);
  const lotGroup = new THREE.Group();

  let lotDefs = [];
  let focus = {};
  let surfaceDefs = [];
  let pinDefs = [];
  let pinsDirty = true;
  let pins = [];
  let lotsDirty = true;
  let lots = [];
  let surfaces = [];
  let selected = null;
  let hovered = null;
  let accent = new THREE.Color(0xc5a059);

  // mode: 'idle' (manda PSV) | 'fly' (transición) | 'orbit' | 'return'
  let mode = 'idle';
  let tween = null;
  let holdFrames = 0;
  let levelMix = 0;
  let levelGoal = 0;
  let levelSeconds = LEVEL_BLEND_SECONDS;
  let tilt = { x: LEVEL_TILT_X, z: LEVEL_TILT_Z };
  let level = levelMatrix(0, tilt);
  let prewarmTimer = null;
  const cam = { pos: DRONE.clone(), target: new THREE.Vector3(), fov: 60, off: new THREE.Vector2() };
  const drone = { yaw: 0, pitch: 0, fov: 60 };
  const orbit = { az: 0, el: ORBIT_ELEVATION, dist: 100, pausedUntil: 0, startedAt: 0 };

  // ------------------------------------------------------------ DOM

  // Capa que captura los gestos mientras la órbita está activa: PSV no debe
  // enterarse (su cámara queda congelada en la pose de salida).
  const overlay = document.createElement('div');
  overlay.className = 'lot-orbit-overlay';
  overlay.hidden = true;
  // Números de lote y POIs: los markers de PSV se ocultan en órbita, así que
  // se redibujan acá (mismo HTML) y se ubican cada cuadro con la cámara 3D.
  const pinLayer = document.createElement('div');
  pinLayer.className = 'lot-orbit-pins';
  const hoverLabel = document.createElement('div');
  hoverLabel.className = 'lot-orbit-hover';
  overlay.append(pinLayer, hoverLabel);
  viewer.container.appendChild(overlay);

  // ------------------------------------------------------------ escena

  function ensureScene() {
    if (scene) return;
    scene = new THREE.Scene();
    panoMaterial = createPanoMaterial();
    // Suelo hasta ~87° desde la vertical; de ahí en más (y el cielo) lo cubre
    // una esfera centrada en el dron que toca el suelo en el borde del disco.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_RADIUS, 128).rotateX(-Math.PI / 2), panoMaterial);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(Math.hypot(GROUND_RADIUS, DRONE_HEIGHT), 96, 48), panoMaterial);
    sky.position.copy(DRONE);
    ground.frustumCulled = false;
    sky.frustumCulled = false;
    scene.add(sky, ground, lotGroup);
  }

  // PSV sube el panorama sin mipmaps (desde el dron no hacen falta). En órbita
  // el suelo lejano se ve rasante y sin mipmaps titila. Resubir la textura al
  // primer click congela la pantalla, así que se marca apenas carga el
  // panorama, antes de que PSV la suba: los mipmaps se generan en esa misma
  // subida (tapada por la pantalla de carga). El filtrado queda lineal, o sea
  // que PSV la sigue dibujando igual; en órbita se cambia con setSharedFiltering.
  // Con `mipmaps: false` (gama baja) no se generan: con panoramas grandes son
  // +33% de memoria de GPU y el filtrado trilineal + anisotrópico la satura.
  function onPanoramaLoaded({ data }) {
    const texture = data?.texture;
    if (!texture?.isTexture) return;
    const uploaded = viewer.renderer.renderer?.properties.get(texture).__webglTexture;
    if (uploaded) return;
    texture.generateMipmaps = mipmaps;
    texture.wrapS = THREE.RepeatWrapping;
    perfMark(`órbita: panorama ${texture.image?.width}×${texture.image?.height}, mipmaps ${mipmaps ? 'sí' : 'no'}`);
  }
  viewer.addEventListener('panorama-loaded', onPanoramaLoaded);

  // Deja listo todo lo que si no se haría en el primer click: geometría de los
  // lotes y compilación de shaders.
  function prewarm() {
    prewarmTimer = null;
    if (mode !== 'idle' || !isSupported()) return;
    try {
      ensureScene();
      if (lotsDirty) perfTime('órbita: prewarm buildLots', buildLots);
      perfTime('órbita: prewarm compile', () => viewer.renderer.renderer.compile(scene, camera));
    } catch (_) { /* es solo una optimización: el primer click lo resuelve */ }
  }

  // Respaldo por si la textura ya estaba subida sin mipmaps: se recrea la
  // textura GL. Devuelve true si hubo que recrearla.
  function prepareTexture(texture) {
    if (texture.generateMipmaps === mipmaps && texture.wrapS === THREE.RepeatWrapping) return false;
    texture.dispose();
    texture.generateMipmaps = mipmaps;
    texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    texture.anisotropy = mipmaps ? gl.capabilities.getMaxAnisotropy() : 1;
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return true;
  }

  // Fuera de la órbita la textura vuelve al filtrado original de PSV (lineal,
  // sin mipmaps ni anisotropía) para que el panorama se vea igual que siempre.
  // three solo aplica los parámetros al subir la textura, y resubirla es caro:
  // se cambian directo en GL.
  function setSharedFiltering(mipmapped) {
    if (!mipmaps) return;
    const texture = panoMaterial?.uniforms.uMap.value;
    const handle = texture && gl?.properties.get(texture).__webglTexture;
    if (!handle) return;
    const ctx = gl.getContext();
    gl.state.bindTexture(ctx.TEXTURE_2D, handle);
    ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, mipmapped ? ctx.LINEAR_MIPMAP_LINEAR : ctx.LINEAR);
    const anisotropic = gl.extensions.get('EXT_texture_filter_anisotropic');
    if (anisotropic) ctx.texParameterf(ctx.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, mipmapped ? gl.capabilities.getMaxAnisotropy() : 1);
  }

  function isSupported() {
    const textureData = viewer.state.textureData;
    const pano = textureData?.panoData;
    if (!textureData?.texture?.isTexture || !pano) return false;
    const fullSphere = pano.croppedWidth === pano.fullWidth && pano.croppedHeight === pano.fullHeight;
    const posed = pano.poseHeading || pano.posePitch || pano.poseRoll;
    if (!fullSphere || posed || viewer.config.fisheye) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ------------------------------------------------------------ lotes

  function disposeLots() {
    for (const lot of lots) {
      lot.fill.geometry.dispose(); lot.fill.material.dispose();
      lot.outline.geometry.dispose(); lot.outline.material.dispose();
      lot.wall.geometry.dispose(); lot.wall.material.dispose();
    }
    for (const surface of surfaces) {
      surface.fill.geometry.dispose(); surface.fill.material.dispose();
      surface.outline?.geometry.dispose(); surface.outline?.material.dispose();
    }
    lotGroup.clear();
    lots = [];
    surfaces = [];
  }

  // Polígono en píxeles del panorama → direcciones desde el dron + geometría
  // plana (los vértices se ubican después, en placeLots). null si no apoya
  // entero en el suelo.
  function groundPolygon(pixels, pano, levels) {
    let points = pixels;
    const first = points[0];
    const last = points[points.length - 1];
    if (points.length > 3 && first[0] === last[0] && first[1] === last[1]) points = points.slice(0, -1);
    if (points.length < 3) return null;

    const probe = new THREE.Vector3();
    const dirs = points.map(([x, y]) => {
      const lon = (x / pano.fullWidth - 0.5) * Math.PI * 2;
      const lat = (0.5 - y / pano.fullHeight) * Math.PI;
      return dirFromAngles(lon, lat);
    });
    if (dirs.some((d) => levels.some((matrix) => !groundPoint(d, matrix, probe)))) return null;

    const flat = dirs.map((d) => { groundPoint(d, levels[1], probe); return new THREE.Vector2(probe.x, probe.z); });
    const position = new THREE.BufferAttribute(new Float32Array(dirs.length * 3), 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position);
    geometry.setIndex(THREE.ShapeUtils.triangulateShape(flat, []).flat());
    const outlineGeometry = new THREE.BufferGeometry();
    outlineGeometry.setAttribute('position', position);
    return { dirs, points: dirs.map(() => new THREE.Vector3()), position, geometry, outlineGeometry };
  }

  function buildLots() {
    const selectedId = selected?.id ?? null;
    disposeLots();
    lotsDirty = false;
    selected = null;
    hovered = null;
    const pano = viewer.state.textureData?.panoData;
    if (!pano) return;

    tilt = fitGroundTilt(lotDefs, pano) ?? { x: LEVEL_TILT_X, z: LEVEL_TILT_Z };

    // Un polígono que toca el horizonte (con o sin nivelación) no tiene suelo
    // donde apoyarse.
    const levels = [levelMatrix(0, tilt), levelMatrix(1, tilt)];

    for (const def of surfaceDefs) {
      const polygon = groundPolygon(def.points, pano, levels);
      if (!polygon) continue;
      const fill = new THREE.Mesh(polygon.geometry, new THREE.MeshBasicMaterial({
        color: def.color, opacity: def.opacity, transparent: true, depthTest: false, side: THREE.DoubleSide,
      }));
      fill.renderOrder = 0.25;
      const outline = def.stroke
        ? new THREE.LineLoop(polygon.outlineGeometry, new THREE.LineBasicMaterial({ color: def.stroke, transparent: true, depthTest: false }))
        : null;
      if (outline) outline.renderOrder = 0.5;
      else polygon.outlineGeometry.dispose();
      for (const object of [fill, outline]) {
        if (!object) continue;
        object.frustumCulled = false;
        lotGroup.add(object);
      }
      surfaces.push({ ...polygon, fill, outline });
    }

    for (const def of lotDefs) {
      const polygon = groundPolygon(def.points, pano, levels);
      if (!polygon) continue;
      const n = polygon.dirs.length;

      const fill = new THREE.Mesh(polygon.geometry, new THREE.MeshBasicMaterial({
        transparent: true, depthTest: false, side: THREE.DoubleSide,
      }));
      fill.renderOrder = 1;
      const outline = new THREE.LineLoop(polygon.outlineGeometry, new THREE.LineBasicMaterial({ transparent: true, depthTest: false }));
      outline.renderOrder = 2;

      // "Cerco" de luz que se levanta desde el borde del lote elegido.
      const wallColors = [];
      for (let i = 0; i < n; i += 1) {
        for (const top of [0, 0, 1, 0, 1, 1]) wallColors.push(1, 1, 1, top ? 0 : 0.95);
      }
      const wallGeometry = new THREE.BufferGeometry();
      wallGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 18), 3));
      wallGeometry.setAttribute('color', new THREE.Float32BufferAttribute(wallColors, 4));
      const wall = new THREE.Mesh(wallGeometry, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthTest: false, side: THREE.DoubleSide,
      }));
      wall.renderOrder = 3;
      wall.visible = false;

      for (const object of [fill, outline, wall]) object.frustumCulled = false;

      const lot = { ...polygon, id: def.id, def, fill, outline, wall, wallT: 0, center: new THREE.Vector3(), radius: 1 };
      fill.userData.lot = lot;
      lots.push(lot);
      lotGroup.add(fill, outline, wall);
    }

    selected = lots.find((lot) => lot.id === selectedId) ?? null;
    placeLots();
    styleLots();
  }

  // Recalcula la posición de los lotes sobre el suelo con la nivelación actual.
  function placePolygon({ dirs, points, position }) {
    for (let i = 0; i < dirs.length; i += 1) {
      groundPoint(dirs[i], level, points[i]);
      position.setXYZ(i, points[i].x, 0, points[i].z);
    }
    position.needsUpdate = true;
  }

  function placeLots() {
    for (const surface of surfaces) placePolygon(surface);
    for (const lot of lots) {
      placePolygon(lot);
      const { points } = lot;
      const n = points.length;
      lot.center.set(0, 0, 0);
      for (const point of points) lot.center.add(point);
      lot.center.divideScalar(n);
      lot.radius = Math.max(...points.map((p) => p.distanceTo(lot.center)));
      lot.fill.geometry.computeBoundingSphere();

      const wallHeight = lot.radius * 0.4;
      const wall = lot.wall.geometry.attributes.position;
      let v = 0;
      for (let i = 0; i < n; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % n];
        for (const [p, top] of [[a, 0], [b, 0], [b, 1], [a, 0], [b, 1], [a, 1]]) {
          wall.setXYZ(v, p.x, top * wallHeight, p.z);
          v += 1;
        }
      }
      wall.needsUpdate = true;
    }
  }

  function styleLots() {
    for (const lot of lots) {
      const isSelected = lot === selected;
      const isHovered = lot === hovered;
      const base = focusFill(lot.def, focus);
      lot.fill.material.color.set(isSelected ? accent : isHovered ? lot.def.statusColor : base.color);
      lot.fill.material.opacity = isSelected ? 0.3 : isHovered ? 0.36 : base.opacity * (selected ? 0.45 : 1);
      lot.outline.material.color.set(isSelected ? accent : 0xffffff);
      lot.outline.material.opacity = isSelected ? 1 : isFilteredOut(lot.def, focus) ? 0.3 : selected ? 0.4 : 0.85;
      lot.wall.material.color.set(accent);
      lot.wall.visible = isSelected;
      if (!isSelected) lot.wallT = 0;
    }
  }

  // ------------------------------------------------------------ pines

  function buildPins() {
    pinsDirty = false;
    pinLayer.replaceChildren();
    pins = [];
    const pano = viewer.state.textureData?.panoData;
    if (!pano) return;
    for (const def of pinDefs) {
      const el = document.createElement('div');
      el.className = `lot-orbit-pin ${def.className}`;
      if (def.size) {
        el.style.width = `${def.size.width}px`;
        el.style.height = `${def.size.height}px`;
      }
      if (def.element) {
        // Copia del marker de PSV; el original lo sigue manejando PSV. Sin su
        // updateMarker, se fija la escala que tiene con el zoom por defecto.
        const copy = def.element.cloneNode(true);
        copy.style.setProperty('--poi-callout-font-size', '16.5px');
        copy.style.setProperty('--poi-callout-marker-scale', '1');
        el.appendChild(copy);
      } else {
        el.innerHTML = def.html;
      }
      pinLayer.appendChild(el);
      const [x, y] = def.pixel;
      pins.push({
        def,
        el,
        dir: dirFromAngles((x / pano.fullWidth - 0.5) * Math.PI * 2, (0.5 - y / pano.fullHeight) * Math.PI),
        shift: def.anchor.startsWith('bottom') ? '-100%' : '-50%',
        shown: null,
      });
    }
  }

  const pinWorld = new THREE.Vector3();
  const pinNdc = new THREE.Vector3();
  function placePins() {
    if (pinsDirty) perfTime(`órbita: buildPins (${pinDefs.length})`, buildPins);
    const { width, height } = viewer.state.size;
    for (const pin of pins) {
      // En el suelo con la nivelación actual; lo que cae sobre el horizonte
      // (POIs lejanos) se deja en el borde del cielo, en la misma dirección.
      if (!groundPoint(pin.dir, level, pinWorld)) {
        pinWorld.copy(pin.dir).applyMatrix3(level).multiplyScalar(GROUND_RADIUS).add(DRONE);
      }
      pinNdc.copy(pinWorld).project(camera);
      const inView = pinNdc.z < 1 && Math.abs(pinNdc.x) < 1.3 && Math.abs(pinNdc.y) < 1.3;
      let opacity = inView ? pin.def.opacity : 0;
      if (inView && pin.def.badgeOf) {
        // Números de lotes lejanos se amontonan cerca del horizonte: se apagan
        // con la distancia, y con un lote elegido los demás quedan atrás.
        const far = pinWorld.distanceTo(camera.position) / Math.max(1, orbit.dist);
        opacity *= 1 - THREE.MathUtils.smoothstep(far, 2.5, 5);
        if (selected && pin.def.badgeOf !== selected.id) opacity *= 0.55;
      }
      const shown = opacity > 0.01;
      if (shown !== pin.shown) {
        pin.el.style.display = shown ? '' : 'none';
        pin.shown = shown;
      }
      if (!shown) continue;
      const x = ((pinNdc.x + 1) / 2) * width;
      const y = ((1 - pinNdc.y) / 2) * height;
      pin.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, ${pin.shift})`;
      pin.el.style.opacity = opacity.toFixed(2);
    }
  }

  // ------------------------------------------------------------ cámara

  function readDronePose() {
    const position = viewer.getPosition();
    drone.yaw = position.yaw;
    drone.pitch = position.pitch;
    drone.fov = viewer.state.vFov;
  }

  function dronePose(reach = DRONE_HEIGHT * 2) {
    return {
      pos: DRONE.clone(),
      target: DRONE.clone().addScaledVector(dirFromAngles(drone.yaw, drone.pitch), reach),
      fov: drone.fov,
      off: new THREE.Vector2(),
    };
  }

  function orbitPosition(center, az, el, dist) {
    return center.clone().add(
      new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(dist),
    );
  }

  // Dónde va el lote en pantalla y cuánto ocupa: en el centro real si la ficha
  // no lo tapa; si no, en el centro de la zona libre (y más chico si es angosta).
  function framing() {
    const { width, height } = viewer.state.size;
    const { left = 0, right = 0, top = 0, bottom = 0 } = getInsets?.() ?? {};
    const freeWidth = Math.max(1, width - left - right);
    const freeHeight = Math.max(1, height - top - bottom);
    const fill = LOT_FILL * Math.min(1, (1.5 * freeWidth) / height, (1.5 * freeHeight) / height);
    const reach = (fill * height * 1.4) / 2;
    const fits = (size, start, end) => size / 2 - reach >= start && size / 2 + reach <= size - end;
    return {
      fill,
      off: new THREE.Vector2(
        // Con panel a la izquierda (lista + ficha) se centra siempre en lo libre.
        left === 0 && fits(width, left, right) ? 0 : (left - right) / 2,
        fits(height, top, bottom) ? 0 : (top - bottom) / 2,
      ),
    };
  }

  function orbitPose() {
    const { fill, off } = framing();
    orbit.dist = selected.radius / (fill * Math.tan(THREE.MathUtils.degToRad(ORBIT_FOV / 2)));
    return {
      pos: orbitPosition(selected.center, orbit.az, orbit.el, orbit.dist),
      target: selected.center.clone(),
      fov: ORBIT_FOV,
      off,
    };
  }

  function flyTo(pose, duration, onDone, nextMode = 'fly', approach = null) {
    tween = {
      from: { pos: cam.pos.clone(), target: cam.target.clone(), fov: cam.fov, off: cam.off.clone() },
      to: pose, start: null, duration, onDone, approach,
    };
    mode = nextMode;
  }

  // Vuelo de entrada. Interpolar posición, mirada y fov en línea recta se lee
  // como dos movimientos (primero el giro, al final el zoom): el tamaño
  // aparente crece con 1/distancia, casi todo sobre el final. Acá las tres
  // cosas avanzan con el mismo ritmo: la distancia al lote y el fov cambian en
  // proporción constante (zoom parejo) y el lote viaja al centro de la
  // pantalla a la par.
  const approachDir = new THREE.Vector3();
  const approachEnd = new THREE.Vector3();
  const approachSpin = new THREE.Quaternion();
  const noSpin = new THREE.Quaternion();
  const halfTan = (fov) => Math.tan(THREE.MathUtils.degToRad(fov / 2));

  function approachLot(tw, to, k) {
    const center = to.target;
    approachDir.copy(tw.from.pos).sub(center);
    approachEnd.copy(to.pos).sub(center);
    const fromDist = approachDir.length();
    const toDist = approachEnd.length();
    approachDir.normalize();
    approachEnd.normalize();
    const angle = approachDir.angleTo(approachEnd);
    if (angle > 1e-4) {
      approachDir.multiplyScalar(Math.sin((1 - k) * angle))
        .addScaledVector(approachEnd, Math.sin(k * angle))
        .normalize();
    }
    const dist = fromDist * (toDist / fromDist) ** k;
    cam.pos.copy(center).addScaledVector(approachDir, dist);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfTan(tw.from.fov) * (halfTan(to.fov) / halfTan(tw.from.fov)) ** k));
    // Mirada: hacia el lote, más lo que quedaba de desvío al arrancar.
    approachSpin.copy(tw.approach.spin).slerp(noSpin, k);
    approachDir.negate().applyQuaternion(approachSpin);
    cam.target.copy(cam.pos).addScaledVector(approachDir, dist);
  }

  function enterOrbit() {
    mode = 'orbit';
    orbit.startedAt = performance.now();
    orbit.pausedUntil = 0;
  }

  function update(now, dt) {
    if (levelMix !== levelGoal) {
      const step = dt / levelSeconds;
      levelMix = levelGoal > levelMix ? Math.min(levelGoal, levelMix + step) : Math.max(levelGoal, levelMix - step);
      level = levelMatrix(levelMix, tilt);
      panoMaterial.uniforms.uLevelInv.value.copy(level).transpose();
      panoMaterial.uniforms.uLod.value = mipmaps ? levelMix * levelMix * (3 - 2 * levelMix) : 0;
      placeLots();
    }

    if (tween) {
      tween.start ??= now;
      const t = Math.min(1, (now - tween.start) / tween.duration);
      const k = ease(t);
      // El destino puede ser una función: mientras cambia la nivelación los
      // lotes se desplazan y hay que seguirlos.
      const to = typeof tween.to === 'function' ? tween.to() : tween.to;
      // La vuelta recorre el mismo camino que la entrada, al revés.
      if (tween.approach?.back) approachLot({ from: to, approach: tween.approach }, tween.approach.back, 1 - k);
      else if (tween.approach) approachLot(tween, to, k);
      else {
        cam.pos.lerpVectors(tween.from.pos, to.pos, k);
        cam.target.lerpVectors(tween.from.target, to.target, k);
        cam.fov = THREE.MathUtils.lerp(tween.from.fov, to.fov, k);
      }
      cam.off.lerpVectors(tween.from.off, to.off, k);
      if (t >= 1) {
        const done = tween.onDone;
        tween = null;
        done?.();
      }
    } else if (mode === 'orbit' && selected) {
      if (now > orbit.pausedUntil) {
        const ramp = Math.min(1, (now - Math.max(orbit.startedAt, orbit.pausedUntil)) / 1500);
        orbit.az += ORBIT_SPEED * ramp * dt;
      }
      cam.pos.copy(orbitPosition(selected.center, orbit.az, orbit.el, orbit.dist));
      cam.target.copy(selected.center);
      cam.fov = ORBIT_FOV;
      // La ficha puede cambiar de tamaño (o la ventana): se sigue de a poco.
      cam.off.lerp(framing().off, Math.min(1, dt * 6));
    }
    if (mode === 'idle') return;

    if (selected) {
      if (selected.wallT < 1) selected.wallT = Math.min(1, selected.wallT + dt / 0.9);
      selected.wall.scale.y = Math.max(0.001, ease(selected.wallT));
      panoMaterial.uniforms.uFocus.value.copy(selected.center);
      panoMaterial.uniforms.uFocusRadius.value = selected.radius;
    }
    const dim = panoMaterial.uniforms.uDim;
    dim.value = THREE.MathUtils.clamp(dim.value + (selected ? dt : -dt) / 1.2, 0, 1);

    const { width, height } = viewer.state.size;
    camera.aspect = width / height;
    camera.fov = cam.fov;
    if (cam.off.lengthSq() > 0.01) camera.setViewOffset(width, height, -cam.off.x, -cam.off.y, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.position.copy(cam.pos);
    camera.lookAt(cam.target);
    camera.updateMatrixWorld();
    placePins();
    emitHeading();
  }

  // PSV no emite position-updated mientras manda la órbita (su cámara queda
  // congelada), así que el rumbo sale de la cámara propia: inversa de
  // dirFromAngles. Mirando casi a plomo el rumbo no está definido y se deja.
  const headingDir = new THREE.Vector3();
  let lastHeading = null;
  function emitHeading() {
    if (!onHeading) return;
    headingDir.subVectors(cam.target, cam.pos);
    if (Math.hypot(headingDir.x, headingDir.z) < 1e-3 * headingDir.length()) return;
    const yaw = Math.atan2(headingDir.x, -headingDir.z);
    if (lastHeading !== null && Math.abs(yaw - lastHeading) < 1e-3) return;
    lastHeading = yaw;
    onHeading(yaw);
  }

  let traceFrames = 0;
  function onBeforeRender(event) {
    if (mode === 'idle') return;
    if (traceFrames > 0) {
      traceFrames -= 1;
      const start = performance.now();
      onBeforeRenderInner(event);
      perfMark(`órbita: cuadro (update+render CPU)`, performance.now() - start);
      return;
    }
    onBeforeRenderInner(event);
  }

  function onBeforeRenderInner(event) {
    // Tras recrear la textura el primer frame tarda: se deja pasar antes de
    // arrancar la animación para que no pegue un salto.
    if (holdFrames > 0) {
      holdFrames -= 1;
      update(performance.now(), 0);
      if (tween) tween.start = null;
    } else {
      update(performance.now(), Math.min(0.1, (event.elapsed ?? 16) / 1000));
    }
    if (mode !== 'idle') gl.render(scene, camera);
  }

  // ------------------------------------------------------------ entrar / salir

  function begin() {
    ensureScene();
    perfTime('órbita: setCustomRenderer', () => viewer.renderer.setCustomRenderer((renderer) => {
      gl = renderer;
      return { render: () => renderer.render(scene, camera) };
    }));
    const { texture } = viewer.state.textureData;
    panoMaterial.uniforms.uMap.value = texture;
    if (perfTime('órbita: prepareTexture', () => prepareTexture(texture))) {
      holdFrames = 2;
      perfMark('órbita: ¡TEXTURA RESUBIDA!');
    } else perfTime('órbita: filtrado mipmaps', () => setSharedFiltering(true));
    traceFrames = 4;

    readDronePose();
    Object.assign(cam, dronePose());
    levelMix = 0;
    levelGoal = 0;
    level = levelMatrix(0, tilt);
    panoMaterial.uniforms.uLevelInv.value.identity();
    panoMaterial.uniforms.uLod.value = 0;
    panoMaterial.uniforms.uDim.value = 0;

    overlay.hidden = false;
    perfTime('órbita: ocultar markers PSV (clase + reflow)', () => {
      viewer.container.classList.add('psv--lot-orbit');
      void viewer.container.offsetHeight;
    });
    viewer.addEventListener('before-render', onBeforeRender);
  }

  function finish() {
    perfMark('órbita: finish');
    viewer.removeEventListener('before-render', onBeforeRender);
    perfTime('órbita: filtrado sin mipmaps', () => setSharedFiltering(false));
    perfTime('órbita: setCustomRenderer(null)', () => viewer.renderer.setCustomRenderer(null));
    perfTime('órbita: mostrar markers PSV (clase + reflow)', () => {
      viewer.container.classList.remove('psv--lot-orbit');
      void viewer.container.offsetHeight;
    });
    overlay.hidden = true;
    overlay.classList.remove('dragging', 'over-lot');
    hoverLabel.classList.remove('on');
    tween = null;
    drag = null;
    touches.clear();
    hovered = null;
    selected = null;
    mode = 'idle';
    lastHeading = null;
    onHeading?.(viewer.getPosition().yaw);
  }

  /**
   * Vuela hasta el lote y lo orbita. Devuelve false si no se puede (panorama
   * parcial, lote sobre el horizonte, movimiento reducido): el caller decide
   * qué hacer en su lugar.
   */
  function select(id) {
    perfMark(`órbita: select (mode ${mode}, lotsDirty ${lotsDirty})`);
    if (mode === 'idle' && !isSupported()) return false;
    if (lotsDirty) perfTime('órbita: buildLots', buildLots);
    const lot = lots.find((item) => item.id === id);
    if (!lot) return false;
    if (lot === selected && mode !== 'return') return true;

    const cameFromDrone = mode === 'idle';
    if (cameFromDrone) begin();
    accent = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c5a059');
    selected = lot;
    hovered = null;
    hoverLabel.classList.remove('on');
    overlay.classList.remove('over-lot');
    styleLots();
    orbit.el = ORBIT_ELEVATION;

    if (cameFromDrone) {
      // Un solo movimiento: la cámara se despega del dron y baja hasta la
      // órbita mientras gira hacia el lote y cierra el zoom.
      const toLot = lot.center.clone().sub(DRONE).normalize();
      const spin = new THREE.Quaternion().setFromUnitVectors(toLot, dirFromAngles(drone.yaw, drone.pitch));
      // Se baja por el mismo lado desde el que mira el dron: es el recorrido
      // con menos movimiento lateral.
      orbit.az = Math.atan2(DRONE.x - lot.center.x, DRONE.z - lot.center.z);
      levelGoal = 1;
      levelSeconds = FLY_IN_MS / 1000;
      flyTo(orbitPose, FLY_IN_MS, enterOrbit, 'fly', { spin });
    } else {
      // Ya despegados: ir directo, conservando el rumbo.
      const offset = cam.pos.clone().sub(lot.center);
      orbit.az = Math.atan2(offset.x, offset.z);
      levelGoal = 1;
      levelSeconds = LEVEL_BLEND_SECONDS;
      flyTo(orbitPose, 1500, enterOrbit);
    }
    return true;
  }

  /** Vuelve a la pose del dron y le devuelve el control a PSV. */
  function exit({ immediate = false } = {}) {
    if (mode === 'idle') return;
    perfMark(`órbita: exit (mode ${mode})`);
    if (immediate) { finish(); return; }
    if (mode === 'return') return;
    // Desde la órbita se vuelve por el mismo camino de la entrada; a mitad de
    // un vuelo la cámara no mira al lote, así que ahí se va en línea recta.
    const back = mode === 'orbit' && selected
      ? { pos: cam.pos.clone(), target: selected.center.clone(), fov: cam.fov }
      : null;
    selected = null;
    hovered = null;
    styleLots();
    levelGoal = 0;
    levelSeconds = FLY_OUT_MS / 1000;
    // Si se entró con el panorama todavía en inercia, PSV siguió girando un
    // poco: se vuelve a donde quedó, no a donde estaba al salir.
    readDronePose();
    const spin = back && new THREE.Quaternion().setFromUnitVectors(
      back.target.clone().sub(DRONE).normalize(),
      dirFromAngles(drone.yaw, drone.pitch),
    );
    flyTo(dronePose(), FLY_OUT_MS, finish, 'return', back && { spin, back });
  }

  function setLots(defs, surfaceList) {
    lotDefs = defs ?? [];
    surfaceDefs = surfaceList ?? [];
    lotsDirty = true;
    if (mode !== 'idle') buildLots();
    else prewarmTimer ??= setTimeout(prewarm, 0);
  }

  // Aparte de setLots: cambian con los recomendados y no hace falta rehacer
  // lotes (ni recalcular la nivelación), solo volver a pintarlos.
  function setFocus(next) {
    focus = next ?? {};
    if (lots.length) styleLots();
  }

  // Aparte de setLots: cambian con los filtros y no hace falta rehacer lotes.
  function setPins(defs) {
    pinDefs = defs ?? [];
    pinsDirty = true;
  }

  function destroy() {
    clearTimeout(prewarmTimer);
    viewer.removeEventListener('panorama-loaded', onPanoramaLoaded);
    if (mode !== 'idle') finish();
    disposeLots();
    if (scene) {
      for (const object of scene.children) object.geometry?.dispose();
      panoMaterial.dispose();
    }
    overlay.remove();
  }

  // ------------------------------------------------------------ gestos

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag = null;

  function lotAt(event) {
    const rect = overlay.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(lots.map((lot) => lot.fill), false)[0]?.object.userData.lot ?? null;
  }

  const clampDist = (dist) => THREE.MathUtils.clamp(dist, selected.radius * 1.5, selected.radius * 40);

  // Pellizco: con dos dedos se acerca/aleja igual que la rueda y no se gira.
  const touches = new Map();
  let pinchDist = 0;
  const touchSpread = () => {
    const [a, b] = touches.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  overlay.addEventListener('pointerdown', (event) => {
    overlay.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 2) {
        pinchDist = touchSpread();
        // Al soltar un dedo no tiene que leerse como toque sobre otro lote.
        if (drag) drag.moved = Infinity;
        return;
      }
      if (touches.size > 2) return;
    }
    drag = { x: event.clientX, y: event.clientY, moved: 0 };
  });

  overlay.addEventListener('pointermove', (event) => {
    if (touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2) {
        const spread = touchSpread();
        if (mode === 'orbit' && selected && pinchDist > 0 && spread > 0) {
          orbit.dist = clampDist(orbit.dist * (pinchDist / spread));
          orbit.pausedUntil = performance.now() + DRAG_RESUME_MS;
        }
        pinchDist = spread;
        return;
      }
    }
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX; drag.y = event.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 5) overlay.classList.add('dragging');
      if (mode === 'orbit') {
        orbit.az -= dx * 0.006;
        orbit.el = THREE.MathUtils.clamp(orbit.el + dy * 0.005, 0.14, 1.5);
        orbit.pausedUntil = performance.now() + DRAG_RESUME_MS;
      }
      return;
    }
    const lot = mode === 'orbit' ? lotAt(event) : null;
    if (lot !== hovered) {
      hovered = lot;
      styleLots();
      overlay.classList.toggle('over-lot', Boolean(lot) && lot !== selected);
    }
    const showLabel = Boolean(lot?.def.label) && lot !== selected;
    hoverLabel.classList.toggle('on', showLabel);
    if (showLabel) {
      hoverLabel.textContent = lot.def.label;
      hoverLabel.style.left = `${event.clientX}px`;
      hoverLabel.style.top = `${event.clientY}px`;
    }
  });

  const endDrag = (event) => {
    if (touches.delete(event.pointerId) && touches.size > 0) {
      // Queda un dedo: sigue girando desde donde está, sin saltar.
      const [rest] = touches.values();
      drag = { x: rest.x, y: rest.y, moved: Infinity };
      return;
    }
    const wasClick = drag && drag.moved <= 5 && event.type === 'pointerup';
    drag = null;
    overlay.classList.remove('dragging');
    if (!wasClick || mode !== 'orbit') return;
    const lot = lotAt(event);
    if (lot && lot !== selected) onPick?.(lot.id);
  };
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);

  // La capa vive dentro del contenedor de PSV: sin esto los gestos burbujean
  // y PSV también mueve su cámara.
  for (const type of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick']) {
    overlay.addEventListener(type, (event) => event.stopPropagation());
  }

  overlay.addEventListener('wheel', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (mode !== 'orbit' || !selected) return;
    const factor = Math.exp(event.deltaY * 0.0012);
    orbit.dist = clampDist(orbit.dist * factor);
  }, { passive: false });

  /** Resalta un lote como si tuviera el mouse encima (hover en la lista). */
  function highlight(id) {
    if (mode === 'idle') return;
    const lot = (id && lots.find((item) => item.id === id)) || null;
    if (lot === hovered) return;
    hovered = lot;
    styleLots();
  }

  return {
    select,
    exit,
    highlight,
    setLots,
    setFocus,
    setPins,
    destroy,
    get active() { return mode !== 'idle'; },
  };
}
