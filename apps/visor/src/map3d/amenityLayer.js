// The loteo's amenities (club house, guardia, canchas, estacionamiento...) on
// the 3D map, from geoAmenityItems (geoSurfaces.js). Edificios are extruded
// like buildingLayer's, pisos and canchas are flat fills over the surfaces,
// canchas get their sport's lines, and their names go either written on them
// (through the map's text layer) or as floating HTML labels, per project.
// Same look in satellite and render: they're the project, not today's photo.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { AMENITY_FLOOR_M, AMENITY_ICONS, AMENITY_ROOF_COLOR, amenityColor, amenityIconSvg } from './amenities.js';
import { WALL_FOOT_SHADE, buildRoofs, buildWalls, signedArea } from './buildingLayer.js';
import { flatFillGeometry } from './flatFill.js';
import { DEFAULT_TEXT_FONT, outlineColorFor, textBox } from './textLayer.js';

// Fills over agua (0.56) and under calles (0.6), like a plaza inside a
// manzana; court lines over them. Edificios go with the buildings (2.5, depth
// tested) so the lot fills and borders, drawn without depth test, can't paint over them.
const ORDER = { fill: 0.58, lines: 0.65, building: 2.5 };

// Satellite keeps a hint of the photo under the fills, so they sit on the
// ground instead of looking pasted on.
const FILL_OPACITY = { render: 1, satellite: 0.92 };
const WALL_COLOR = 0xf3efe7; // buildingLayer's maqueta wall; the roof is AMENITY_ROOF_COLOR
const COURT_LINE_PX = 1.5; // CSS px, like the lot borders
// Free strip between the polygon and the court lines, as a fraction of the
// short side: people draw the whole fenced area, not the playing field.
const COURT_MARGIN = 0.06;
const ARC_STEPS = 24;
// Names written on the amenities (amenityTextItems): laid along the shape
// when it's at least this much longer than wide; the text takes up to
// TEXT_FILL of the room, its letters up to TEXT_MAX_HEIGHT of the width, and
// never over TEXT_MAX_M (the lot numbers are 3.2 m).
const ALONG_RATIO = 1.4;
const TEXT_FILL = 0.8;
const TEXT_MAX_HEIGHT = 0.4;
const TEXT_MAX_M = 6;
const LABEL_GAP_PX = 3; // 'floating' labels: room around each one before another counts as overlapping

/**
 * Frame of a court drawn as `ring` ([[x, z], ...]): its long axis follows the
 * polygon's longest side. Returns { center: [x, z], u, v (unit [x, z] along
 * the length and the width), length, width } in meters, the box around the
 * ring in that frame.
 */
export function courtFrame(ring) {
  let best = 0;
  let u = [1, 0];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) { best = len; u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]; }
  });
  let v = [-u[1], u[0]];
  const along = (axis) => ring.map(([x, z]) => x * axis[0] + z * axis[1]);
  const us = along(u);
  const vs = along(v);
  let [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  // A shape whose longest side is the short one (a trapezoid, say): the court
  // still runs along the longer extent.
  if (v1 - v0 > u1 - u0) {
    [u, v] = [v, u];
    [u0, u1, v0, v1] = [v0, v1, u0, u1];
  }
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  return {
    center: [cu * u[0] + cv * v[0], cu * u[1] + cv * v[1]],
    u, v, length: u1 - u0, width: v1 - v0,
  };
}

/**
 * The four corners the court is stretched onto, in order, the first side
 * (q0 → q1) along the length. A 4-point polygon is used as is, so the lines
 * follow it even when it's drawn a bit skewed (as most hand-drawn courts are);
 * any other shape gets the box of courtFrame.
 */
export function courtQuad(ring) {
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (ring.length === 4) {
    const [a, b, c, d] = ring;
    // Opposite sides summed: the longer pair runs along the court.
    return dist(a, b) + dist(c, d) >= dist(b, c) + dist(d, a) ? ring : [b, c, d, a];
  }
  const { center, u, v, length, width } = courtFrame(ring);
  const corner = (s, t) => [center[0] + s * u[0] + t * v[0], center[1] + s * u[1] + t * v[1]];
  return [corner(-length / 2, -width / 2), corner(length / 2, -width / 2), corner(length / 2, width / 2), corner(-length / 2, width / 2)];
}

/**
 * The lines of a `sport` court laid in `ring`, as segments [[x, z], [x, z]].
 * Proportions from the real courts, drawn on a rectangle of the quad's average
 * size and then stretched onto the quad's corners (bilinear), so a court drawn
 * a bit off still reads as its sport and its lines match the fill. Unknown
 * sport = just the outline and the middle line.
 */
export function courtLines(ring, sport) {
  const [q0, q1, q2, q3] = courtQuad(ring);
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const length = (dist(q0, q1) + dist(q3, q2)) / 2;
  const width = (dist(q1, q2) + dist(q0, q3)) / 2;
  const margin = Math.min(length, width) * COURT_MARGIN;
  const hs = length / 2 - margin; // half the playing length (s axis, along u)
  const ht = width / 2 - margin; // half the playing width (t axis, along v)
  const segs = [];
  const line = (s0, t0, s1, t1) => segs.push([[s0, t0], [s1, t1]]);
  const rect = (s0, s1, t0, t1) => { line(s0, t0, s1, t0); line(s1, t0, s1, t1); line(s1, t1, s0, t1); line(s0, t1, s0, t0); };
  const arc = (cs, ct, r, a0, a1) => {
    for (let i = 0; i < ARC_STEPS; i += 1) {
      const a = a0 + ((a1 - a0) * i) / ARC_STEPS;
      const b = a0 + ((a1 - a0) * (i + 1)) / ARC_STEPS;
      line(cs + r * Math.cos(a), ct + r * Math.sin(a), cs + r * Math.cos(b), ct + r * Math.sin(b));
    }
  };
  // Both ends of the court, for the lines that repeat on each side.
  const ends = fn => [1, -1].forEach(fn);

  rect(-hs, hs, -ht, ht);
  line(0, -ht, 0, ht); // net or halfway line
  if (sport === 'tenis') {
    // Singles sidelines (8.23 of 10.97 m), service lines 6.40 m from the net (of 11.89).
    const st = ht * 0.75;
    const ss = hs * 0.54;
    line(-hs, st, hs, st);
    line(-hs, -st, hs, -st);
    line(-ss, 0, ss, 0);
    ends(k => line(k * ss, -st, k * ss, st));
  } else if (sport === 'padel') {
    // Service lines 6.95 m from the net (of 10), center line between them.
    const ss = hs * 0.695;
    line(-ss, 0, ss, 0);
    ends(k => line(k * ss, -ht, k * ss, ht));
  } else if (sport === 'futbol') {
    arc(0, 0, Math.min(ht * 0.3, hs * 0.3), 0, 2 * Math.PI);
    // Penalty areas: 14% of the length deep, 60% of the width wide.
    ends(k => rect(k * hs, k * hs * 0.72, -ht * 0.6, ht * 0.6));
  } else if (sport === 'basquet') {
    arc(0, 0, ht * 0.24, 0, 2 * Math.PI);
    ends((k) => {
      rect(k * hs, k * hs * 0.586, -ht * 0.327, ht * 0.327); // the key, 5.8 × 4.9 m on 28 × 15
      // Three-point line: arc around the hoop (1.575 m from the baseline),
      // then straight to the baseline at both ends.
      const hoop = k * hs * 0.888;
      const r = ht * 0.9;
      arc(hoop, 0, r, k > 0 ? Math.PI / 2 : -Math.PI / 2, k > 0 ? Math.PI * 1.5 : Math.PI / 2);
      line(hoop, r, k * hs, r);
      line(hoop, -r, k * hs, -r);
    });
  }
  // Court meters (s, t), centered → 0..1 on each axis → bilinear blend of the
  // corners. Lines along either axis stay straight under it; only the
  // circles bend a little, with the quad.
  const toMap = ([s, t]) => {
    const a = s / length + 0.5;
    const b = t / width + 0.5;
    return [0, 1].map(k => (1 - b) * ((1 - a) * q0[k] + a * q1[k]) + b * ((1 - a) * q3[k] + a * q2[k]));
  };
  return segs.map(([a, b]) => [toMap(a), toMap(b)]);
}

const isFlat = a => a.form === 'piso' || a.form === 'cancha';
const amenityHeight = a => (isFlat(a) ? 0 : (a.floors > 1 ? a.floors : 1) * AMENITY_FLOOR_M);

/**
 * Each amenity's name written on it, as createTextLayer items (mapScene adds
 * them to the editor's texts): sized in meters to fit the shape, so they
 * shrink with the zoom like the lot numbers and two never overlap. No name =
 * its icon's name ("Pileta"). An elongated shape gets the text laid along its
 * long side (fixed angle, like a street name: upside down from the far side);
 * a squarish one stays upright toward the camera. Edificios get it on the roof.
 * `measure(text)` = the text's width in meters at size 1 (injectable for tests).
 */
export function amenityTextItems(items, measure = text => textBox(text, 1).halfW * 2) {
  return items.flatMap((a) => {
    const text = (a.name?.trim() || AMENITY_ICONS[a.icon]?.label || '').trim();
    if (!text) return [];
    const { u, length, width } = courtFrame(a.ring);
    const along = length >= width * ALONG_RATIO;
    // Upright text turns with the camera, so it has to fit the short side whichever way it faces.
    const room = along ? length : width;
    const size = Math.min(
      (room * TEXT_FILL) / measure(text), // its width fits the room
      width * TEXT_MAX_HEIGHT, // its height doesn't swallow the shape
      TEXT_MAX_M,
    );
    // Long axis as degrees from east towards south, turned into (-90, 90] so
    // it reads left to right when looking north.
    let angle = null;
    if (along) {
      angle = THREE.MathUtils.radToDeg(Math.atan2(u[1], u[0]));
      if (angle > 90) angle -= 180;
      if (angle <= -90) angle += 180;
    }
    return [{
      id: `amenity-${a.id}`, text, size, angle, x: a.label[0], z: a.label[1],
      // Just over the roof, or the ground for pisos and canchas.
      y: isFlat(a) ? 0 : amenityHeight(a) + 0.05,
      // Dark letters on light grounds (roof, cemento, arena), white on dark ones (canchas, asfalto).
      color: outlineColorFor(amenityColor(a)), font: DEFAULT_TEXT_FONT, outline: 'none',
    }];
  });
}

/**
 * Builds the layer: fills, court lines and edificios. The names go one of two
 * ways, picked per project in the platform (branding.amenity_labels):
 * - 'ground': written on each amenity by the text layer (amenityTextItems,
 *   which mapScene adds to the texts); this layer draws no labels.
 * - 'floating': HTML pills (icon + name) over each amenity, in `container`;
 *   one that overlaps a higher-ranked one fades out. Needs `getView()` →
 *   { camera, size } and update() after each render, like poiLayer.
 * `items` from geoAmenityItems. Returns { group, setMode(mode), update(), dispose }.
 */
export function createAmenityLayer(items, { pixelRatio = 1, labels: labelMode = 'ground', container, getView } = {}) {
  const group = new THREE.Group();
  const disposables = [];
  const height = amenityHeight;

  // --- pisos and canchas: one flat mesh per color (only a handful of amenities).
  const flat = items.filter(a => a.form === 'piso' || a.form === 'cancha');
  const byColor = new Map();
  for (const a of flat) {
    const color = amenityColor(a);
    byColor.set(color, [...(byColor.get(color) ?? []), { outer: a.ring, holes: [] }]);
  }
  const fills = [...byColor].map(([color, polygons]) => {
    const mesh = new THREE.Mesh(flatFillGeometry(polygons), new THREE.MeshLambertMaterial({
      color, transparent: true, depthTest: false, depthWrite: false,
    }));
    mesh.receiveShadow = true; // the selected lot's block shades them like the calles
    mesh.renderOrder = ORDER.fill;
    group.add(mesh);
    disposables.push(mesh.geometry, mesh.material);
    return mesh;
  });

  // --- court lines: screen-space fat lines, so they stay crisp from far away.
  const courtSegs = flat.filter(a => a.form === 'cancha').flatMap(a => courtLines(a.ring, a.sport));
  if (courtSegs.length) {
    const geom = new LineSegmentsGeometry().setPositions(courtSegs.flatMap(([[x0, z0], [x1, z1]]) => [x0, 0, z0, x1, 0, z1]));
    // linewidth is in drawing-buffer pixels, hence × pixelRatio.
    const mat = new LineMaterial({
      color: 0xffffff, linewidth: COURT_LINE_PX * pixelRatio, transparent: true, opacity: 0.95,
      depthTest: false, depthWrite: false,
    });
    const lines = new LineSegments2(geom, mat);
    lines.renderOrder = ORDER.lines;
    group.add(lines);
    disposables.push(geom, mat);
  }

  // --- edificios: buildingLayer's walls and roofs, in the maqueta colors.
  const edificios = items.filter(a => a.form !== 'piso' && a.form !== 'cancha');
  if (edificios.length) {
    // Outer ring counter-clockwise, as buildWalls expects (normals outward).
    const footprints = edificios.map(a => ({
      rings: [signedArea(a.ring) > 0 ? a.ring : [...a.ring].reverse()],
      height: height(a),
    }));
    const walls = buildWalls(footprints);
    const roofs = buildRoofs(footprints);
    // Vertex colors only shade the foot of the walls; the material carries the color.
    const wc = walls.geom.getAttribute('color');
    walls.top.forEach((top, i) => { const s = top ? 1 : WALL_FOOT_SHADE; wc.setXYZ(i, s, s, s); });
    roofs.geom.getAttribute('color').array.fill(1);
    const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOR, vertexColors: true });
    const roofMat = new THREE.MeshLambertMaterial({ color: AMENITY_ROOF_COLOR, vertexColors: true });
    for (const mesh of [new THREE.Mesh(walls.geom, wallMat), new THREE.Mesh(roofs.geom, roofMat)]) {
      mesh.renderOrder = ORDER.building;
      group.add(mesh);
    }
    disposables.push(walls.geom, roofs.geom, wallMat, roofMat);
  }
  group.traverse((o) => { o.frustumCulled = false; });

  const labels = labelMode === 'floating' ? createFloatingLabels(items, container, getView) : null;

  function setMode(mode) {
    for (const mesh of fills) mesh.material.opacity = FILL_OPACITY[mode] ?? 1;
  }

  function dispose() {
    for (const d of disposables) d.dispose();
    labels?.dispose();
  }

  return { group, setMode, update: () => labels?.update(), dispose };
}

/**
 * The 'floating' labels: an HTML pill (icon + name) over each amenity, on the
 * roof for an edificio. Returns { update, dispose }.
 */
function createFloatingLabels(items, container, getView) {
  const root = document.createElement('div');
  root.className = 'map-amenities';
  container.appendChild(root);
  // Sorted by who wins when two collide (see update): edificios first, then
  // the biggest. A fixed order, so the shown one doesn't flip while orbiting.
  const rank = a => [isFlat(a) ? 1 : 0, -Math.abs(signedArea(a.ring))];
  const ranked = [...items].sort((a, b) => {
    const [ra, rb] = [rank(a), rank(b)];
    return ra[0] - rb[0] || ra[1] - rb[1];
  });
  const labels = ranked.filter(a => a.name?.trim() || amenityIconSvg(a.icon)).map((a) => {
    const el = document.createElement('div');
    el.className = 'map-amenity';
    // The icon is our own markup (AMENITY_ICONS); the name is user text, so it goes in as text.
    el.innerHTML = amenityIconSvg(a.icon, 14);
    if (a.name?.trim()) el.append(Object.assign(document.createElement('span'), { textContent: a.name }));
    root.appendChild(el);
    return { el, world: new THREE.Vector3(a.label[0], amenityHeight(a), a.label[1]) };
  });

  const projected = new THREE.Vector3();
  // Labels are placed in rank order and one that would overlap an already
  // placed one fades out (is-covered), like map apps do. Zooming in spreads
  // them apart on screen and they come back.
  function update() {
    if (!labels.length) return;
    const { camera, size } = getView();
    const placed = [];
    for (const label of labels) {
      projected.copy(label.world).project(camera);
      const x = ((projected.x + 1) / 2) * size.w;
      const y = ((1 - projected.y) / 2) * size.h;
      // z > 1 = behind the camera, where project() mirrors the point.
      const visible = projected.z < 1 && x > -60 && x < size.w + 60 && y > -30 && y < size.h + 30;
      label.el.hidden = !visible;
      if (!visible) continue;
      // Measured once, the first time it's on screen (a hidden element measures 0).
      if (!label.w) { label.w = label.el.offsetWidth; label.h = label.el.offsetHeight; }
      const box = {
        x0: x - label.w / 2 - LABEL_GAP_PX, x1: x + label.w / 2 + LABEL_GAP_PX,
        y0: y - label.h / 2 - LABEL_GAP_PX, y1: y + label.h / 2 + LABEL_GAP_PX,
      };
      const covered = placed.some(b => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      label.el.classList.toggle('is-covered', covered);
      if (!covered) placed.push(box);
      label.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  return { update, dispose: () => root.remove() };
}
