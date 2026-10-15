// Prototipo aislado: el panorama del dron proyectado sobre un plano de suelo,
// para poder despegar la cámara de la posición del dron y orbitar un lote.
//
// Idea: si el terreno es plano, cada punto del suelo se ve desde el dron en una
// dirección conocida, así que el color de ese punto sale directo de la foto
// equirrectangular. Visto desde la posición del dron el resultado es idéntico
// al panorama; desde cualquier otro lado es una reconstrucción "aplastada".
//
// Uso: /design-lab/orbita-lote.html?p=<proyecto>&l=<loteo>

import * as THREE from 'three';
import { API_BASE } from '../src/api/config.js';

const params = new URLSearchParams(location.search);
const PROJECT = params.get('p') ?? 'paseo-frankfurt';
const LOTEO = params.get('l') ?? 'demoloteo';

// La altura del dron solo fija la unidad de la escena: con suelo plano todo
// escala junto, así que no cambia lo que se ve.
const DRONE_HEIGHT = 100;
const DRONE = new THREE.Vector3(0, DRONE_HEIGHT, 0);
const GROUND_RADIUS = DRONE_HEIGHT * 25;
const ORBIT_FOV = 38;
const STATUS_COLORS = { available: 0x22c55e, sold: 0xef4444, reserved: 0x3b82f6, unavailable: 0x6b7280 };
const STATUS_LABELS = { available: 'Disponible', sold: 'Vendido', reserved: 'Reservado', unavailable: 'No disponible' };
const ACCENT = 0xc8a04f;

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, GROUND_RADIUS * 4);

// ---------------------------------------------------------------- panorama

const panoMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: null },
    uDrone: { value: DRONE },
    uLevelInv: { value: new THREE.Matrix3() },
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
      vec4 color = textureGrad(uMap, vec2(u, v), vec2(dudx, dFdx(v)), vec2(dudy, dFdy(v)));
      // Con un lote elegido, el entorno se oscurece de a poco hacia afuera
      // para que el lote quede como foco.
      float away = smoothstep(uFocusRadius * 1.3, uFocusRadius * 7.0, distance(vWorld, uFocus));
      color.rgb *= 1.0 - 0.5 * uDim * away;
      gl_FragColor = color;
    }
  `,
  side: THREE.DoubleSide,
});

// Suelo hasta ~87° desde la vertical; de ahí en más (y el cielo) lo cubre una
// esfera centrada en el dron que toca el suelo justo en el borde del disco.
const ground = new THREE.Mesh(new THREE.CircleGeometry(GROUND_RADIUS, 128).rotateX(-Math.PI / 2), panoMaterial);
const sky = new THREE.Mesh(new THREE.SphereGeometry(Math.hypot(GROUND_RADIUS, DRONE_HEIGHT), 96, 48), panoMaterial);
sky.position.copy(DRONE);
scene.add(sky, ground);

// ---------------------------------------------------------------- nivelación

// La nivelación de los sliders vale solo con la cámara despegada del dron.
// Desde el dron se usa 0 (el panorama tal cual, horizonte derecho) y se va
// mezclando durante el vuelo: levelMix 0 = dron, 1 = órbita/cenital.
const level = new THREE.Matrix3();
let levelMix = 0;
let levelGoal = 0;
const LEVEL_BLEND_SECONDS = 2.2;
const storageKey = `orbita-lote:nivel:${PROJECT}/${LOTEO}`;
function readStoredLevel() {
  try { return JSON.parse(localStorage.getItem(storageKey)) ?? {}; } catch { return {}; }
}
function applyLevel() {
  const k = levelMix * levelMix * (3 - 2 * levelMix);
  const tiltX = THREE.MathUtils.degToRad(Number($('tiltx').value)) * k;
  const tiltZ = THREE.MathUtils.degToRad(Number($('tiltz').value)) * k;
  const m4 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tiltX, 0, tiltZ, 'XYZ'));
  level.setFromMatrix4(m4);
  panoMaterial.uniforms.uLevelInv.value.copy(level).transpose();
}

// ---------------------------------------------------------------- lotes

let pano = { width: 1, height: 1 };
let annotations = [];
let lots = [];
const lotGroup = new THREE.Group();
scene.add(lotGroup);

function pixelToGround([x, y]) {
  const lon = (x / pano.width - 0.5) * Math.PI * 2;
  const lat = (0.5 - y / pano.height) * Math.PI;
  const d = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), -Math.cos(lat) * Math.cos(lon)).applyMatrix3(level);
  if (d.y > -0.03) return null; // sobre el horizonte: no cae en el suelo
  const t = DRONE_HEIGHT / -d.y;
  return new THREE.Vector3(d.x * t, 0, d.z * t);
}

function buildLots() {
  const selectedId = selected?.id ?? null;
  const hoveredId = hovered?.id ?? null;
  const wallT = selected?.wallT ?? 0;
  for (const lot of lots) {
    lot.fill.geometry.dispose(); lot.fill.material.dispose();
    lot.outline.geometry.dispose(); lot.outline.material.dispose();
    lot.wall.geometry.dispose(); lot.wall.material.dispose();
  }
  lotGroup.clear();
  lots = [];

  for (const ann of annotations) {
    const pts = (ann.panorama_coordinates ?? []).map(pixelToGround);
    if (pts.length < 3 || pts.some((p) => !p)) continue;

    const center = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(pts.length);
    const radius = Math.max(...pts.map((p) => p.distanceTo(center)));
    const color = STATUS_COLORS[ann.status] ?? 0xffffff;

    const flat = pts.map((p) => new THREE.Vector2(p.x, p.z));
    const fillGeometry = new THREE.BufferGeometry().setFromPoints(pts);
    fillGeometry.setIndex(THREE.ShapeUtils.triangulateShape(flat, []).flat());
    const fill = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.16, depthTest: false, side: THREE.DoubleSide,
    }));
    fill.renderOrder = 1;

    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }),
    );
    outline.renderOrder = 2;

    // "Cerco" de luz que se levanta desde el borde del lote elegido.
    const wallHeight = radius * 0.4;
    const positions = [];
    const colors = [];
    const c = new THREE.Color(ACCENT);
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const quad = [[a, 0], [b, 0], [b, 1], [a, 0], [b, 1], [a, 1]];
      for (const [p, top] of quad) {
        positions.push(p.x, top * wallHeight, p.z);
        colors.push(c.r, c.g, c.b, top ? 0 : 0.95);
      }
    }
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    wallGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    const wall = new THREE.Mesh(wallGeometry, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthTest: false, side: THREE.DoubleSide,
    }));
    wall.renderOrder = 3;
    wall.visible = false;

    const lot = { id: ann.uuid, ann, center, radius, color, fill, outline, wall, wallT: 0 };
    fill.userData.lot = lot;
    lots.push(lot);
    lotGroup.add(fill, outline, wall);
  }

  selected = lots.find((l) => l.id === selectedId) ?? null;
  hovered = lots.find((l) => l.id === hoveredId) ?? null;
  if (selected) selected.wallT = wallT;
  styleLots();
}

function styleLots() {
  for (const lot of lots) {
    const isSelected = lot === selected;
    const isHovered = lot === hovered;
    lot.fill.material.color.set(isSelected ? ACCENT : lot.color);
    lot.fill.material.opacity = isSelected ? 0.3 : isHovered ? 0.36 : selected ? 0.07 : 0.16;
    lot.outline.material.color.set(isSelected ? ACCENT : 0xffffff);
    lot.outline.material.opacity = isSelected ? 1 : selected ? 0.4 : 0.85;
    lot.wall.visible = isSelected;
    if (!isSelected) lot.wallT = 0;
  }
}

// ---------------------------------------------------------------- cámara

// mode: 'drone' (mirar desde el dron) | 'orbit' | 'top' | 'fly' (transición)
let mode = 'drone';
let selected = null;
let hovered = null;
const cam = { pos: DRONE.clone(), target: new THREE.Vector3(), fov: 60 };
const drone = { yaw: 0, pitch: -0.6, fov: 60 };
const orbit = { az: 0, el: 0.56, dist: 100, pausedUntil: 0, startedAt: 0 };
let tween = null;

const dirFromAngles = (yaw, pitch) => new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

function dronePose(reach = DRONE_HEIGHT * 2) {
  return { pos: DRONE.clone(), target: DRONE.clone().addScaledVector(dirFromAngles(drone.yaw, drone.pitch), reach), fov: drone.fov };
}

function orbitPosition(center, az, el, dist) {
  return center.clone().add(new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(dist));
}

function orbitDistance(lot) {
  const fill = Number($('fill').value) / 100;
  return lot.radius / (fill * Math.tan(THREE.MathUtils.degToRad(ORBIT_FOV / 2)));
}

function flyTo(pose, duration, onDone) {
  tween = { from: { pos: cam.pos.clone(), target: cam.target.clone(), fov: cam.fov }, to: pose, start: performance.now(), duration, onDone };
  mode = 'fly';
}

function selectLot(lot) {
  const cameFromDrone = mode === 'drone';
  selected = lot;
  styleLots();
  openFicha(lot);

  orbit.el = THREE.MathUtils.degToRad(Number($('elev').value));
  const orbitPose = () => {
    orbit.dist = orbitDistance(selected);
    return { pos: orbitPosition(selected.center, orbit.az, orbit.el, orbit.dist), target: selected.center.clone(), fov: ORBIT_FOV };
  };
  const enterOrbit = () => { mode = 'orbit'; orbit.startedAt = performance.now(); orbit.pausedUntil = 0; };

  if (cameFromDrone) {
    // 1) Girar y hacer zoom sin moverse del dron (acá todavía es el panorama
    //    tal cual). 2) Despegarse y bajar hasta la órbita.
    const reach = lot.center.distanceTo(DRONE);
    cam.target.copy(dronePose(reach).target);
    const fitFov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(lot.radius / reach)) / 0.3, 12, drone.fov);
    // Se baja por el mismo lado desde el que mira el dron: es el recorrido
    // con menos movimiento lateral.
    orbit.az = Math.atan2(DRONE.x - lot.center.x, DRONE.z - lot.center.z);
    flyTo({ pos: DRONE.clone(), target: lot.center.clone(), fov: fitFov }, 900, () => {
      levelGoal = 1;
      flyTo(orbitPose, 2200, enterOrbit);
    });
  } else {
    // Ya despegados (órbita o cenital): ir directo, conservando el rumbo.
    const offset = cam.pos.clone().sub(lot.center);
    orbit.az = Math.atan2(offset.x, offset.z);
    levelGoal = 1;
    flyTo(orbitPose, 1500, enterOrbit);
  }
}

function backToDrone() {
  selected = null;
  styleLots();
  closeFicha();
  if (mode === 'drone') return;
  levelGoal = 0;
  flyTo(dronePose(), LEVEL_BLEND_SECONDS * 1000, () => { mode = 'drone'; });
}

function topView() {
  if (!lots.length) return;
  selected = null;
  styleLots();
  closeFicha();
  levelGoal = 1;
  flyTo(() => {
    const box = new THREE.Box3().setFromPoints(lots.map((l) => l.center));
    const center = box.getCenter(new THREE.Vector3());
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + lots[0].radius * 4;
    const height = span / (2 * Math.tan(THREE.MathUtils.degToRad(40 / 2)) * Math.min(1, camera.aspect));
    // Leve corrimiento en Z para que lookAt no quede degenerado mirando recto abajo.
    return { pos: new THREE.Vector3(center.x, height, center.z + height * 0.002), target: center, fov: 40 };
  }, LEVEL_BLEND_SECONDS * 1000, () => { mode = 'top'; });
}

function updateCamera(now, dt) {
  if (levelMix !== levelGoal) {
    const step = dt / LEVEL_BLEND_SECONDS;
    levelMix = levelGoal > levelMix ? Math.min(levelGoal, levelMix + step) : Math.max(levelGoal, levelMix - step);
    applyLevel();
    buildLots();
  }
  if (tween) {
    const t = Math.min(1, (now - tween.start) / tween.duration);
    const k = ease(t);
    // El destino puede ser una función: mientras cambia la nivelación los
    // lotes se desplazan y hay que seguirlos.
    const to = typeof tween.to === 'function' ? tween.to() : tween.to;
    cam.pos.lerpVectors(tween.from.pos, to.pos, k);
    cam.target.lerpVectors(tween.from.target, to.target, k);
    cam.fov = THREE.MathUtils.lerp(tween.from.fov, to.fov, k);
    if (t >= 1) {
      const done = tween.onDone;
      tween = null;
      done?.();
    }
  } else if (mode === 'drone') {
    Object.assign(cam, dronePose());
  } else if (mode === 'orbit' && selected) {
    if (now > orbit.pausedUntil) {
      const ramp = Math.min(1, (now - Math.max(orbit.startedAt, orbit.pausedUntil)) / 1500);
      orbit.az += THREE.MathUtils.degToRad(Number($('speed').value)) * ramp * dt;
    }
    cam.pos.copy(orbitPosition(selected.center, orbit.az, orbit.el, orbit.dist));
    cam.target.copy(selected.center);
    cam.fov = ORBIT_FOV;
  }

  camera.position.copy(cam.pos);
  camera.fov = cam.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(cam.target);
}

// ---------------------------------------------------------------- ficha

function openFicha(lot) {
  $('ficha-nombre').textContent = lot.ann.tooltip ?? 'Lote';
  const estado = $('ficha-estado');
  estado.style.color = `#${new THREE.Color(STATUS_COLORS[lot.ann.status] ?? 0x6b7280).getHexString()}`;
  estado.lastElementChild.textContent = STATUS_LABELS[lot.ann.status] ?? '—';
  $('ficha-sup').textContent = lot.ann.area_m2 ? `${Number(lot.ann.area_m2).toLocaleString('es-AR')} m²` : '—';
  $('ficha').classList.add('open');
  $('ficha').setAttribute('aria-hidden', 'false');
}
function closeFicha() {
  $('ficha').classList.remove('open');
  $('ficha').setAttribute('aria-hidden', 'true');
}

// ---------------------------------------------------------------- interacción

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let drag = null;

function lotAt(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(lots.map((l) => l.fill), false)[0]?.object.userData.lot ?? null;
}

canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY, moved: 0 };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (drag) {
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 5) canvas.classList.add('dragging');
    if (mode === 'drone') {
      const perPixel = THREE.MathUtils.degToRad(drone.fov) / window.innerHeight;
      drone.yaw -= dx * perPixel;
      drone.pitch = THREE.MathUtils.clamp(drone.pitch + dy * perPixel, -1.55, 1.2);
    } else if (mode === 'orbit') {
      orbit.az -= dx * 0.006;
      orbit.el = THREE.MathUtils.clamp(orbit.el + dy * 0.005, 0.14, 1.5);
      orbit.pausedUntil = performance.now() + 2500;
    }
    return;
  }
  const lot = mode === 'fly' ? null : lotAt(event);
  if (lot !== hovered) {
    hovered = lot;
    styleLots();
    canvas.classList.toggle('over-lot', Boolean(lot));
  }
  const label = $('hover-label');
  label.classList.toggle('on', Boolean(lot) && lot !== selected);
  if (lot) {
    label.textContent = lot.ann.tooltip ?? 'Lote';
    label.style.left = `${event.clientX}px`;
    label.style.top = `${event.clientY}px`;
  }
});

canvas.addEventListener('pointerup', (event) => {
  const wasClick = drag && drag.moved <= 5;
  drag = null;
  canvas.classList.remove('dragging');
  if (!wasClick || mode === 'fly') return;
  const lot = lotAt(event);
  if (lot && lot !== selected) selectLot(lot);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = Math.exp(event.deltaY * 0.0012);
  if (mode === 'drone') drone.fov = THREE.MathUtils.clamp(drone.fov * factor, 10, 95);
  else if (mode === 'orbit' && selected) orbit.dist = THREE.MathUtils.clamp(orbit.dist * factor, selected.radius * 1.5, selected.radius * 40);
}, { passive: false });

window.addEventListener('keydown', (event) => { if (event.key === 'Escape') backToDrone(); });
$('ficha-cerrar').addEventListener('click', backToDrone);
$('btn-dron').addEventListener('click', backToDrone);
$('btn-top').addEventListener('click', topView);

function syncLabels() {
  $('v-tiltx').textContent = `${Number($('tiltx').value).toFixed(2)}°`;
  $('v-tiltz').textContent = `${Number($('tiltz').value).toFixed(2)}°`;
  $('v-speed').textContent = `${$('speed').value}°/s`;
  $('v-elev').textContent = `${$('elev').value}°`;
  $('v-fill').textContent = `${$('fill').value}%`;
}
for (const id of ['tiltx', 'tiltz']) {
  $(id).addEventListener('input', () => {
    applyLevel(); buildLots(); syncLabels();
    try { localStorage.setItem(storageKey, JSON.stringify({ x: $('tiltx').value, z: $('tiltz').value })); } catch { /* sin storage */ }
  });
}
$('speed').addEventListener('input', syncLabels);
$('elev').addEventListener('input', () => { orbit.el = THREE.MathUtils.degToRad(Number($('elev').value)); syncLabels(); });
$('fill').addEventListener('input', () => { if (selected) orbit.dist = orbitDistance(selected); syncLabels(); });

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- arranque

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar el panorama'));
    img.src = url;
  });
}

async function start() {
  const stored = readStoredLevel();
  $('tiltx').value = stored.x ?? -8;
  $('tiltz').value = stored.z ?? -8;
  syncLabels();
  resize();

  const res = await fetch(`${API_BASE}/public/projects/by-slug/${PROJECT}/loteos/by-slug/${LOTEO}/group_visor_data`);
  if (!res.ok) throw new Error(`La API respondió ${res.status}`);
  const data = await res.json();
  const visor = (data.stages.find((s) => s.id === data.entry_stage_id) ?? data.stages[0]).visor;
  annotations = visor.annotations.filter((a) => a.type === 'polygon');

  const img = await loadImage(visor.panoramaUrl);
  pano = { width: visor.panoramaWidth ?? img.naturalWidth, height: visor.panoramaHeight ?? img.naturalHeight };

  // Si la GPU no admite la textura entera, se reduce (se pierde nitidez).
  const maxSize = Math.min(renderer.capabilities.maxTextureSize, Number(params.get('max')) || Infinity);
  let source = img;
  if (img.naturalWidth > maxSize) {
    source = document.createElement('canvas');
    source.width = maxSize;
    source.height = Math.round(maxSize * img.naturalHeight / img.naturalWidth);
    source.getContext('2d').drawImage(img, 0, 0, source.width, source.height);
    console.warn(`Panorama reducido de ${img.naturalWidth}px a ${maxSize}px de ancho`);
  }
  const texture = new THREE.Texture(source);
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
  panoMaterial.uniforms.uMap.value = texture;

  applyLevel();
  buildLots();

  // Arrancar mirando hacia los lotes.
  if (lots.length) {
    const center = lots.reduce((acc, l) => acc.add(l.center), new THREE.Vector3()).divideScalar(lots.length);
    const d = center.sub(DRONE).normalize();
    drone.yaw = Math.atan2(d.x, -d.z);
    drone.pitch = Math.asin(d.y) + 0.12;
  }

  $('loading').classList.add('done');
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    updateCamera(now, dt);
    if (selected && selected.wallT < 1) selected.wallT = Math.min(1, selected.wallT + dt / 0.9);
    if (selected) selected.wall.scale.y = Math.max(0.001, ease(selected.wallT));
    const u = panoMaterial.uniforms;
    if (selected) { u.uFocus.value.copy(selected.center); u.uFocusRadius.value = selected.radius; }
    u.uDim.value = THREE.MathUtils.clamp(u.uDim.value + (selected ? dt : -dt) / 1.2, 0, 1);
    renderer.render(scene, camera);
  });
  window.__lab = { get lots() { return lots; }, selectLot, backToDrone, topView, camera, get mode() { return mode; } };
}

start().catch((error) => {
  console.error(error);
  $('loading').textContent = `Error: ${error.message}`;
});
