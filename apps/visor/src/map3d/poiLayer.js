// POIs on the 3D map (satellite/render). PREVIEW to decide how they should
// look: places inside the loteo are pins on the ground. Places outside it
// aren't drawn until picked in the panel's Alrededores tab; then mapScene
// opens the fog up to them (poiCorridor.js) and here they get a waypoint on
// their spot plus a line from the loteo, along the streets when the back
// stored a driving route for them, straight otherwise. The line leaves from
// the loteo's exit closest to the road (a calle's end) and draws itself
// toward the place instead of popping in.
// Drawn as an HTML/SVG overlay over the canvas, repositioned by mapScene on
// every rendered frame.
import { applyHomography } from './homography.js';
import { geoHomography } from './geoSurfaces.js';

// Past this distance from the loteo a POI is never a pin: the sharp map ends
// way before, and a pin at the horizon reads as a glitch.
const NEAR_LIMIT_M = 1200;
// Distance written as minutes ("12 min") turned into meters for the preview,
// assuming ~36 km/h on urban roads. Only used to place approximate POIs.
const METERS_PER_MIN = 600;
// Pins open into their photo card once the camera is closer than this.
const CARD_DIST_M = 260;
const LABEL_MARGIN = 16; // px kept between the waypoint's card and the screen border
// Waypoint stem + dot under the card, in px: room the anchor point needs below
// the card when it's pinned to the screen border.
const WAY_STEM_PX = 52;
// The gold line grows from the loteo to the place over GROW_MS, starting a
// beat after the pick so the camera is already on its way when it shows up.
const GROW_MS = 1600;
const GROW_DELAY_MS = 250;
// Picking where the line joins the route: each meter from the loteo's exit
// to the road weighs this many meters of road (see linePoints).
const OFF_ROAD_WEIGHT = 3;
// Line look per map mode. Over the satellite photo plain gold sinks into the
// asphalt and the roofs, so it gets a dark casing (a wider stroke under it,
// like a navigation app's route) and a lighter gold. The render's pale ground
// already makes the gold stand out; a thin white casing just keeps it crisp.
const LINE_STYLE = {
  satellite: { casing: '#1a140c', casingOpacity: 0.7, casingWidth: 7.5, color: '#f2c66b', width: 3.5 },
  render: { casing: '#ffffff', casingOpacity: 0.8, casingWidth: 5.5, color: '#c5a059', width: 2.5 },
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const PIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>';
const CAMERA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="2.4"/><circle cx="12" cy="13" r="3.4"/><path d="M8 6l1.2-2h5.6L16 6"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

const centroid = (pts) => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

/** "800 m" / "3,2 km" from meters, for what the map measured itself. */
function formatMeters(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** The distance the developer typed ("12 min", "4.5 km"), or '' if none. */
function typedDistance(ann) {
  const v = parseFloat(ann.distance_value);
  if (!Number.isFinite(v)) return '';
  const n = Number.isInteger(v) ? v : String(Math.round(v * 10) / 10).replace('.', ',');
  return ann.distance_unit === 'min' ? `${n} min` : `${n} km`;
}

/** "8 min en auto · 3,9 km" from the back's route, or '' without one. */
function routeText(route) {
  if (!route?.duration_s) return '';
  const min = Math.max(1, Math.round(route.duration_s / 60));
  return `${min} min en auto · ${formatMeters(route.distance_m)}`;
}

/** Closest point to `p` on the segment a → b, and how far it is. */
function closestOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  const point = { x: a.x + t * dx, z: a.z + t * dz };
  return { point, d: Math.hypot(p.x - point.x, p.z - point.z) };
}

/**
 * Points the gold line goes through, in scene meters. `exits` are where it
 * may leave the loteo (see mapScene); a place inside the loteo, or a loteo
 * with no exits, keeps the lots' center (the scene origin) as the start.
 *
 * With a route: from the exit closest to any stretch of it, joined to that
 * stretch. The route itself leaves from the loteo's pin, snapped by OSRM to
 * whatever road was nearest, so what it did before that stretch is dropped:
 * it often went around the loteo the long way. Segments, not just vertices,
 * since OSRM leaves straight roads with points hundreds of meters apart.
 * Without a route: straight from the exit closest to the place, cut in steps
 * so a stretch behind the camera can drop out on its own.
 */
export function linePoints(item, exits = []) {
  const useExits = !item.inside && exits.length > 0;
  if (item.route) {
    if (!useExits) return [{ x: 0, z: 0 }, ...item.route];
    const { route } = item;
    const cum = cumulative(route);
    const total = cum[cum.length - 1];
    // Score = the jump from the exit to the road plus what's left of the
    // route from there. Closest-to-the-road alone ties between an exit by the
    // route's start and one further along it; this keeps the shorter trip.
    // The jump counts triple, it's off-road.
    let best = null;
    for (const exit of exits) {
      for (let j = 0; j < route.length - 1; j += 1) {
        const c = closestOnSegment(exit, route[j], route[j + 1]);
        const left = total - cum[j] - Math.hypot(c.point.x - route[j].x, c.point.z - route[j].z);
        const score = OFF_ROAD_WEIGHT * c.d + left;
        // `<=`: on a tie the later stretch, so joining right on a vertex
        // doesn't repeat it as the next stretch's start.
        if (!best || score <= best.score) best = { ...c, exit, j, score };
      }
    }
    return [best.exit, best.point, ...route.slice(best.j + 1)];
  }
  const toPlace = (p) => Math.hypot(item.x - p.x, item.z - p.z);
  const from = useExits
    ? exits.reduce((a, b) => (toPlace(b) < toPlace(a) ? b : a))
    : { x: 0, z: 0 };
  const steps = 40;
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: from.x + ((item.x - from.x) * i) / steps,
    z: from.z + ((item.z - from.z) * i) / steps,
  }));
}

/** Running length along `pts` (cum[i] = meters from pts[0] to pts[i]). */
function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  return cum;
}

/**
 * Where each POI goes on the map, in the scene's local meters:
 * [{ ann, id, x, z, exact, inside?, route? }]. Inside the loteo the blueprint anchor goes
 * through the geo calibration (exact, moves with the lots). Outside, the real
 * location typed in the editor (latitude/longitude) when there is one; if not,
 * it's estimated: direction from the panorama (pixel column + north) and the
 * typed distance, from the loteo's pin. POIs that can't be placed are left out.
 */
export function placePois(pois, { geoPoints, latitude, longitude, northOffset, panoramaWidth, toLocal }) {
  const H = geoHomography(geoPoints);
  const origin = latitude != null && longitude != null ? toLocal(latitude, longitude) : { x: 0, z: 0 };
  const out = [];
  for (const ann of pois) {
    const id = ann.uuid || ann.id;
    const bp = ann.blueprint_anchor ?? (ann.blueprint_coordinates?.length >= 3 ? centroid(ann.blueprint_coordinates) : null);
    if (H && bp) {
      const [lng, lat] = applyHomography(H, bp);
      const { x, z } = toLocal(lat, lng);
      // `inside`: placed on the blueprint, so it's in the loteo and its line
      // keeps leaving from the center rather than from an exit.
      out.push({ ann, id, x, z, exact: true, inside: true });
      continue;
    }
    // The blueprint anchor wins above: it's what lines up with the drawn lots.
    if (ann.latitude != null && ann.longitude != null) {
      const { x, z } = toLocal(ann.latitude, ann.longitude);
      // Driving route the back got from OSRM, turned into scene meters once here.
      const route = ann.route?.points?.length >= 2
        ? ann.route.points.map(([lat, lng]) => toLocal(lat, lng))
        : null;
      out.push({ ann, id, x, z, exact: true, route });
      continue;
    }
    const px = ann.panorama_anchor ?? (ann.panorama_coordinates?.length ? centroid(ann.panorama_coordinates) : null);
    const value = parseFloat(ann.distance_value);
    if (!px || northOffset == null || !panoramaWidth || !Number.isFinite(value)) continue;
    // Same pixel → yaw as the panorama (lotOrbit.js), minus north = compass
    // bearing, clockwise from north. North is -z in the scene.
    const yaw = (px[0] / panoramaWidth - 0.5) * Math.PI * 2;
    const bearing = yaw - northOffset;
    const meters = ann.distance_unit === 'min' ? value * METERS_PER_MIN : value * 1000;
    out.push({
      ann, id, exact: false,
      x: origin.x + Math.sin(bearing) * meters,
      z: origin.z - Math.cos(bearing) * meters,
    });
  }
  return out;
}

/**
 * Overlay with the POIs over the map canvas. `getView()` gives what the
 * layer needs each frame: { camera, size: {w, h}, target }. `onPoiClick(ann)`
 * when one is tapped (a pin, or the label of the picked far one);
 * `onPoiClose()` from that label's ×. `exits`: where lines to outside places
 * may leave the loteo (see linePoints); `reducedMotion` skips the line's growth.
 * Returns { update, setSelected, setMode, isGrowing, find, dispose }.
 */
export function createPoiLayer({ container, pois, exits = [], reducedMotion = false, getView, onPoiClick, onPoiClose }) {
  const root = document.createElement('div');
  root.className = 'map-pois';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-pois__line');
  // Casing under the gold, then a dot riding the tip while the line grows.
  svg.innerHTML = `<path fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle r="4.5" stroke-width="2"/>`;
  const [casingPath, linePath] = svg.querySelectorAll('path');
  const tipDot = svg.querySelector('circle');

  function setMode(mode) {
    const s = LINE_STYLE[mode] ?? LINE_STYLE.render;
    casingPath.setAttribute('stroke', s.casing);
    casingPath.setAttribute('stroke-opacity', s.casingOpacity);
    casingPath.setAttribute('stroke-width', s.casingWidth);
    linePath.setAttribute('stroke', s.color);
    linePath.setAttribute('stroke-width', s.width);
    tipDot.setAttribute('fill', s.color);
    tipDot.setAttribute('stroke', s.casing);
  }
  setMode('render');
  root.appendChild(svg);
  container.appendChild(root);

  const items = pois.map((p) => {
    const dist = Math.hypot(p.x, p.z); // from the lots' center (scene origin)
    const far = dist > NEAR_LIMIT_M;
    const typed = typedDistance(p.ann);
    // The real drive wins when there's a route; then the typed distance (what
    // the developer measured by road); inside the loteo, the map measures it.
    const distText = routeText(p.ann.route) || typed || formatMeters(dist);
    const isView = p.ann.poi_kind === 'perspective';
    const icon = isView ? CAMERA_ICON : PIN_ICON;
    const title = escapeHtml(p.ann.tooltip ?? '');
    const el = document.createElement(far ? 'div' : 'button');
    if (far) {
      // Waypoint on the place, only while picked: card on a tall stem, like
      // the inside pins but bigger so it reads from kilometers up. Tapping
      // the card opens the ficha; the × lets go of the place.
      el.className = 'map-poi-way';
      el.innerHTML = `<span class="map-poi-way__card"><button type="button" class="map-poi-far__open">
          <span class="map-poi-far__icon">${icon}</span>
          <span class="map-poi-far__text"><span class="map-poi-far__title">${title}</span>
          <span class="map-poi-far__dist">${escapeHtml(distText)}${p.exact ? '' : ' · aprox.'} · ver ficha</span></span>
        </button><button type="button" class="map-poi-far__close" aria-label="Dejar de mostrar">${CLOSE_ICON}</button></span>
        <span class="map-poi-way__stem"></span><span class="map-poi-way__dot"></span>`;
      el.querySelector('.map-poi-far__open').addEventListener('click', (e) => { e.stopPropagation(); onPoiClick?.(p.ann); });
      el.querySelector('.map-poi-far__close').addEventListener('click', (e) => { e.stopPropagation(); onPoiClose?.(); });
    } else {
      const photo = p.ann.image_url && !isView ? escapeHtml(p.ann.image_url) : '';
      el.type = 'button';
      el.className = photo ? 'map-poi-pin map-poi-pin--photo' : 'map-poi-pin';
      el.innerHTML = `<span class="map-poi-pin__card">${photo ? `<img src="${photo}" alt="" loading="lazy" />` : ''}
          <span class="map-poi-pin__label"><span class="map-poi-pin__icon">${icon}</span>${title}</span>
        </span><span class="map-poi-pin__stem"></span><span class="map-poi-pin__dot"></span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onPoiClick?.(p.ann); });
    }
    el.hidden = true;
    root.append(el);
    return { ...p, dist, far, el, size: null };
  });

  let selectedId = null;
  // When the picked line started growing, and whether its full length was
  // already drawn (the last frame has to land exactly on 1).
  let growStart = 0;
  let growDone = true;

  /** How much of the picked line is drawn, 0-1, eased in-out. */
  function growth(now) {
    if (reducedMotion) return 1;
    const t = Math.min(1, Math.max(0, (now - growStart - GROW_DELAY_MS) / GROW_MS));
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }

  // World point → CSS px on the canvas; null if behind the camera. Done by
  // hand instead of Vector3.project() to tell "behind" apart (cz ≥ 0), which
  // project() would mirror onto the screen.
  function toScreen(camera, size, x, y, z) {
    const e = camera.matrixWorldInverse.elements;
    // Camera-space depth: negative z = in front.
    const cz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (cz > -1) return null;
    const p = camera.projectionMatrix.elements;
    const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
    const X = p[0] * cx + p[4] * cy + p[8] * cz + p[12] * cw;
    const Y = p[1] * cx + p[5] * cy + p[9] * cz + p[13] * cw;
    const W = p[3] * cx + p[7] * cy + p[11] * cz + p[15] * cw;
    return { x: ((X / W + 1) / 2) * size.w, y: ((1 - Y / W) / 2) * size.h };
  }

  function update() {
    const { camera, size, target } = getView();
    camera.updateMatrixWorld();
    const camDist = camera.position.distanceTo(target);
    for (const it of items) {
      if (it.far) continue; // drawn by drawLine, only when picked
      const s = toScreen(camera, size, it.x, 0, it.z);
      const visible = s && s.x > -40 && s.x < size.w + 40 && s.y > -40 && s.y < size.h + 40;
      it.el.hidden = !visible;
      if (!visible) continue;
      it.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
      it.el.classList.toggle('is-selected', it.id === selectedId);
      it.el.classList.toggle('is-open', camDist < CARD_DIST_M || it.id === selectedId);
    }
    drawLine(camera, size);
  }

  // Gold line from the lots to the picked POI, plus the far one's waypoint.
  // Along the streets when the POI has a route, straight otherwise. Drawn in
  // screen space so it keeps its width; a point behind the camera just breaks
  // the line instead of mirroring. While growing it's cut in world meters,
  // not on screen, so it advances at an even pace along the road whatever
  // the perspective does to the far end.
  function drawLine(camera, size) {
    const sel = items.find((it) => it.id === selectedId);
    for (const it of items) if (it.far && it !== sel) it.el.hidden = true;
    if (!sel) {
      linePath.setAttribute('d', '');
      casingPath.setAttribute('d', '');
      tipDot.setAttribute('visibility', 'hidden');
      return;
    }
    // Worked out once per POI, on its first pick (exits × route segments).
    sel.line ??= linePoints(sel, exits);
    sel.cum ??= cumulative(sel.line);
    const k = growth(performance.now());
    growDone = k === 1;
    const reach = k * sel.cum[sel.cum.length - 1];
    let d = '';
    let pen = false;
    let tip = null;
    const plot = (x, z) => {
      const s = toScreen(camera, size, x, 0.5, z);
      tip = s;
      if (!s) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
      pen = true;
    };
    for (let i = 0; i < sel.line.length; i += 1) {
      const pt = sel.line[i];
      if (sel.cum[i] <= reach) { plot(pt.x, pt.z); continue; }
      // The segment the tip is on: drawn up to where it is, then stop.
      const prev = sel.line[i - 1];
      const f = (reach - sel.cum[i - 1]) / (sel.cum[i] - sel.cum[i - 1]);
      plot(prev.x + (pt.x - prev.x) * f, prev.z + (pt.z - prev.z) * f);
      break;
    }
    linePath.setAttribute('d', d);
    casingPath.setAttribute('d', d);
    // The dot leads the line while it grows and goes once it arrives.
    const showTip = !growDone && k > 0 && tip;
    tipDot.setAttribute('visibility', showTip ? 'visible' : 'hidden');
    if (showTip) { tipDot.setAttribute('cx', tip.x.toFixed(1)); tipDot.setAttribute('cy', tip.y.toFixed(1)); }
    if (!sel.far) return;
    // Waypoint on its spot. Off screen (the user looked elsewhere) it waits at
    // the border without stem, so the place is never lost.
    const s = toScreen(camera, size, sel.x, 0, sel.z);
    sel.el.hidden = !s;
    if (!s) return;
    const card = sel.el.firstElementChild;
    sel.size ??= { w: card.offsetWidth, h: card.offsetHeight };
    const halfW = sel.size.w / 2;
    const x = Math.min(Math.max(s.x, halfW + LABEL_MARGIN), size.w - halfW - LABEL_MARGIN);
    const y = Math.min(Math.max(s.y, sel.size.h + WAY_STEM_PX + LABEL_MARGIN), size.h - LABEL_MARGIN);
    sel.el.classList.toggle('is-edge', x !== s.x || y !== s.y);
    sel.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  function setSelected(id) {
    selectedId = id;
    // Every pick draws its line again from the loteo.
    growStart = performance.now();
    growDone = id == null;
  }

  /** True while the picked line is still drawing itself (the scene keeps rendering). */
  const isGrowing = () => !growDone;

  /** The POI with this id ({ x, z, dist, far }), for the camera to frame it. */
  const find = (id) => items.find((it) => it.id === id) ?? null;

  function dispose() {
    root.remove();
  }

  return { update, setSelected, setMode, isGrowing, find, dispose };
}
