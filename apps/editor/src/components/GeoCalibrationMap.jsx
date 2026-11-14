// Map of the Satellite view and of its calibration (GeoCalibrationOverlay puts
// it next to the blueprint). Three.js top-down view with the visor's satellite / render ground
// (geo/geoMapScene.js); replaced the ArcGIS MapView, slow and heavy.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createGeoMapScene } from '../geo/geoMapScene';
import { geoHomography } from '../utils/geoCalibration';
import { fetchImage } from '../utils/fetchImage';
import { getLotSvgStyle } from '../utils/lotStyles';
import { useMapView } from '../hooks/useMapView';
import MapControls from './MapControls';

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
 * the pairs for the homography, not to see them).
 * `view` (useMapView) comes from outside when the controls live in the main
 * toolbar (Satellite view); without it the map keeps its own state and draws
 * its own floating bar (calibration), starting the blueprint at half opacity.
 */
export default function GeoCalibrationMap({
  latitude, longitude, points, polygons, blueprintUrl, surfaces, drawingTool, adjustMode,
  showPins = true, view, onMapPointPicked, onAdjust,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const onPickRef = useRef(onMapPointPicked);
  const onAdjustRef = useRef(onAdjust);
  // Always called (hooks can't be conditional), only used when `view` is missing.
  const ownView = useMapView(0.5);
  const { mode, opacity, orientation } = view ?? ownView;
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
    // Each lot with its status style, so the map paints it like the blueprint and the panorama.
    sceneRef.current?.setLots((polygons ?? []).map(p => ({ ring: p.geo_coordinates, style: getLotSvgStyle(p) })));
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

      {/* Own floating bar only while calibrating; in the Satellite view these
          controls are part of the main toolbar (one bar, nothing to overlap). */}
      {!view && (
        <div className="map-controls" aria-label="Controles del mapa">
          <MapControls view={ownView} hasBlueprint={!!homography} />
        </div>
      )}

      {loading && <div className="geo-map-loading">Cargando mapa…</div>}
      {error && <div className="geo-calibration-map__error">{error}</div>}
    </div>
  );
}
