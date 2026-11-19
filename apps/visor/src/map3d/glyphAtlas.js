// Glyph atlas shared by everything the 3D map writes on the ground: lot
// numbers (lotLayer.js) and free texts (textLayer.js). Each character is
// rasterized once, so a label is just a few quads sampling this texture.
import * as THREE from 'three';

// Glyphs are rasterized once at this size. At the closest camera distance a
// lot number is ~150 px tall on screen, so 96 px (+ mipmaps) never looks blurry.
export const GLYPH_PX = 96;
const HALO_PX = 24;
// Soft shadow: a blurred copy of the letter. Its blur needs more room than
// the hard halo, so it sets the padding around each glyph.
const SHADOW_BLUR_PX = 14;
const DEFAULT_FAMILY = 'system-ui, sans-serif';

export const fontOf = (weight, family = DEFAULT_FAMILY) => `${weight} ${GLYPH_PX}px ${family}`;

let measureCtx = null;
/**
 * Width of `text` in atlas pixels (divide by GLYPH_PX for "font sizes"), with
 * the same font the atlas uses. Lets the editor size a text's hit box without
 * building any geometry.
 */
export function measureText(text, weight = 700, family = DEFAULT_FAMILY) {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  measureCtx.font = fontOf(weight, family);
  return measureCtx.measureText(text).width;
}

/** Key of a glyph in a multi-font atlas. */
export const glyphKey = (family, ch) => `${family}\u0000${ch}`;

/**
 * Rasterizes each glyph once into an atlas, one color channel per pass so a
 * single texture serves all of them:
 *   red   = hard halo (a thick stroke around the letter)
 *   green = the letter itself
 *   blue  = soft shadow (the letter blurred)
 * `entries`: [{ key, ch, font }] (font as a CSS font string).
 * Returns { texture, glyphs: Map(key → { u0, u1, v0, v1, w, adv }), pad, cellH }.
 */
function rasterize(entries) {
  const pad = Math.max(HALO_PX / 2, SHADOW_BLUR_PX * 1.5) + 4; // + a gap so mipmaps don't bleed
  const cellH = Math.ceil(GLYPH_PX * 1.2) + pad * 2;
  const measure = document.createElement('canvas').getContext('2d');

  const MAX_W = 2048;
  const glyphs = new Map();
  let x = 0;
  let y = 0;
  for (const { key, ch, font } of entries) {
    measure.font = font;
    const adv = measure.measureText(ch).width;
    const w = Math.ceil(adv + pad * 2);
    if (x + w > MAX_W) { x = 0; y += cellH; }
    glyphs.set(key, { x, y, w, adv, ch, font });
    x += w;
  }

  const canvas = document.createElement('canvas');
  canvas.width = MAX_W;
  canvas.height = y + cellH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = HALO_PX;
  // 'lighter' adds colors, so the three channels don't erase each other.
  ctx.globalCompositeOperation = 'lighter';
  // The shadow is drawn far off the canvas and only its blur is brought back
  // with the offset: shadowBlur works in every browser, ctx.filter doesn't.
  const OFF = canvas.width + canvas.height + 1000;
  for (const g of glyphs.values()) {
    const cx = g.x + g.w / 2;
    const cy = g.y + cellH / 2;
    ctx.font = g.font;
    ctx.strokeStyle = '#f00';
    ctx.strokeText(g.ch, cx, cy);
    ctx.fillStyle = '#0f0';
    ctx.fillText(g.ch, cx, cy);
    ctx.save();
    ctx.shadowColor = '#00f';
    ctx.shadowBlur = SHADOW_BLUR_PX;
    ctx.shadowOffsetX = OFF;
    ctx.fillStyle = '#00f';
    ctx.fillText(g.ch, cx - OFF, cy);
    ctx.restore();
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

/** One font: glyphs keyed by the character itself (lot numbers). */
export function buildGlyphAtlas(chars, { weight = 700, family = DEFAULT_FAMILY } = {}) {
  const font = fontOf(weight, family);
  return rasterize(chars.map(ch => ({ key: ch, ch, font })));
}

/**
 * Several fonts in one atlas (one texture, still 2 draw calls for every
 * text): `byFamily` is Map(family → Set of chars), glyphs keyed by glyphKey().
 */
export function buildMultiFontAtlas(byFamily, { weight = 600 } = {}) {
  const entries = [];
  for (const [family, chars] of byFamily) {
    const font = fontOf(weight, family);
    for (const ch of chars) entries.push({ key: glyphKey(family, ch), ch, font });
  }
  return rasterize(entries);
}
