// Manzanas, calles, verdes and agua of the loteo (geoSurfaces.js gives them in
// local meters) as flat meshes on the map, between the ground and the lots.
// Verdes and agua bring their own textured material (naturalSurfaces.js). Same stacking
// trick as the rest of the map: no depth test, order set by renderOrder.
import * as THREE from 'three';
import { flatFillGeometry } from './flatFill.js';
import { createNaturalSurfaces } from './naturalSurfaces.js';

// Above the whole ground (satellite at 0, vector layers below 0) and under the
// lot fills (1). Verdes over manzanas (a plaza is drawn inside one), agua over
// verdes (a pond in a park), calles over all of them in case one overlaps.
const ORDER = { manzanas: 0.5, verde: 0.53, agua: 0.56, calles: 0.6, edges: 0.7 };

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
export const SURFACE_STYLE = {
  render: {
    manzana: { color: 0xe6e0d2, opacity: 1 },
    calle: { color: 0xffffff, opacity: 1 },
    edge: { color: 0xd2cbbd, opacity: 1 },
    verde: { colors: [0xa8b98a, 0xb6b98f], opacity: 1 },
    agua: { colors: [0x86bccb, 0x3d7d9d, 0xb9b08f], sky: 0xd4e4ef, glint: 1.2, opacity: 1 },
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
 * Builds the layer from geoSurfaceRings() output; `sunDir` (points at the sun)
 * lights the water's glints. Returns { group, setStyle, dispose }; the group
 * is empty when the loteo has nothing drawn.
 */
export function createSurfaceLayer({ manzanas, calles, verdes = [], aguas = [] }, { sunDir }) {
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
  }

  function dispose() {
    natural.dispose();
    for (const mesh of [...Object.values(meshes), verdeTint, verdeEdge].filter(Boolean)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return { group, setStyle, dispose };
}
