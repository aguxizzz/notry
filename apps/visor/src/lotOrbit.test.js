import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { fitGroundTilt, annotationsToOrbitLots, focusFill, markersToOrbitPins } from './lotOrbit.js';

// Verdad de terreno: lotes rectangulares sobre un suelo plano visto desde un
// dron a 100 de altura, fotografiados con la cámara inclinada `tilt` grados.
// fitGroundTilt tiene que recuperar esa inclinación a partir de los píxeles.
const PANO = { fullWidth: 8000, fullHeight: 4000 };
const DRONE_HEIGHT = 100;

function cameraTilt({ x, z }) {
  const euler = new THREE.Euler(THREE.MathUtils.degToRad(x), 0, THREE.MathUtils.degToRad(z), 'XYZ');
  return new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
}

// Inversa de la convención de lotOrbit (dirFromAngles + pixelDir).
function dirToPixel(dir) {
  const yaw = Math.atan2(dir.x, -dir.z);
  const pitch = Math.asin(dir.y);
  return [(yaw / (2 * Math.PI) + 0.5) * PANO.fullWidth, (0.5 - pitch / Math.PI) * PANO.fullHeight];
}

function photographLots(tilt) {
  // La foto cruda está inclinada: nivelada = level * cruda → cruda = levelᵀ * nivelada.
  const toRaw = cameraTilt(tilt).transpose();
  const lots = [];
  for (const [cx, cz, angle] of [[120, -80, 0.3], [-150, -60, 1.1], [60, 140, 0.7], [-90, 110, 2.0], [200, 40, 0.1]]) {
    const corners = [[-15, -25], [15, -25], [15, 25], [-15, 25]].map(([u, v]) => {
      const gx = cx + u * Math.cos(angle) - v * Math.sin(angle);
      const gz = cz + u * Math.sin(angle) + v * Math.cos(angle);
      const leveled = new THREE.Vector3(gx, -DRONE_HEIGHT, gz).normalize();
      return dirToPixel(leveled.applyMatrix3(toRaw));
    });
    lots.push({ points: corners });
  }
  return lots;
}

describe('fitGroundTilt', () => {
  it('suelo ya nivelado → inclinación ~0', () => {
    const fit = fitGroundTilt(photographLots({ x: 0, z: 0 }), PANO);
    expect(fit.lots).toBe(5);
    expect(Math.abs(fit.x)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(fit.z)).toBeLessThanOrEqual(0.25);
  });

  it('recupera una inclinación conocida', () => {
    const fit = fitGroundTilt(photographLots({ x: 6, z: -4 }), PANO);
    expect(fit.x).toBeCloseTo(6, 0);
    expect(fit.z).toBeCloseTo(-4, 0);
  });

  it('acepta polígonos cerrados (último punto = primero)', () => {
    const closed = photographLots({ x: 0, z: 0 }).map(({ points }) => ({ points: [...points, points[0]] }));
    expect(fitGroundTilt(closed, PANO)?.lots).toBe(5);
  });

  it('con menos de 4 lotes de 4 vértices no se anima a medir', () => {
    expect(fitGroundTilt(photographLots({ x: 0, z: 0 }).slice(0, 3), PANO)).toBeNull();
  });
});

describe('annotationsToOrbitLots', () => {
  const anns = [
    { id: 'a', type: 'polygon', status: 'available', tooltip: 'Lote 1', panorama_coordinates: [[0, 0], [1, 0], [1, 1]] },
    { id: 'b', type: 'polygon', status: 'sold', panorama_coordinates: [[0, 0], [1, 0], [1, 1]] },
    { id: 'h', type: 'polygon', visible: false, panorama_coordinates: [] },
    { id: 'p', type: 'poi' },
  ];

  it('solo lotes visibles, transparentes por defecto', () => {
    const lots = annotationsToOrbitLots(anns);
    expect(lots.map((l) => l.id)).toEqual(['a', 'b']);
    expect(lots[0]).toMatchObject({ label: 'Lote 1', fill: { opacity: 0 } });
  });

  it('modo foco: recomendado en dorado, el resto gris; sin foco, relleno base', () => {
    const [a, b] = annotationsToOrbitLots(anns);
    const recommendedIds = new Set(['a']);
    expect(focusFill(a, { recommendedIds, focusMode: true })).toEqual({ color: 0xc5a059, opacity: 0.42 });
    expect(focusFill(b, { recommendedIds, focusMode: true })).toEqual({ color: 0xa0a0a0, opacity: 0.2 });
    expect(focusFill(b, { recommendedIds })).toBe(b.fill);
  });

  it('filtro: el que no pasa se apaga aunque sea recomendado', () => {
    const [a, b] = annotationsToOrbitLots(anns);
    const focus = { recommendedIds: new Set(['a']), visibleIds: new Set(['b']) };
    expect(focusFill(a, focus)).toEqual({ color: 0x0a0a0a, opacity: 0.42 });
    expect(focusFill(b, focus)).toBe(b.fill);
    expect(focusFill(a, { visibleIds: null })).toBe(a.fill);
  });
});

describe('markersToOrbitPins', () => {
  it('toma los markers HTML puntuales y marca los badges con su lote', () => {
    const pins = markersToOrbitPins([
      { id: 'a__badge', html: '<svg/>', position: { textureX: 10, textureY: 20 } },
      { id: 'a', polygonPixels: [[0, 0]] },
      { id: 'x__icon', html: '<svg/>', visible: false, position: { textureX: 1, textureY: 1 } },
    ]);
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ badgeOf: 'a', pixel: [10, 20], anchor: 'center' });
  });
});
