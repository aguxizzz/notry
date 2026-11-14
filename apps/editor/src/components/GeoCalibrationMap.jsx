// Map of the Satellite view and of its calibration (GeoCalibrationOverlay puts
// it next to the blueprint). Three.js top-down view with the visor's satellite / render ground
// (geo/geoMapScene.js); replaced the ArcGIS MapView, slow and heavy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Grid3x3 } from 'lucide-react';
import { createGeoMapScene } from '../geo/geoMapScene';
import { geoHomography } from '../utils/geoCalibration';
import { fetchImage } from '../utils/fetchImage';

const MODES = [
  { id: 'satellite', label: 'Satélite' },
  { id: 'render', label: 'Render' },
];

/**
 * Click anywhere on the map to report the picked point via onMapPointPicked.
 * Draws the calibration pins and the lots (`polygons`, live-projected while
 * calibrating). With 4+ valid pairs the blueprint image is laid over the map
 * through the homography, with adjustable opacity, to check the fit by eye.
 * `surfaces` ({ shapes, drawing }, in geo) are the manzanas/calles being drawn
 * (useGeoSurfaces); `drawingTool` switches the cursor to a crosshair.
 * `adjustMode` lets the blueprint be dragged (move, corner = scale+rotate,
 * pin = fine tune), reported through onAdjust (useGeoCalibration.adjust).
 * `showPins` off hides the calibration pins (the Satellite view only needs
 * the pairs for the homography, not to see them). `initialOpacity` is where
 * the "Plano" slider starts: half while calibrating, hidden in the Satellite
 * view, where the blueprint only gets in the way unless you raise it.
 */
export default function GeoCalibrationMap({
  latitude, longitude, points, polygons, blueprintUrl, surfaces, drawingTool, adjustMode,
  showPins = true, initialOpacity = 0.5, onMapPointPicked, onAdjust,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const onPickRef = useRef(onMapPointPicked);
  const onAdjustRef = useRef(onAdjust);
  const [mode, setMode] = useState('satellite');
  const [opacity, setOpacity] = useState(initialOpacity);
  // 'plano': map turned like the blueprint pane; 'north': north up.
  const [orientation, setOrientation] = useState('plano');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [blueprint, setBlueprint] = useState(null);

  useEffect(() => {
    onPickRef.current = onMapPointPicked;
    onAdjustRef.current = onAdjust;
  }, [onMapPointPicked, onAdjust]);

  const homography = useMemo(() => geoHomography(points ?? []), [points]);

  // Centered on what's already placed when the map opens; later points don't
  // re-center it (the scene is built once per loteo, the camera stays put).
  const [initialFocus] = useState(() => [
    ...(points ?? []).map(p => p.geo),
    ...(polygons ?? []).flatMap(p => p.geo_coordinates),
  ]);

  useEffect(() => {
    if (latitude == null || longitude == null || !containerRef.current) return undefined;
    let scene;
    try {
      scene = createGeoMapScene({
        container: containerRef.current,
        latitude, longitude,
        focus: initialFocus,
        onPick: (p) => onPickRef.current?.(p),
        onAdjust: (g) => onAdjustRef.current?.(g),
        onLoadingChange: setLoading,
        onError: (err) => {
          console.error('GeoCalibrationMap: no se pudo armar el mapa', err);
          setError('No se pudo cargar el mapa.');
        },
      });
    } catch (err) {
      // WebGL unavailable lands here.
      console.error('GeoCalibrationMap: no se pudo iniciar WebGL', err);
      queueMicrotask(() => setError('No se pudo iniciar el mapa 3D en este navegador.'));
      return undefined;
    }
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // initialFocus never changes (useState without setter); listed for the linter.
  }, [latitude, longitude, initialFocus]);

  // Blueprint downloaded as a blob, same CORS-safe path as BlueprintEditor.
  useEffect(() => {
    if (!blueprintUrl) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchImage(blueprintUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bitmap = await createImageBitmap(await res.blob());
        if (cancelled) bitmap.close();
        else setBlueprint(bitmap);
      } catch (err) {
        if (!cancelled) console.error('GeoCalibrationMap: no se pudo descargar el plano', err);
      }
    })();
    return () => { cancelled = true; };
  }, [blueprintUrl]);

  // Each prop pushed into the scene. They also depend on latitude/longitude so
  // they all re-run, in this order, after the scene is rebuilt for a new pin.
  useEffect(() => { sceneRef.current?.setMode(mode); }, [mode, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setBlueprint(blueprint); }, [blueprint, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setHomography(homography); }, [homography, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setOpacity(opacity); }, [opacity, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setOrientation(orientation); }, [orientation, latitude, longitude]);
  useEffect(() => {
    sceneRef.current?.setLots((polygons ?? []).map(p => p.geo_coordinates));
  }, [polygons, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setSurfaces(surfaces); }, [surfaces, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setCursor(drawingTool); }, [drawingTool, latitude, longitude]);
  useEffect(() => { sceneRef.current?.setAdjust(!!adjustMode); }, [adjustMode, latitude, longitude]);
  useEffect(() => {
    const pins = showPins ? (points ?? []).filter(p => p.geo) : [];
    sceneRef.current?.setPins(pins.map((p, i) => ({ id: p._id, label: String(i + 1), geo: p.geo })));
  }, [points, showPins, latitude, longitude]);

  if (latitude == null || longitude == null) {
    return (
      <div className="geo-calibration-map geo-calibration-map--empty">
        <p>Este loteo no tiene latitud/longitud configuradas. Configurala desde el CRM antes de calibrar.</p>
      </div>
    );
  }

  return (
    <div className="geo-calibration-map">
      <div ref={containerRef} className="geo-calibration-map__canvas" />

      {/* Same building blocks as the main toolbar (view-switcher, dividers,
          icon buttons) so both read as one editor, not two UIs. */}
      <div className="map-controls" aria-label="Controles del mapa">
        <div className="view-switcher view-switcher--sub" role="group" aria-label="Fondo del mapa">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'is-active' : ''}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="toolbar-divider" aria-hidden="true" />
        {homography ? (
          <>
            <label className="map-controls__opacity" title="Qué tanto se ve el plano sobre el mapa">
              <Grid3x3 size={15} aria-hidden="true" />
              <span>Plano</span>
              <input
                type="range" min="0" max="1" step="0.05"
                value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
              />
            </label>
            <span className="toolbar-divider" aria-hidden="true" />
            {/* Toggle: lit = north up; off = map turned like the blueprint (default). */}
            <button
              type="button"
              className={`editor-icon-btn${orientation === 'north' ? ' is-active' : ''}`}
              aria-pressed={orientation === 'north'}
              aria-label="Norte arriba"
              title={orientation === 'plano' ? 'Poner el norte arriba' : 'Girar el mapa como el plano'}
              onClick={() => setOrientation(o => (o === 'plano' ? 'north' : 'plano'))}
            >
              <Compass size={17} />
            </button>
          </>
        ) : (
          // Only while calibrating: without 4 pairs there's no blueprint to fade or turn.
          <span className="map-controls__hint">Con 4 puntos el plano aparece encima</span>
        )}
      </div>

      {loading && <div className="geo-map-loading">Cargando mapa…</div>}
      {error && <div className="geo-calibration-map__error">{error}</div>}
    </div>
  );
}
