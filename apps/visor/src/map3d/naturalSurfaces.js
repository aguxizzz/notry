// Verdes and agua on the 3D map with a procedural look instead of a flat color:
// muted grass drifting in big patches with a faint grain; water shallow at the shore
// and deep in the middle, with ripples that catch the sun and the sky. Drawn
// in the shader from noise in world meters, so nothing to download and no
// tile that repeats. surfaceLayer.js adds these meshes with the rest.
import * as THREE from 'three';
import { flatFillGeometry } from './flatFill.js';

// --- Distance to the shore -----------------------------------------------------
// The water shader needs to know how far from the shore each pixel is (it gets
// deeper toward the middle). A blurred mask gives that cheaply:
// 0.5 right on the border, rising to 1 well inside, staying lower in narrow
// parts (a thin arm of a lake reads shallow, as it would be).

// Texture resolution: half a meter per pixel, coarser if the shapes span more
// than MAX_FIELD_PX. It only carries a smooth gradient, detail comes from noise.
const FIELD_METERS_PER_PX = 0.5;
const MAX_FIELD_PX = 1024;
// How far in (meters) the shallow water reaches.
const BLUR_METERS = 9;

/** Even-odd scanline fill of polygons ([{ outer, holes }] in meters) into `mask` (0/1). */
function rasterize(polygons, mask, width, height, x0, z0, mpp) {
  const edges = [];
  for (const { outer, holes = [] } of polygons) {
    for (const ring of [outer, ...holes]) {
      ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        // To pixel space, where pixel j covers z0 + [j, j+1)·mpp.
        edges.push([(a[0] - x0) / mpp, (a[1] - z0) / mpp, (b[0] - x0) / mpp, (b[1] - z0) / mpp]);
      });
    }
  }
  const xs = [];
  for (let j = 0; j < height; j += 1) {
    const y = j + 0.5; // sample at the pixel center
    xs.length = 0;
    for (const [ax, ay, bx, by] of edges) {
      if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = from; i <= to; i += 1) mask[j * width + i] = 1;
    }
  }
}

/** Separable box blur, 3 passes (≈ gaussian). Outside the texture counts as 0, like outside the shapes. */
function blur(src, width, height, radius) {
  if (radius < 1) return src;
  let a = src;
  let b = new Float32Array(src.length);
  const pass = (from, to, len, count, stride, step) => {
    const norm = 1 / (2 * radius + 1);
    for (let line = 0; line < count; line += 1) {
      const base = line * stride;
      let sum = 0;
      for (let k = 0; k <= radius && k < len; k += 1) sum += from[base + k * step];
      for (let i = 0; i < len; i += 1) {
        to[base + i * step] = sum * norm;
        // Slide the window: add the one entering on the right, drop the one leaving on the left.
        if (i + radius + 1 < len) sum += from[base + (i + radius + 1) * step];
        if (i - radius >= 0) sum -= from[base + (i - radius) * step];
      }
    }
  };
  for (let n = 0; n < 3; n += 1) {
    pass(a, b, width, height, width, 1); // rows
    pass(b, a, height, width, 1, width); // columns
  }
  return a;
}

/**
 * Bakes the shore field of `aguas` ([{ outer, holes }] in meters) into the red
 * channel of an RGBA byte array covering their bounding box. Returns { data,
 * width, height, box: [x0, z0, 1/widthMeters, 1/heightMeters] } or null when
 * there's no water.
 */
export function bakeShoreField(aguas = []) {
  const points = aguas.flatMap(p => p.outer);
  if (!points.length) return null;
  const pad = BLUR_METERS + 2;
  const x0 = Math.min(...points.map(p => p[0])) - pad;
  const z0 = Math.min(...points.map(p => p[1])) - pad;
  const spanX = Math.max(...points.map(p => p[0])) + pad - x0;
  const spanZ = Math.max(...points.map(p => p[1])) + pad - z0;
  const mpp = Math.max(FIELD_METERS_PER_PX, Math.max(spanX, spanZ) / MAX_FIELD_PX);
  const width = Math.ceil(spanX / mpp);
  const height = Math.ceil(spanZ / mpp);

  const mask = new Float32Array(width * height);
  rasterize(aguas, mask, width, height, x0, z0, mpp);
  // A box of radius r applied 3 times spreads about 1.7·r; aim that at BLUR_METERS.
  const field = blur(mask, width, height, Math.round(BLUR_METERS / mpp / 1.7));
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < field.length; i += 1) data[i * 4] = Math.round(field[i] * 255);
  return { data, width, height, box: [x0, z0, 1 / (width * mpp), 1 / (height * mpp)] };
}

// --- Shader --------------------------------------------------------------------

const GLSL_COMMON = /* glsl */ `
varying vec3 vNatPos;
uniform sampler2D uField;
uniform vec4 uFieldBox;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform float uGlint;

// Hash without sine (Dave Hoskins): stable on mobile GPUs at a few km from the origin.
float natHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float natNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(natHash(i), natHash(i + vec2(1.0, 0.0)), u.x),
             mix(natHash(i + vec2(0.0, 1.0)), natHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// One layer of noise with features of about len meters. When a screen pixel
// covers more than a quarter of len (far away, or a low camera) it fades to
// its average, 0.5: otherwise it would shimmer as the camera moves.
float natOct(vec2 p, float len, float px) {
  float keep = clamp(len / px * 0.5 - 1.0, 0.0, 1.0);
  return mix(0.5, natNoise(p / len), keep);
}

// Two fixed rotations so the layers don't line up on the same grid.
const mat2 natR1 = mat2(0.8, -0.6, 0.6, 0.8);
const mat2 natR2 = mat2(-0.47, 0.88, -0.88, -0.47);

float natField(vec2 p) {
  return texture2D(uField, (p - uFieldBox.xy) * uFieldBox.zw).r;
}
`;

// Grass: a muted base color (uC1) drifting in big patches toward a drier,
// greyer tone (uC2), plus a faint grain up close. Kept calm on purpose: dry
// spots, shrubs and a dark border looked busy, and a single saturated green
// looked cartoonish. Real grass seen from above varies in hue more than in
// brightness.
const GLSL_GRASS_COLOR = /* glsl */ `
  vec2 natP = vNatPos.xz;
  float natPx = max(length(dFdx(natP)), length(dFdy(natP)));
  float patches = natOct(natP, 30.0, natPx) * 0.6 + natOct(natR1 * natP + 13.1, 11.0, natPx) * 0.4;
  vec3 natC = mix(uC1, uC2, smoothstep(0.3, 0.75, patches) * 0.7);
  natC *= 0.95 + 0.1 * natOct(natR2 * natP + 7.3, 4.0, natPx);
  natC *= 0.96 + 0.08 * natOct(natR2 * natP + 1.9, 0.8, natPx);
  diffuseColor.rgb = natC;
`;

// Water. uC1 shallow, uC2 deep, uC3 wet bank.
const GLSL_WATER_COLOR = /* glsl */ `
  vec2 natP = vNatPos.xz;
  float natPx = max(length(dFdx(natP)), length(dFdy(natP)));
  float natIn = natField(natP);
  vec3 natC = mix(uC1, uC2, smoothstep(0.5, 0.97, natIn));
  // Wet bank. A band a couple of texels wide: much thinner and the edge of the
  // bilinear field shows as stair steps.
  natC = mix(natC, uC3, (1.0 - smoothstep(0.5, 0.64, natIn)) * 0.55);
  // Slow, big patches: wind ruffling parts of the surface.
  natC *= 0.94 + 0.12 * natOct(natR1 * natP, 30.0, natPx);
  diffuseColor.rgb = natC;
`;

// After the lighting: the water reflects the sky (more at a low angle, the
// Fresnel effect) and the sun glints off ripples, whose slope comes from the
// noise. Far away the ripples fade out and the surface goes mirror-flat.
const GLSL_WATER_LIGHT = /* glsl */ `
  float natE = 0.2;
  float natH0 = natOct(natR1 * natP, 1.6, natPx) * 0.6 + natOct(natR2 * natP + 5.0, 0.6, natPx) * 0.4;
  float natHx = natOct(natR1 * (natP + vec2(natE, 0.0)), 1.6, natPx) * 0.6 + natOct(natR2 * (natP + vec2(natE, 0.0)) + 5.0, 0.6, natPx) * 0.4;
  float natHz = natOct(natR1 * (natP + vec2(0.0, natE)), 1.6, natPx) * 0.6 + natOct(natR2 * (natP + vec2(0.0, natE)) + 5.0, 0.6, natPx) * 0.4;
  vec3 natN = normalize(vec3((natH0 - natHx) * 1.4, 1.0, (natH0 - natHz) * 1.4));
  vec3 natV = normalize(cameraPosition - vNatPos);
  float natFres = 0.04 + 0.6 * pow(1.0 - max(dot(natV, natN), 0.0), 5.0);
  outgoingLight = mix(outgoingLight, uSky, natFres);
  outgoingLight += vec3(1.0, 0.96, 0.88) * pow(max(dot(natN, normalize(uSunDir + natV)), 0.0), 220.0) * uGlint;
`;

function naturalMaterial(kind, uniforms) {
  const material = new THREE.MeshLambertMaterial({ transparent: true, depthTest: false, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vNatPos;\n${shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vNatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    )}`;
    let fragment = GLSL_COMMON + shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n${kind === 'agua' ? GLSL_WATER_COLOR : GLSL_GRASS_COLOR}`,
    );
    if (kind === 'agua') {
      fragment = fragment.replace('#include <opaque_fragment>', `${GLSL_WATER_LIGHT}\n  #include <opaque_fragment>`);
    }
    shader.fragmentShader = fragment;
  };
  // Both kinds share MeshLambertMaterial's program cache unless told apart.
  material.customProgramCacheKey = () => `natural-${kind}`;
  return material;
}

/**
 * Meshes for `verdes` and `aguas` ([{ outer, holes }] in local meters).
 * `sunDir` points at the sun (for the water's glints). Returns { meshes:
 * { verde?, agua? }, setStyle(style), dispose }; setStyle takes the `verde`
 * and `agua` entries of SURFACE_STYLE[mode].
 */
export function createNaturalSurfaces({ verdes = [], aguas = [] }, { sunDir }) {
  const meshes = {};
  // Only the water reads the shore field; the grass shader doesn't declare it in use.
  const field = bakeShoreField(aguas);
  let texture = null;
  if (field) {
    texture = new THREE.DataTexture(field.data, field.width, field.height, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }

  const uniformsFor = () => ({
    uField: { value: texture },
    uFieldBox: { value: field ? new THREE.Vector4(...field.box) : new THREE.Vector4() },
    uC1: { value: new THREE.Color() },
    uC2: { value: new THREE.Color() },
    uC3: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() },
    uSunDir: { value: sunDir.clone().normalize() },
    uGlint: { value: 0 },
  });
  const uniforms = {};
  for (const [kind, polygons] of [['verde', verdes], ['agua', aguas]]) {
    if (!polygons.length) continue;
    uniforms[kind] = uniformsFor();
    meshes[kind] = new THREE.Mesh(flatFillGeometry(polygons), naturalMaterial(kind, uniforms[kind]));
    meshes[kind].receiveShadow = true;
  }

  function setStyle(style) {
    for (const [kind, u] of Object.entries(uniforms)) {
      const s = style[kind];
      s.colors.forEach((hex, i) => u[`uC${i + 1}`].value.set(hex));
      u.uSky.value.set(s.sky ?? 0xffffff);
      u.uGlint.value = s.glint ?? 0;
      meshes[kind].material.opacity = s.opacity;
    }
  }

  function dispose() {
    texture?.dispose();
    for (const mesh of Object.values(meshes)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }

  return { meshes, setStyle, dispose };
}
