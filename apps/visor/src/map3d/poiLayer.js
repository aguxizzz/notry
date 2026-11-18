// POIs on the 3D map (satellite/render). PREVIEW to decide how they should
// look: places inside the loteo are pins on the ground. Places outside it
// aren't drawn until picked in the panel's Alrededores tab; then mapScene
// opens the fog up to them (poiCorridor.js) and here they get a waypoint on
// their spot plus a straight line from the loteo.
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

/**
 * Where each POI goes on the map, in the scene's local meters:
 * [{ ann, id, x, z, exact }]. Inside the loteo the blueprint anchor goes
 * through the geo calibration (exact, moves with the lots). Outside, nothing
 * stores a real position yet, so for the preview it's estimated: direction
 * from the panorama (pixel column + north) and the typed distance, from the
 * loteo's pin. POIs that can't be placed are left out.
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
      out.push({ ann, id, x, z, exact: true });
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
 * `onPoiClose()` from that label's ×. Returns { update, setSelected, find, dispose }.
 */
export function createPoiLayer({ container, pois, getView, onPoiClick, onPoiClose }) {
  const root = document.createElement('div');
  root.className = 'map-pois';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'map-pois__line');
  svg.innerHTML = '<path fill="none" stroke="#c5a059" stroke-opacity="0.85" stroke-width="2.5" stroke-linecap="round"/>';
  const linePath = svg.querySelector('path');
  root.appendChild(svg);
  container.appendChild(root);

  const items = pois.map((p) => {
    const dist = Math.hypot(p.x, p.z); // from the lots' center (scene origin)
    const far = dist > NEAR_LIMIT_M;
    const typed = typedDistance(p.ann);
    // Typed distance first: for outside places it's what the developer
    // measured (by road); inside, the map measures it.
    const distText = typed || formatMeters(dist);
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

  // Straight gold line from the lots to the picked POI, plus the far one's
  // waypoint. Drawn in screen space so it keeps its width. Sampled in steps
  // so a stretch behind the camera just breaks the line instead of mirroring.
  function drawLine(camera, size) {
    const sel = items.find((it) => it.id === selectedId);
    for (const it of items) if (it.far && it !== sel) it.el.hidden = true;
    if (!sel) { linePath.setAttribute('d', ''); return; }
    const steps = 40;
    let d = '';
    let pen = false;
    for (let i = 0; i <= steps; i += 1) {
      const k = i / steps;
      const s = toScreen(camera, size, sel.x * k, 0.5, sel.z * k);
      if (!s) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
      pen = true;
    }
    linePath.setAttribute('d', d);
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
  }

  /** The POI with this id ({ x, z, dist, far }), for the camera to frame it. */
  const find = (id) => items.find((it) => it.id === id) ?? null;

  function dispose() {
    root.remove();
  }

  return { update, setSelected, find, dispose };
}
