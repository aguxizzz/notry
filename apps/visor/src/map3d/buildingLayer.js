// Buildings around the loteo on the 3D map (mapScene.js), extruded from
// footprint outlines (Overture Maps: Google/Microsoft/OSM). The back downloads
// them once per loteo into a GeoJSON on R2 (visor data's buildingsUrl).
// All buildings go into two merged meshes (walls, roofs) = 2 draw calls.
import * as THREE from 'three';
import earcut from 'earcut';

// Overture has almost no heights in Argentina, so they're guessed from the
// footprint: most buildings are one-floor houses, the big ones are sheds.
// Steps in m² → height in meters.
const HEIGHT_STEPS = [[60, 2.8], [250, 3.3], [600, 4.5], [1500, 6], [Infinity, 7.5]];
const FLOOR_M = 3; // when the data does say how many floors
const JITTER_M = 0.35; // ± per building, so a row of houses isn't one flat line

// Walls darken toward the ground: a cheap stand-in for the shadow where a wall
// meets the ground (ambient occlusion), without a shadow pass for thousands.
const WALL_FOOT_SHADE = 0.72;

const STYLE = {
  // Light model look, like a white architect's maqueta.
  render: { wall: 0xf3efe7, roof: 0xfbf9f4 },
  // Satellite takes each building's colors from the photo (setGround); `roof`
  // is only for buildings past the edge of every ground photo.
  satellite: { roof: 0x8f8a80 },
};

// Satellite: the roof is the average color of its own roof in the photo (flat,
// so the low-res pixels don't show) and the walls are that same tone, darker
// and a bit grayer. A dense block then blends into the photo instead of
// lighting up like a row of white boxes (the first version did). The photo
// itself on the roofs was tried too: at ~0.5 m/px it reads as a blur.
// Screen brightness factors (0-1), picked live on demoloteo with a slider
// panel: at 0.7/0.4 the buildings still read too light against the photo.
const SAT_WALL_DARKEN = 0.15;
// Roofs under their photo: light sheet metal averaged out (and lit by the
// scene's sun on top) still reads as a white lid and the block lights up again.
const SAT_ROOF_DARKEN = 0.4;
const SAT_WALL_GRAY = 0.35; // how much of the wall color goes to its own gray
// Only the middle of the footprint is averaged: its edges often catch ground,
// trees or the shadow next to the building (outlines aren't pixel-exact).
const SAMPLE_INSET = 0.25; // per side, as a fraction of the bbox
const SAMPLE_GRID = 6; // 6×6 samples per roof is plenty for an average
const SAMPLE_MAX_PX = 2048; // photo downscaled to this before reading it back

// Same layer as the lots: after the flat ground layers (surfaces 0.4-0.75,
// lot fills 1, borders 2) so those, drawn without depth test, can't paint over
// a building; before the lot numbers (3, 4), which a building can hide.
const RENDER_ORDER = 2.5;

// Small stable hash of a footprint, so the jitter is the same on every load.
function hashRing(ring) {
  let h = 2166136261;
  for (const [x, z] of ring) {
    h = Math.imul(h ^ Math.round(x * 10), 16777619);
    h = Math.imul(h ^ Math.round(z * 10), 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

// Signed area in local meters; > 0 = counter-clockwise seen from above
// (x east, z south, so the sign flips against the usual x/y formula).
function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return -a / 2;
}

/** Guessed height for a footprint of `area` m², unless the data has one. */
export function buildingHeight({ height, floors, area, seed }) {
  // Under 2 m it's a typo in the source (demoloteo has one at 0.05 m).
  if (height >= 2) return height;
  if (floors > 0) return floors * FLOOR_M;
  const base = HEIGHT_STEPS.find(([max]) => area < max)[1];
  return base + (seed * 2 - 1) * JITTER_M;
}

/**
 * Footprints in local meters from a GeoJSON FeatureCollection: [{ rings,
 * height }], outer ring first and counter-clockwise, holes clockwise. Rings
 * come without the closing point. `skip(x, z)` drops a building by its
 * center (the ones standing on a lot of the loteo).
 */
export function footprintsFromGeoJSON(geojson, toLocal, skip = () => false) {
  const out = [];
  for (const f of geojson?.features ?? []) {
    const g = f.geometry;
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      const rings = poly.map((ring) => {
        const pts = ring.map(([lng, lat]) => { const p = toLocal(lat, lng); return [p.x, p.z]; });
        const [fx, fz] = pts[0];
        const [lx, lz] = pts[pts.length - 1];
        if (fx === lx && fz === lz) pts.pop(); // GeoJSON repeats the first point
        return pts;
      }).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      // Outer CCW and holes CW: the wall normals below assume it.
      rings.forEach((r, i) => { if ((signedArea(r) > 0) !== (i === 0)) r.reverse(); });
      const outer = rings[0];
      const area = Math.abs(signedArea(outer));
      if (area < 6) continue; // slivers the detection models leave behind
      const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
      const cz = outer.reduce((s, p) => s + p[1], 0) / outer.length;
      if (skip(cx, cz)) continue;
      const props = f.properties ?? {};
      out.push({
        rings,
        height: buildingHeight({ height: props.h ?? props.height, floors: props.floors ?? props.num_floors, area, seed: hashRing(outer) }),
      });
    }
  }
  return out;
}

// Walls: one quad per edge, outward normals. `top` is 1 on the top vertices
// and 0 at the foot (paint darkens the foot); `owner` says which building
// each vertex belongs to, for the colors.
function buildWalls(footprints) {
  const pos = [];
  const nor = [];
  const top = [];
  const owner = [];
  footprints.forEach(({ rings, height }, b) => {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const [x1, z1] = ring[i];
        const [x2, z2] = ring[(i + 1) % ring.length];
        // Ring CCW seen from above (x east, z south): the outside is to the
        // right of each edge, (-dz, dx). Same side the triangles below face.
        const dx = x2 - x1;
        const dz = z2 - z1;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        // Two triangles: bottom1, bottom2, top2 / bottom1, top2, top1.
        pos.push(x1, 0, z1, x2, 0, z2, x2, height, z2, x1, 0, z1, x2, height, z2, x1, height, z1);
        for (let k = 0; k < 6; k += 1) { nor.push(nx, 0, nz); owner.push(b); }
        top.push(0, 0, 1, 0, 1, 1);
      }
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  return { geom, top, owner };
}

// Roofs: flat, earcut per building. Colors are filled in by setGround.
function buildRoofs(footprints) {
  const pos = [];
  const index = [];
  const owner = [];
  footprints.forEach(({ rings, height }, b) => {
    const flat = [];
    const holes = [];
    for (const ring of rings) {
      if (flat.length) holes.push(flat.length / 2);
      for (const [x, z] of ring) flat.push(x, z);
    }
    const base = pos.length / 3;
    for (let i = 0; i < flat.length; i += 2) { pos.push(flat[i], height, flat[i + 1]); owner.push(b); }
    for (const t of earcut(flat, holes.length ? holes : null)) index.push(base + t);
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geom.setIndex(index);
  geom.computeVertexNormals();
  // earcut's triangles all wind the same way but not always the one facing
  // up; if they came out facing down, flip them all.
  const n = geom.getAttribute('normal');
  if (n.count && n.getY(0) < 0) {
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
    geom.setIndex(index);
    geom.computeVertexNormals();
  }
  return { geom, owner };
}

/**
 * Average photo color of each footprint's middle, as THREE.Color (sRGB), or
 * null for the ones outside the photo. `bounds` = the ground plane in local
 * meters ({ minX, minZ, width, height }), `canvas` = its stitched photo.
 */
function roofColors(footprints, canvas, bounds) {
  // One small readback of the whole photo instead of one per building.
  const k = Math.min(1, SAMPLE_MAX_PX / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * k));
  const h = Math.max(1, Math.round(canvas.height * k));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  return footprints.map(({ rings }) => {
    let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const [x, z] of rings[0]) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const ix = (maxX - minX) * SAMPLE_INSET;
    const iz = (maxZ - minZ) * SAMPLE_INSET;
    let r = 0; let g = 0; let bl = 0; let n = 0;
    for (let i = 0; i < SAMPLE_GRID; i += 1) {
      for (let j = 0; j < SAMPLE_GRID; j += 1) {
        const x = minX + ix + ((maxX - minX - 2 * ix) * (i + 0.5)) / SAMPLE_GRID;
        const z = minZ + iz + ((maxZ - minZ - 2 * iz) * (j + 0.5)) / SAMPLE_GRID;
        const u = Math.floor(((x - bounds.minX) / bounds.width) * w);
        const v = Math.floor(((z - bounds.minZ) / bounds.height) * h); // canvas top = north = min z
        if (u < 0 || v < 0 || u >= w || v >= h) continue;
        const o = (v * w + u) * 4;
        r += px[o]; g += px[o + 1]; bl += px[o + 2]; n += 1;
      }
    }
    if (!n) return null;
    // Photo bytes are sRGB and kept that way: paint() darkens in that space,
    // the one the eye reads, and only then converts to linear for the vertex colors.
    return new THREE.Color(r / n / 255, g / n / 255, bl / n / 255);
  });
}

/**
 * Layer with the buildings of `footprints` (footprintsFromGeoJSON). Returns
 * { group, setStyle(mode), setGround(meshes | null), dispose }. setGround takes
 * satellite mode's ground planes (sharp first), where the buildings get their
 * colors from; null = the plain maqueta colors (render mode).
 */
export function createBuildingLayer(footprints) {
  const group = new THREE.Group();
  // Vertex colors carry each building's tone (or 1 in render); the material
  // color multiplies them (white in satellite, the maqueta color in render).
  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });

  const wallParts = buildWalls(footprints);
  const roofParts = buildRoofs(footprints);
  const walls = new THREE.Mesh(wallParts.geom, wallMat);
  const roofs = new THREE.Mesh(roofParts.geom, roofMat);
  for (const m of [walls, roofs]) {
    m.renderOrder = RENDER_ORDER;
    group.add(m);
  }

  // Writes the vertex colors: `colors[b]` per building, or plain white
  // (null) so only the material color counts.
  function paint(colors) {
    // Everything here is in sRGB values until toLinear. Darkening in linear
    // instead barely shows: ×0.42 linear is still ~0.68 on screen.
    const fallback = new THREE.Color().setHex(STYLE.satellite.roof, THREE.LinearSRGBColorSpace); // raw hex, no conversion
    const toLinear = (c) => new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
    const roofs = colors?.map((c) => toLinear((c ?? fallback).clone().multiplyScalar(SAT_ROOF_DARKEN)));
    const roofOf = (b) => roofs?.[b] ?? null;
    const wallOf = colors
      ? colors.map((c) => {
        const base = c ?? fallback;
        const gray = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722;
        return toLinear(base.clone().lerp(new THREE.Color(gray, gray, gray), SAT_WALL_GRAY).multiplyScalar(SAT_WALL_DARKEN));
      })
      : null;

    const wc = wallParts.geom.getAttribute('color');
    wallParts.owner.forEach((b, i) => {
      const s = wallParts.top[i] ? 1 : WALL_FOOT_SHADE;
      const c = wallOf?.[b];
      wc.setXYZ(i, (c ? c.r : 1) * s, (c ? c.g : 1) * s, (c ? c.b : 1) * s);
    });
    wc.needsUpdate = true;

    const rc = roofParts.geom.getAttribute('color');
    roofParts.owner.forEach((b, i) => {
      const c = roofOf(b);
      rc.setXYZ(i, c ? c.r : 1, c ? c.g : 1, c ? c.b : 1);
    });
    rc.needsUpdate = true;
  }

  // `meshes`: ground planes from sharpest to blurriest (satellite's inner
  // photo, then the outer ring). Each building takes its color from the first
  // one that covers it, so the far ones match the blurry ring around them
  // instead of all going the same flat gray.
  function setGround(meshes) {
    const planes = (meshes ?? []).filter((m) => m?.material?.map);
    if (!planes.length) {
      paint(null);
      return;
    }
    const perPlane = planes.map((mesh) => {
      // The plane is centered at mesh.position, canvas top = north (-z).
      const { width, height } = mesh.geometry.parameters;
      const bounds = { minX: mesh.position.x - width / 2, minZ: mesh.position.z - height / 2, width, height };
      return roofColors(footprints, mesh.material.map.image, bounds);
    });
    paint(footprints.map((_, b) => perPlane.reduce((found, colors) => found ?? colors[b], null)));
  }

  function setStyle(mode) {
    const satellite = mode === 'satellite';
    wallMat.color.set(satellite ? 0xffffff : STYLE.render.wall);
    roofMat.color.set(satellite ? 0xffffff : STYLE.render.roof);
  }

  function dispose() {
    wallParts.geom.dispose();
    roofParts.geom.dispose();
    for (const m of [wallMat, roofMat]) m.dispose();
  }

  return { group, setStyle, setGround, dispose };
}
