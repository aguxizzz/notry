// Lots of the 3D map (mapScene.js) as their own geometry instead of pixels
// painted into the map texture: fills, borders and numbers stay sharp at any
// zoom, whatever the resolution of the tiles underneath.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { annId, lotStatus, STATUS_COLORS } from '../lotData.js';

const LABEL_HEIGHT_M = 3.2; // same size the numbers had when painted on the map
// Glyphs are rasterized once at this size. At the closest camera distance a
// number is ~150 px tall on screen, so 96 px (+ mipmaps) never looks blurry.
const GLYPH_PX = 96;
const HALO_PX = 24;
const BORDER_PX = 1.5; // CSS px, constant on screen at any zoom

// Everything lies on the ground plane (y = 0). polygonOffset pulls each layer
// a bit towards the camera instead of lifting it in meters, which z-fights
// from far away. renderOrder fixes who goes on top: fills < borders < labels.
const overlay = (order) => ({
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -order,
  polygonOffsetUnits: -order,
});

/** One mesh with every lot fill, colored per vertex by status: 1 draw call. */
function buildFills(localLots) {
  const pos = [];
  const col = [];
  const index = [];
  const color = new THREE.Color();
  for (const { lot, pts } of localLots) {
    const base = pos.length / 3;
    color.set(STATUS_COLORS[lotStatus(lot)]);
    for (const p of pts) {
      pos.push(p.x, 0, p.z);
      col.push(color.r, color.g, color.b);
    }
    // triangulateShape drops a repeated closing point, so its indices still
    // match the vertices pushed above.
    const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p.x, p.z)), []);
    for (const [a, b, c] of tris) {
      // Keep every triangle facing up (+y); the winding depends on how the
      // polygon was drawn in the editor.
      const up = (pts[b].z - pts[a].z) * (pts[c].x - pts[a].x) - (pts[b].x - pts[a].x) * (pts[c].z - pts[a].z);
      if (up > 0) index.push(base + a, base + b, base + c);
      else index.push(base + a, base + c, base + b);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geom.setIndex(index);
  // Lambert so the block's shadow also darkens the lots, not only the map.
  const mesh = new THREE.Mesh(geom, new THREE.MeshLambertMaterial({ vertexColors: true, ...overlay(1) }));
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

/** Every border as screen-space lines (fat lines addon): 1 draw call. */
function buildBorders(localLots, pixelRatio) {
  const seg = [];
  for (const { pts } of localLots) {
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      seg.push(a.x, 0, a.z, b.x, 0, b.z);
    }
  }
  const geom = new LineSegmentsGeometry().setPositions(seg);
  // linewidth is in drawing-buffer pixels, hence × pixelRatio.
  const mat = new LineMaterial({ color: 0xffffff, linewidth: BORDER_PX * pixelRatio, ...overlay(2) });
  const lines = new LineSegments2(geom, mat);
  lines.renderOrder = 2;
  return lines;
}

/**
 * Rasterizes each distinct character once into an atlas. The halo goes in the
 * red channel and the letter in the green one, so the same texture serves the
 * halo pass and the text pass, each tinted by a uniform per mode.
 */
function buildGlyphAtlas(chars) {
  const font = `700 ${GLYPH_PX}px system-ui, sans-serif`;
  const pad = HALO_PX / 2 + 4; // room for the halo + a gap so mipmaps don't bleed
  const cellH = Math.ceil(GLYPH_PX * 1.2) + pad * 2;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;

  const MAX_W = 1024;
  const glyphs = new Map();
  let x = 0;
  let y = 0;
  for (const ch of chars) {
    const adv = measure.measureText(ch).width;
    const w = Math.ceil(adv + pad * 2);
    if (x + w > MAX_W) { x = 0; y += cellH; }
    glyphs.set(ch, { x, y, w, adv });
    x += w;
  }

  const canvas = document.createElement('canvas');
  canvas.width = MAX_W;
  canvas.height = y + cellH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = HALO_PX;
  // 'lighter' adds colors, so red (halo) and green (letter) don't erase each other.
  ctx.globalCompositeOperation = 'lighter';
  for (const [ch, g] of glyphs) {
    const cx = g.x + g.w / 2;
    const cy = g.y + cellH / 2;
    ctx.strokeStyle = '#f00';
    ctx.strokeText(ch, cx, cy);
    ctx.fillStyle = '#0f0';
    ctx.fillText(ch, cx, cy);
  }

  const texture = new THREE.CanvasTexture(canvas); // flipY: v = 1 at the canvas top
  for (const g of glyphs.values()) {
    g.u0 = g.x / canvas.width;
    g.u1 = (g.x + g.w) / canvas.width;
    g.v1 = 1 - g.y / canvas.height;
    g.v0 = 1 - (g.y + cellH) / canvas.height;
  }
  return { texture, glyphs, pad, cellH };
}

const LABEL_VERTEX = /* glsl */ `
  // position = label center on the ground; aOffset = corner in meters, in
  // "page" axes (x right, y up). The page turns with the camera heading so
  // the numbers always read upright, like on a map app.
  uniform vec3 uRight;
  uniform vec3 uForward;
  attribute vec2 aOffset;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 world = position + uRight * aOffset.x + uForward * aOffset.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const LABEL_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uChannel; // 0 = halo (red), 1 = letter (green)
  varying vec2 vUv;
  void main() {
    vec2 cov = texture2D(uAtlas, vUv).rg;
    float a = mix(cov.r, cov.g, uChannel) * uAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;

/**
 * All lot numbers as quads lying on the ground, one per character. Two meshes
 * share the geometry: the halo of every label is drawn before any letter, so
 * a halo never covers the neighbor's text. 2 draw calls in total.
 */
function buildLabels(localLots, labels, anisotropy) {
  const texts = localLots.map((l) => ({ entry: l, text: labels.get(annId(l.lot)) })).filter((t) => t.text);
  const chars = [...new Set(texts.flatMap((t) => [...t.text]))];
  const { texture, glyphs, pad, cellH } = buildGlyphAtlas(chars);
  texture.anisotropy = anisotropy;

  const m = LABEL_HEIGHT_M / GLYPH_PX; // meters per atlas pixel
  const pos = [];
  const off = [];
  const uv = [];
  const index = [];
  for (const { entry, text } of texts) {
    const width = [...text].reduce((s, ch) => s + glyphs.get(ch).adv, 0);
    let x = -width / 2; // centered on the lot
    for (const ch of text) {
      const g = glyphs.get(ch);
      const left = (x - pad) * m;
      const right = (x - pad + g.w) * m;
      const half = (cellH / 2) * m;
      const base = pos.length / 3;
      for (let i = 0; i < 4; i += 1) pos.push(entry.center.x, 0, entry.center.z);
      off.push(left, -half, right, -half, right, half, left, half);
      uv.push(g.u0, g.v0, g.u1, g.v0, g.u1, g.v1, g.u0, g.v1);
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      x += g.adv;
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 2));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(index);

  // Shared by both passes: the heading changes once per frame for both.
  const shared = { uAtlas: { value: texture }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uForward: { value: new THREE.Vector3(0, 0, -1) } };
  const pass = (channel, order) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: new THREE.Color() }, uAlpha: { value: 1 }, uChannel: { value: channel } },
      vertexShader: LABEL_VERTEX,
      fragmentShader: LABEL_FRAGMENT,
      ...overlay(order),
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = order;
    // The vertices hold only the label centers, so three's bounding sphere
    // would be a few meters too small and cull labels at the screen edge.
    mesh.frustumCulled = false;
    return mesh;
  };
  return { halo: pass(0, 3), text: pass(1, 4), shared };
}

/**
 * Builds the lot layer once; it is shared by the satellite and render modes,
 * only colors change between them (setStyle). Call update() before each
 * render so the labels follow the camera heading.
 */
export function createLotLayer(localLots, labels, { pixelRatio = 1, anisotropy = 1 } = {}) {
  const fills = buildFills(localLots);
  const borders = buildBorders(localLots, pixelRatio);
  const { halo, text, shared } = buildLabels(localLots, labels, anisotropy);
  const group = new THREE.Group();
  group.add(fills, borders, halo, text);
  const offset = new THREE.Vector3();

  return {
    group,
    setStyle(style) {
      fills.material.opacity = style.fillAlpha;
      text.material.uniforms.uColor.value.set(style.text);
      text.material.uniforms.uAlpha.value = 1;
      halo.material.uniforms.uColor.value.set(style.halo);
      halo.material.uniforms.uAlpha.value = style.haloAlpha;
    },
    update(camera, target) {
      offset.copy(camera.position).sub(target);
      // Looking straight down atan2(0, 0) = 0 → north up, which is fine.
      const h = Math.atan2(offset.x, offset.z);
      shared.uRight.value.set(Math.cos(h), 0, -Math.sin(h));
      shared.uForward.value.set(-Math.sin(h), 0, -Math.cos(h));
    },
    // The atlas lives in a shader uniform, which a generic traverse+dispose
    // of the scene wouldn't reach.
    dispose() {
      shared.uAtlas.value.dispose();
      for (const mesh of [fills, borders, halo, text]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
  };
}
