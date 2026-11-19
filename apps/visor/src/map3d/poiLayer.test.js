// Where the gold line to a POI starts (poiLayer.js linePoints): from the
// loteo's exit closest to the road, not from the lots' center.
import { describe, expect, it } from 'vitest';
import { linePoints } from './poiLayer.js';

// Two calle ends on the loteo's edge: one west, one east.
const exits = [{ x: -100, z: 0 }, { x: 100, z: 0 }];

describe('linePoints', () => {
  it('joins the route at its stretch closest to an exit and drops what came before', () => {
    // OSRM left from the pin on a road to the west, went around the north
    // side and then east, passing right by the east exit.
    const route = [{ x: -150, z: 0 }, { x: -150, z: -200 }, { x: 150, z: -200 }, { x: 150, z: 0 }, { x: 2000, z: 0 }];
    const pts = linePoints({ x: 2000, z: 0, route }, exits);
    expect(pts[0]).toEqual({ x: 100, z: 0 });
    expect(pts[1]).toEqual({ x: 150, z: 0 }); // closest point on the stretch that passes by
    expect(pts.at(-1)).toEqual({ x: 2000, z: 0 });
    expect(pts).toHaveLength(3);
  });

  it('meets a long straight stretch mid-segment, not at its far vertex', () => {
    const route = [{ x: 0, z: 50 }, { x: 1000, z: 50 }, { x: 1000, z: 900 }];
    const pts = linePoints({ x: 1000, z: 900, route }, exits);
    expect(pts[0]).toEqual({ x: 100, z: 0 });
    expect(pts[1]).toEqual({ x: 100, z: 50 });
  });

  it('goes straight from the exit closest to the place without a route', () => {
    const pts = linePoints({ x: -900, z: 300 }, exits);
    expect(pts[0]).toEqual({ x: -100, z: 0 });
    expect(pts.at(-1)).toEqual({ x: -900, z: 300 });
  });

  it('keeps the center for places inside the loteo and when there are no exits', () => {
    expect(linePoints({ x: 50, z: 50, inside: true }, exits)[0]).toEqual({ x: 0, z: 0 });
    const route = [{ x: 10, z: 10 }, { x: 500, z: 10 }];
    expect(linePoints({ x: 500, z: 10, route }, [])[0]).toEqual({ x: 0, z: 0 });
  });
});
