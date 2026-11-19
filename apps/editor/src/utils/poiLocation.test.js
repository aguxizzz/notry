// Parsing of the POI location field: what people paste from Google Maps.
import { describe, expect, it } from 'vitest';
import { distanceMeters, isShortMapsLink, parseLocation } from './poiLocation';

describe('parseLocation', () => {
  it('reads bare coordinates as Google Maps copies them', () => {
    expect(parseLocation('-31.420083, -64.188776')).toEqual({ lat: -31.420083, lng: -64.188776 });
    expect(parseLocation('  -31.42 -64.18 ')).toEqual({ lat: -31.42, lng: -64.18 });
  });

  it('prefers the place pin over the map center in a place link', () => {
    const url = 'https://www.google.com/maps/place/Colegio/@-31.4000,-64.2000,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-31.4123!4d-64.1987';
    expect(parseLocation(url)).toEqual({ lat: -31.4123, lng: -64.1987 });
  });

  it('falls back to the map center and to ?q=', () => {
    expect(parseLocation('https://www.google.com/maps/@-31.41,-64.19,17z')).toEqual({ lat: -31.41, lng: -64.19 });
    expect(parseLocation('https://maps.google.com/?q=-31.41%2C-64.19')).toEqual({ lat: -31.41, lng: -64.19 });
  });

  it('rejects text without coordinates and out-of-range values', () => {
    expect(parseLocation('')).toBeNull();
    expect(parseLocation('Colegio San José')).toBeNull();
    expect(parseLocation('95, 10')).toBeNull();
    expect(parseLocation('https://maps.app.goo.gl/abc123')).toBeNull();
  });
});

it('spots short share links', () => {
  expect(isShortMapsLink('https://maps.app.goo.gl/abc123')).toBe(true);
  expect(isShortMapsLink('-31.4, -64.1')).toBe(false);
});

it('measures straight-line distance', () => {
  // 0.01° of latitude is ~1.11 km anywhere.
  expect(distanceMeters({ lat: -31.4, lng: -64.1 }, { lat: -31.41, lng: -64.1 })).toBeCloseTo(1112, -1);
});
