// Manzanas, calles, verdes, agua and perímetro of the loteo (geoSurfaces.js gives
// them in local meters) as flat meshes on the map, between the ground and the lots.
// Verdes and agua bring their own textured material (naturalSurfaces.js). Same stacking
// trick as the rest of the map: no depth test, order set by renderOrder.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import polygonClipping from 'polygon-clipping';
import { flatFillGeometry } from './flatFill.js';
import { createNaturalSurfaces } from './naturalSurfaces.js';

// Above the whole ground (satellite at 0, vector layers below 0) and under the
// lot fills (1). Verdes over manzanas (a plaza is drawn inside one), agua over
// verdes (a pond in a park), calles over all of them in case one overlaps.
// The perímetro's veil goes under all of them: it dims the ground outside the
// loteo, not our own surfaces (an access calle that runs out of it stays clear).
// Its border goes over every other edge.
const ORDER = { veil: 0.4, manzanas: 0.5, verde: 0.53, agua: 0.56, calles: 0.6, edges: 0.7, perimetro: 0.75 };

// Perímetro border, in CSS px like the lot borders (lotLayer.js draws 1.5 px):
// a bit thicker so it reads as the loteo's limit and not as one more lot.
const PERIMETER_PX = 2.5;

// Per map mode. Render goes with vectorGround's PALETTE (white roads with a
// darker casing); satellite darkens the photo where a calle goes, since a new
// loteo often has no street in the photo yet. A first pass: the look of our
// own calles and manzanas is still to be decided.
//
// Verdes and agua: `colors` feed the shader in naturalSurfaces.js. Verde =
// [grass, drier patches]; agua = [shallow, deep, wet bank].
// `sky` is what the water reflects, `glint` how strong the sun shines on it.
// The lots are the only saturated thing on the map (available is green,
// reserved blue), so the verdes step back:
// - render ("how it will look"): textured grass halfway between vectorGround's
//   pastel greens ('#dde6cc') and a darker sage, so ours reads apart from the
//   OSM greens without shouting. The full pastel was too faint.
// - satellite ("the project over today's photo"): the photo already shows real
//   vegetation, so fake grass on top doesn't fit. The verde is a flat `tint`
//   with a border instead, like the manzanas: "a plaza goes here". It has to be
//   a fairly saturated green at ~half opacity: a pale one only lightens the
//   photo's own green and reads as transparent. `colors` stay for the textured
//   mesh, which is hidden while the tint is on.
// Water bluer in render so it reads as water at a glance, greener in satellite
// to match the photo.
// Perímetro: a `veil` over everything outside it, so the eye stays on the
// loteo. Satellite darkens the photo (the neighbours' fields stay readable,
// just quieter); render washes the OSM map toward the sky color, which is
// what the fog fades into anyway.
export const SURFACE_STYLE = {
  render: {
    manzana: { color: 0xe6e0d2, opacity: 1 },
    calle: { color: 0xffffff, opacity: 1 },
    edge: { color: 0xd2cbbd, opacity: 1 },
    verde: { colors: [0xa8b98a, 0xb6b98f], opacity: 1 },
    agua: { colors: [0x86bccb, 0x3d7d9d, 0xb9b08f], sky: 0xd4e4ef, glint: 1.2, opacity: 1 },
    perimetro: { veil: 0xf3f1ec, veilOpacity: 0.55, edge: 0x7d7464, edgeOpacity: 0.9 },
  },
  satellite: {
    manzana: { color: 0xfff3d6, opacity: 0.18 },
    calle: { color: 0x4b4b4b, opacity: 0.7 },
    edge: { color: 0xffffff, opacity: 0.45 },
    verde: {
      colors: [0x2b3419, 0x36341b], opacity: 1,
      tint: { color: 0x8fd14f, opacity: 0.5, edge: 0xd4f5a8, edgeOpacity: 1 },
    },
    agua: { colors: [0x4f8079, 0x1d4757, 0x80775a], sky: 0xc6d6e2, glint: 1.4, opacity: 1 },
    perimetro: { veil: 0x000000, veilOpacity: 0.45, edge: 0xffffff, edgeOpacity: 0.9 },
  },
};

/**
 * One mesh per kind, laid on the ground. `polygons` = [{ outer, holes }] with
 * rings as [[x, z], ...] (see flatFill.js for why not ShapeGeometry).
 */
function fillMesh(polygons, order) {
  const geom = flatFillGeometry(polygons);
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({
    transparent: true, depthTest: false, depthWrite: false,
  }));
  mesh.receiveShadow = true; // the selected lot's block also shades the street
  mesh.renderOrder = order;
  return mesh;
}

/** Thin 1 px outline of `rings` ([[x, z], ...] closed implicitly), 1 draw call. */
function ringLines(rings, order) {
  const seg = [];
  for (const ring of rings) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      seg.push(a[0], 0, a[1], b[0], 0, b[1]);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
    transparent: true, depthTest: false, depthWrite: false,
  }));
  lines.renderOrder = order;
  return lines;
}

/**
 * Everything outside the perímetros, up to `radius` meters from the origin, as
 * [{ outer, holes }]. Several perímetros are merged first, so where two overlap
 * the veil doesn't go on twice and a gap between them stays outside.
 */
export function outsidePerimeter(perimetros, radius) {
  const close = ring => [...ring, ring[0]];
  const open = ring => ring.slice(0, -1);
  const r = radius;
  const world = [[[-r, -r], [r, -r], [r, r], [-r, r], [-r, -r]]];
  return polygonClipping.difference(world, ...perimetros.map(ring => [close(ring)]))
    .map(([outer, ...holes]) => ({ outer: open(outer), holes: holes.map(open) }));
}

/** The perímetro border as screen-space lines (fat lines addon), like the lot borders. */
function perimeterLines(rings, pixelRatio) {
  const seg = [];
  for (const ring of rings) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      seg.push(a[0], 0, a[1], b[0], 0, b[1]);
    });
  }
  const geom = new LineSegmentsGeometry().setPositions(seg);
  // linewidth is in drawing-buffer pixels, hence × pixelRatio.
  const lines = new LineSegments2(geom, new LineMaterial({
    linewidth: PERIMETER_PX * pixelRatio, transparent: true, depthTest: false, depthWrite: false,
  }));
  lines.renderOrder = ORDER.perimetro;
  return lines;
}

/**
 * Builds the layer from geoSurfaceRings() output; `sunDir` (points at the sun)
 * lights the water's glints. `veilRadius` = how far the perímetro's veil
 * reaches (the end of the map); `pixelRatio` sizes its border. Returns
 * { group, setStyle, dispose }; the group is empty when the loteo has nothing drawn.
 */
export function createSurfaceLayer(
  { manzanas, calles, verdes = [], aguas = [], perimetros = [] },
  { sunDir, veilRadius = 3000, pixelRatio = 1 },
) {
  const group = new THREE.Group();
  const meshes = {};

  const natural = createNaturalSurfaces({ verdes, aguas }, { sunDir });
  for (const [kind, mesh] of Object.entries(natural.meshes)) {
    mesh.renderOrder = ORDER[kind];
    group.add(mesh);
  }

  // Flat tint + border version of the verdes, for styles with `verde.tint`
  // (satellite). Built always, hidden in the modes that don't use it.
  let verdeTint = null;
  let verdeEdge = null;
  if (verdes.length) {
    verdeTint = fillMesh(verdes, ORDER.verde);
    // Border of every piece, holes included: they're where a lot or calle cut it.
    verdeEdge = ringLines(verdes.flatMap(({ outer, holes }) => [outer, ...holes]), ORDER.edges);
    group.add(verdeTint, verdeEdge);
  }

  if (manzanas.length) {
    meshes.manzana = fillMesh(manzanas.map(ring => ({ outer: ring, holes: [] })), ORDER.manzanas);
    group.add(meshes.manzana);
  }

  if (calles.length) {
    // The merged network keeps its holes: the manzanas a street grid encloses.
    meshes.calle = fillMesh(calles, ORDER.calles);
    group.add(meshes.calle);
  }

  // Thin border of every manzana and of the street network (outer contour and
  // holes), 1 draw call. Without it a faint manzana fill is lost on the photo.
  const edgeRings = [...manzanas, ...calles.flatMap(({ outer, holes }) => [outer, ...holes])];
  if (edgeRings.length) {
    meshes.edge = ringLines(edgeRings, ORDER.edges);
    group.add(meshes.edge);
  }

  // Perímetro: veil outside + border. Basic material (unlit) so the veil is
  // the same shade everywhere; it keeps the fog, which fades it with the map.
  let veil = null;
  let perimeterEdge = null;
  if (perimetros.length) {
    const outside = outsidePerimeter(perimetros, veilRadius);
    veil = new THREE.Mesh(
      flatFillGeometry(outside),
      new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }),
    );
    veil.renderOrder = ORDER.veil;
    // The veil's holes are the merged perímetros: bordering them instead of
    // each perímetro makes overlapping ones read as a single limit.
    perimeterEdge = perimeterLines(outside.flatMap(({ holes }) => holes), pixelRatio);
    group.add(veil, perimeterEdge);
  }

  group.traverse((o) => { o.frustumCulled = false; });

  function setStyle(style) {
    natural.setStyle(style);
    // Tinted verdes replace the textured ones, never both.
    const tint = style.verde.tint;
    if (natural.meshes.verde) natural.meshes.verde.visible = !tint;
    if (verdeTint) {
      verdeTint.visible = verdeEdge.visible = Boolean(tint);
      if (tint) {
        verdeTint.material.color.set(tint.color);
        verdeTint.material.opacity = tint.opacity;
        verdeEdge.material.color.set(tint.edge);
        verdeEdge.material.opacity = tint.edgeOpacity;
      }
    }
    for (const [kind, mesh] of Object.entries(meshes)) {
      mesh.material.color.set(style[kind].color);
      mesh.material.opacity = style[kind].opacity;
    }
    if (veil) {
      const p = style.perimetro;
      veil.material.color.set(p.veil);
      veil.material.opacity = p.veilOpacity;
      perimeterEdge.material.color.set(p.edge);
      perimeterEdge.material.opacity = p.edgeOpacity;
    }
  }

  function dispose() {
    natural.dispose();
    for (const mesh of [...Object.values(meshes), verdeTint, verdeEdge, veil, perimeterEdge].filter(Boolean)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return { group, setStyle, dispose };
}
