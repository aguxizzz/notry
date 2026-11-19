// Free texts written on the 3D map (Loteo.geo_surfaces.textos): street names,
// zone labels, each with its own font, color and outline. Shared by the visor's map and the editor's Satellite view, so a
// text looks the same where it's placed and where the buyer sees it. Lies on
// the ground like the lot numbers, sized in meters (grows and shrinks with zoom).
import * as THREE from 'three';
import { GLYPH_PX, buildMultiFontAtlas, glyphKey, measureText } from './glyphAtlas.js';

const WEIGHT = 600; // a notch lighter than the lot numbers: names, not data

// Fonts a text can use. Loaded from Google Fonts on first use (loadTextFonts),
// in both the editor and the visor, only at the weight the map draws.
export const TEXT_FONTS = {
  moderna: { label: 'Moderna', family: '"Outfit", sans-serif', google: 'Outfit' },
  clasica: { label: 'Clásica', family: '"Fraunces", serif', google: 'Fraunces' },
  elegante: { label: 'Elegante', family: '"Playfair Display", serif', google: 'Playfair+Display' },
  senal: { label: 'Señalética', family: '"Montserrat", sans-serif', google: 'Montserrat' },
  mano: { label: 'A mano', family: '"Caveat", cursive', google: 'Caveat' },
};
export const DEFAULT_TEXT_FONT = 'moderna';

// Suggested letter colors; the editor also allows any other.
export const TEXT_COLORS = ['#ffffff', '#1f2328', '#e2c27d', '#f3ead8'];

// "auto" = the letter color follows the map mode, because no single color
// reads on both grounds: satellite has dark streets, render has white ones.
// Same pair as the lot numbers (mapScene's STYLE). A hex color stays fixed.
export const AUTO_TEXT_COLOR = 'auto';
export const AUTO_TEXT_COLORS = { satellite: '#ffffff', render: '#1f2937' };
export const DEFAULT_TEXT_COLOR = AUTO_TEXT_COLOR;

/** The hex a text's color paints in `mode` ('satellite' | 'render'): resolves "auto". */
export function resolveTextColor(color, mode = 'satellite') {
  return color === AUTO_TEXT_COLOR ? (AUTO_TEXT_COLORS[mode] ?? AUTO_TEXT_COLORS.satellite) : color;
}

// What goes around the letters: nothing, a soft blurred shadow, or a hard
// border. Its color is picked from the letter's (dark around light letters,
// light around dark ones), so it's never one more thing to choose.
export const TEXT_OUTLINES = {
  none: { label: 'Sin' },
  sombra: { label: 'Sombra', alpha: 0.7 },
  borde: { label: 'Borde', alpha: 0.75 },
};
export const DEFAULT_TEXT_OUTLINE = 'none';

// Texts saved before font/color/outline existed had a single `style`.
const LEGACY_STYLES = {
  calle: { color: '#ffffff', outline: 'borde' },
  zona: { color: '#1f2328', outline: 'borde' },
  dorado: { color: '#e2c27d', outline: 'borde' },
};

/** { font, color, outline } of a text, with defaults and the legacy `style` resolved. */
export function textLook(t) {
  const legacy = LEGACY_STYLES[t.style] ?? {};
  return {
    font: TEXT_FONTS[t.font] ? t.font : DEFAULT_TEXT_FONT,
    color: t.color ?? legacy.color ?? DEFAULT_TEXT_COLOR,
    outline: TEXT_OUTLINES[t.outline] ? t.outline : (legacy.outline ?? DEFAULT_TEXT_OUTLINE),
  };
}

/**
 * Color of the shadow/border for letters of `color`: dark for light letters
 * and vice versa. "auto" is resolved for `mode` first.
 */
export function outlineColorFor(color, mode = 'satellite') {
  const c = new THREE.Color(resolveTextColor(color, mode)); // linear: luminance with the real weights
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return luminance > 0.18 ? '#14161a' : '#ffffff';
}

// Halo of the text selected in the editor, so it reads as selected without a box.
const SELECTED_HALO = '#f59e0b';

let fontsPromise = null;
/**
 * Loads every TEXT_FONTS family once. Resolves when they're usable on a
 * canvas (or failed: then the browser's fallback font is drawn). The atlas
 * must be built after this, or it rasterizes the fallback.
 */
export function loadTextFonts() {
  if (fontsPromise) return fontsPromise;
  const families = Object.values(TEXT_FONTS);
  const href = `https://fonts.googleapis.com/css2?${families.map(f => `family=${f.google}:wght@${WEIGHT}`).join('&')}&display=swap`;
  fontsPromise = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    link.onerror = resolve;
    document.head.appendChild(link);
  })
    // The stylesheet only declares the faces; each one downloads on load().
    .then(() => Promise.all(families.map(f => document.fonts.load(`${WEIGHT} ${GLYPH_PX}px ${f.family}`))))
    .catch(() => {});
  return fontsPromise;
}

/**
 * Half size of a text's box on the ground, in meters: { halfW, halfH }. `size`
 * is the font size in meters. For hit tests; the halo is left out.
 */
export function textBox(text, size, font = DEFAULT_TEXT_FONT) {
  const m = size / GLYPH_PX;
  const family = (TEXT_FONTS[font] ?? TEXT_FONTS[DEFAULT_TEXT_FONT]).family;
  return { halfW: (measureText(text, WEIGHT, family) * m) / 2, halfH: (GLYPH_PX * 0.6) * m };
}

const TEXT_VERTEX = /* glsl */ `
  // position = text center on the ground; aOffset = glyph corner in meters,
  // in "page" axes (x along the line, y up the letters).
  // aFixed = 0: the page turns with the camera, always upright (zone names).
  // aFixed = 1: the line keeps its angle on the ground (aAngle, radians from
  // east towards south), like a street name painted along the street. Exactly
  // that angle: seen from the other side it reads upside down, like paint would.
  // aFlip = (±1, ±1) mirrors the text horizontally / vertically: flipping the
  // corner offsets swaps the quads AND the way each glyph is sampled.
  // aAuto = (letters, halo) take the mode's colors (uAutoColor / uAutoHalo)
  // instead of their own; the halo doesn't when it's the selection's amber.
  uniform vec3 uRight;
  uniform vec3 uForward;
  uniform float uChannel;
  uniform vec3 uAutoColor;
  uniform vec3 uAutoHalo;
  attribute vec2 aOffset;
  attribute float aAngle;
  attribute float aFixed;
  attribute vec3 aColor;
  attribute vec4 aHalo;
  attribute float aHaloKind;
  attribute vec2 aFlip;
  attribute vec2 aAuto;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vHaloKind;
  void main() {
    vUv = uv;
    vHaloKind = aHaloKind;
    vec3 letter = mix(aColor, uAutoColor, aAuto.x);
    vec3 around = mix(aHalo.rgb, uAutoHalo, aAuto.y);
    vColor = uChannel < 0.5 ? vec4(around, aHalo.a) : vec4(letter, 1.0);
    vec3 right = uRight;
    vec3 fwd = uForward;
    if (aFixed > 0.5) {
      right = vec3(cos(aAngle), 0.0, sin(aAngle));
      // 90° counterclockwise seen from above: east → north (-z).
      fwd = vec3(right.z, 0.0, -right.x);
    }
    vec2 offset = aOffset * aFlip;
    vec3 world = position + right * offset.x + fwd * offset.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const TEXT_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uChannel; // 0 = halo pass, 1 = letter pass (green)
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vHaloKind; // 0 = hard border (red), 1 = soft shadow (blue)
  void main() {
    vec3 cov = texture2D(uAtlas, vUv).rgb;
    float halo = mix(cov.r, cov.b, vHaloKind);
    float a = mix(halo, cov.g, uChannel) * vColor.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <colorspace_fragment>
  }
`;

/**
 * Builds every text as quads on the ground, one per character, in 2 draw
 * calls (all halos, then all letters, so a halo never covers a neighbor's
 * letters). Rebuilt whole when the texts change: they're a handful.
 *
 * `items`: [{ id, x, z, text, size, angle, font, color, outline, flipX, flipY }]
 * in local meters; optional `y` lifts it off the ground (an amenity's name on
 * its roof). `angle` in degrees (null = follows the camera), flips mirror it. `selectedId` gets
 * an amber border. Build after loadTextFonts() resolves, or the letters come
 * out in the fallback font.
 * `depthTest` false + `renderOrder` for the editor's flat map, which orders
 * layers by renderOrder alone; the visor keeps the depth test (3D blocks and
 * buildings must hide what's behind them).
 * Call update(camera) before each render so upright texts follow the heading,
 * and setMode(mode) when the map switches between 'satellite' and 'render'
 * (recolors the "auto" texts, no rebuild).
 */
export function createTextLayer(items, {
  anisotropy = 1, selectedId = null, depthTest = true, renderOrder = 5, mode = 'satellite',
} = {}) {
  const group = new THREE.Group();
  const texts = items.filter(t => t.text?.trim() && t.size > 0);
  if (!texts.length) return { group, update() {}, setMode() {}, dispose() {} };

  // Each text with its look resolved, and the characters each font needs.
  const looks = texts.map(textLook);
  const byFamily = new Map();
  texts.forEach((t, i) => {
    const { family } = TEXT_FONTS[looks[i].font];
    if (!byFamily.has(family)) byFamily.set(family, new Set());
    for (const ch of t.text) byFamily.get(family).add(ch);
  });
  const { texture, glyphs, pad, cellH } = buildMultiFontAtlas(byFamily, { weight: WEIGHT });
  texture.anisotropy = anisotropy;

  const pos = [];
  const off = [];
  const uv = [];
  const angle = [];
  const fixed = [];
  const color = [];
  const halo = [];
  const haloKind = [];
  const flip = [];
  const auto = [];
  const index = [];
  const c = new THREE.Color();
  texts.forEach((t, ti) => {
    const look = looks[ti];
    const { family } = TEXT_FONTS[look.font];
    const selected = t.id === selectedId;
    const m = t.size / GLYPH_PX; // meters per atlas pixel
    const isFixed = t.angle != null;
    const rad = isFixed ? THREE.MathUtils.degToRad(t.angle) : 0;
    const isAuto = look.color === AUTO_TEXT_COLOR;
    // THREE.Color converts the sRGB hex to the linear working space, which is
    // what the shader's colorspace_fragment expects to convert back. An "auto"
    // text gets its colors from uniforms; these are just placeholders.
    c.set(resolveTextColor(look.color));
    const textRgb = [c.r, c.g, c.b];
    // The selection is always a hard amber border, whatever the text's outline.
    c.set(selected ? SELECTED_HALO : outlineColorFor(look.color));
    const haloRgba = [c.r, c.g, c.b, selected ? 1 : (TEXT_OUTLINES[look.outline].alpha ?? 0)];
    const kind = !selected && look.outline === 'sombra' ? 1 : 0;

    const glyphOf = ch => glyphs.get(glyphKey(family, ch));
    const width = [...t.text].reduce((s, ch) => s + glyphOf(ch).adv, 0);
    let x = -width / 2; // centered on its point
    for (const ch of t.text) {
      const g = glyphOf(ch);
      const left = (x - pad) * m;
      const right = (x - pad + g.w) * m;
      const half = (cellH / 2) * m;
      const base = pos.length / 3;
      for (let i = 0; i < 4; i += 1) {
        pos.push(t.x, t.y ?? 0, t.z);
        angle.push(rad);
        fixed.push(isFixed ? 1 : 0);
        color.push(...textRgb);
        halo.push(...haloRgba);
        haloKind.push(kind);
        flip.push(t.flipX ? -1 : 1, t.flipY ? -1 : 1);
        auto.push(isAuto ? 1 : 0, isAuto && !selected ? 1 : 0);
      }
      off.push(left, -half, right, -half, right, half, left, half);
      uv.push(g.u0, g.v0, g.u1, g.v0, g.u1, g.v1, g.u0, g.v1);
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
      x += g.adv;
    }
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 2));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setAttribute('aAngle', new THREE.Float32BufferAttribute(angle, 1));
  geom.setAttribute('aFixed', new THREE.Float32BufferAttribute(fixed, 1));
  geom.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
  geom.setAttribute('aHalo', new THREE.Float32BufferAttribute(halo, 4));
  geom.setAttribute('aHaloKind', new THREE.Float32BufferAttribute(haloKind, 1));
  geom.setAttribute('aFlip', new THREE.Float32BufferAttribute(flip, 2));
  geom.setAttribute('aAuto', new THREE.Float32BufferAttribute(auto, 2));
  geom.setIndex(index);

  // Shared by both passes: the heading changes once per frame for both, the
  // "auto" colors once per mode switch.
  const shared = {
    uAtlas: { value: texture },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uAutoColor: { value: new THREE.Color() },
    uAutoHalo: { value: new THREE.Color() },
  };
  const setMode = (next) => {
    shared.uAutoColor.value.set(resolveTextColor(AUTO_TEXT_COLOR, next));
    shared.uAutoHalo.value.set(outlineColorFor(AUTO_TEXT_COLOR, next));
  };
  setMode(mode);
  const pass = (channel, order) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uChannel: { value: channel } },
      vertexShader: TEXT_VERTEX,
      fragmentShader: TEXT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest,
      // Mirroring a text on one axis (aFlip) reverses its triangles' winding,
      // which would get them culled as back faces.
      side: THREE.DoubleSide,
      // Same trick as the lot layer: pulled towards the camera instead of
      // lifted in meters, so it never z-fights with the ground.
      polygonOffset: true,
      polygonOffsetFactor: -order,
      polygonOffsetUnits: -order,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = order;
    // The vertices hold only the text centers; three's bounding sphere would
    // be too small and cull texts at the screen edge.
    mesh.frustumCulled = false;
    return mesh;
  };
  const halos = pass(0, renderOrder);
  const letters = pass(1, renderOrder + 0.01);
  group.add(halos, letters);

  const right = new THREE.Vector3();
  return {
    group,
    update(camera) {
      // The camera's right vector laid on the ground is the screen's "right"
      // as seen on the map: works for the visor's orbit and for the editor's
      // top-down camera, which rolls to put the plano's up on screen.
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      right.y = 0;
      if (right.lengthSq() < 1e-8) return;
      right.normalize();
      shared.uRight.value.copy(right);
      shared.uForward.value.set(right.z, 0, -right.x);
    },
    setMode,
    // The atlas lives in a shader uniform, which a generic traverse+dispose
    // of the scene wouldn't reach.
    dispose() {
      texture.dispose();
      geom.dispose();
      halos.material.dispose();
      letters.material.dispose();
    },
  };
}
