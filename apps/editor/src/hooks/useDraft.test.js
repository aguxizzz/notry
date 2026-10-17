import { describe, expect, test } from 'vitest';
import { rescaleDraft } from './useDraft.js';

const draft = {
  panoramaDimensions: { width: 2000, height: 1000 },
  annotations: [
    {
      id: 'a', panorama_coordinates: [[100, 50]], polygonPixels: [[100, 50]],
      blueprint_coordinates: [[0.5, 0.5]],
    },
    { id: 't', type: 'text', position: { textureX: 10, textureY: 20 } },
  ],
  calibrationPoints: [{ _id: 'c', blueprint: [0.1, 0.2], panorama: [300, 400] }],
};

describe('rescaleDraft', () => {
  test('mismas dimensiones: devuelve el borrador tal cual', () => {
    expect(rescaleDraft(draft, { width: 2000, height: 1000 })).toBe(draft);
  });

  test('sin dimensiones conocidas no reescala', () => {
    expect(rescaleDraft(draft, null)).toBe(draft);
  });

  test('panorama del doble de tamaño: escala coordenadas de panorama, no las del plano', () => {
    const scaled = rescaleDraft(draft, { width: 4000, height: 2000 });
    expect(scaled.annotations[0].panorama_coordinates).toEqual([[200, 100]]);
    expect(scaled.annotations[0].polygonPixels).toEqual([[200, 100]]);
    expect(scaled.annotations[0].blueprint_coordinates).toEqual([[0.5, 0.5]]);
    expect(scaled.annotations[1].position).toEqual({ textureX: 20, textureY: 40 });
    expect(scaled.calibrationPoints[0]).toMatchObject({ blueprint: [0.1, 0.2], panorama: [600, 800] });
    expect(scaled.panoramaDimensions).toEqual({ width: 4000, height: 2000 });
  });

  test('el ancla de un POI callout en el panorama también se escala; la del plano no', () => {
    const withCallout = {
      ...draft,
      annotations: [{ id: 'p', type: 'poi', variant: 'callout', panorama_anchor: [100, 50], blueprint_anchor: [0.3, 0.3] }],
    };
    const [poi] = rescaleDraft(withCallout, { width: 4000, height: 2000 }).annotations;
    expect(poi.panorama_anchor).toEqual([200, 100]);
    expect(poi.blueprint_anchor).toEqual([0.3, 0.3]);
  });
});
