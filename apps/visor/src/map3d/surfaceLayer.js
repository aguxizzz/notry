// Manzanas and calles of the loteo (geoSurfaces.js gives them in local meters)
// as flat meshes on the map, between the ground and the lots. Same stacking
// trick as the rest of the map: no depth test, order set by renderOrder.
import * as THREE from 'three';
import { flatFillGeometry } from './flatFill.js';

// Above the whole ground (satellite at 0, vector layers below 0) and under the
// lot fills (1). Calles over manzanas, in case one was drawn overlapping.
const ORDER = { manzanas: 0.5, calles: 0.6, edges: 0.7 };

// Per map mode. Render goes with vectorGround's PALETTE (white roads with a
// darker casing); satellite darkens the photo where a calle goes, since a new
// loteo often has no street in the photo yet. A first pass: the look of our
// own calles and manzanas is still to be decided.
export const SURFACE_STYLE = {
  render: {
    manzana: { color: 0xe6e0d2, opacity: 1 },
    calle: { color: 0xffffff, opacity: 1 },
    edge: { color: 0xd2cbbd, opacity: 1 },
  },
  satellite: {
    manzana: { color: 0xfff3d6, opacity: 0.18 },
    calle: { color: 0x4b4b4b, opacity: 0.7 },
    edge: { color: 0xffffff, opacity: 0.45 },
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

/**
 * Builds the layer from geoSurfaceRings() output. Returns { group, setStyle,
 * dispose }; the group is empty when the loteo has nothing drawn.
 */
export function createSurfaceLayer({ manzanas, calles }) {
  const group = new THREE.Group();
  const meshes = {};

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
    const seg = [];
    for (const ring of edgeRings) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        seg.push(a[0], 0, a[1], b[0], 0, b[1]);
      });
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    meshes.edge = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({
      transparent: true, depthTest: false, depthWrite: false,
    }));
    meshes.edge.renderOrder = ORDER.edges;
    group.add(meshes.edge);
  }

  group.traverse((o) => { o.frustumCulled = false; });

  function setStyle(style) {
    for (const [kind, mesh] of Object.entries(meshes)) {
      mesh.material.color.set(style[kind].color);
      mesh.material.opacity = style[kind].opacity;
    }
  }

  function dispose() {
    for (const mesh of Object.values(meshes)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return { group, setStyle, dispose };
}
