// 3D map of the loteo for the visor's 'satellite' and 'render' modes. Thin
// React wrapper around map3d/mapScene.js: it builds the scene once per stage
// and forwards mode, selected lot and panel insets to it.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { createMapScene } from '../map3d/mapScene.js';
import { getLotPanelInsets, subscribePanelCollapsed } from '../hooks/usePanelLayout.js';
import './MapViewer.css';

// Credits per mode, required on screen by Esri's terms and OSM's license (ODbL).
const ATTRIBUTION = {
  satellite: <>Imágenes © Esri, Maxar, Earthstar Geographics</>,
  render: (
    <>
      <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
      {' · © '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
    </>
  ),
};
// Buildings, in both modes: Overture's data is ODbL and mixes Google Open
// Buildings (CC BY 4.0), Microsoft and OSM footprints.
const BUILDINGS_ATTRIBUTION = (
  <>
    {' · Edificios: '}
    <a href="https://overturemaps.org" target="_blank" rel="noopener noreferrer">Overture Maps</a>
    {' (Google, Microsoft, OSM)'}
  </>
);

// Low-end device (devicePerf.js, forced with ?lite=1): same class the
// panorama uses to go easy on the phone.
const isLiteDevice = () => document.documentElement.classList.contains('perf-lite');

/**
 * `variant` is 'satellite' or 'render'; `selectedId`
 * is the lot with its ficha open (from useLotSelection), the map flies to it.
 * `usePanel` comes from usePanelLayout and only triggers a new reading of how
 * much of the screen the panel covers (collapsing it is subscribed to
 * directly, it isn't React state). `ref` exposes the
 * camera buttons: zoomIn, zoomOut and goToView('overview' | 'top').
 * `pois` are all the stage's POI annotations, `selectedPoiId` the one the map
 * points at and `onPoiSelect(ann)` a tap on one (falls back to onMarkerSelect);
 * `northOffset`/`panoramaWidth` place the ones outside the loteo.
 * `buildingsUrl` is the stage's GeoJSON of buildings around, null if none.
 */
export default function MapViewer({
  latitude, longitude, annotations, loteLabels, geoSurfaces, geoCalibrationPoints,
  variant = 'satellite', selectedId, onMarkerSelect, usePanel, ref,
  pois, northOffset, panoramaWidth, selectedPoiId, onPoiSelect, buildingsUrl = null,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);

  // Read sceneRef at call time: the scene is rebuilt on every stage change.
  useImperativeHandle(ref, () => ({
    zoomIn: () => sceneRef.current?.zoomIn(),
    zoomOut: () => sceneRef.current?.zoomOut(),
    goToView: (name) => sceneRef.current?.goToView(name),
  }), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The scene is built in one effect and fed from the others; these refs let
  // a freshly built scene pick up the current values right away. Synced in a
  // layout effect, which runs before every regular effect of the same commit.
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const onPoiSelectRef = useRef(onPoiSelect);
  const variantRef = useRef(variant);
  const selectedIdRef = useRef(selectedId);
  const selectedPoiIdRef = useRef(selectedPoiId);
  useLayoutEffect(() => {
    onMarkerSelectRef.current = onMarkerSelect;
    onPoiSelectRef.current = onPoiSelect;
    variantRef.current = variant;
    selectedIdRef.current = selectedId;
    selectedPoiIdRef.current = selectedPoiId;
  });

  // What the panel covers. On phones the bottom sheet only exists with a lot
  // open, so it only counts then.
  const readInsets = () => {
    const insets = getLotPanelInsets();
    return {
      top: insets.top || 0,
      bottom: selectedIdRef.current != null ? insets.bottom || 0 : 0,
      left: insets.left || 0,
    };
  };

  useEffect(() => {
    if (latitude == null || longitude == null || !containerRef.current) return undefined;
    let scene;
    try {
      scene = createMapScene({
        container: containerRef.current,
        latitude,
        longitude,
        annotations,
        loteLabels,
        geoSurfaces,
        geoCalibrationPoints,
        lite: isLiteDevice(),
        initialInsets: readInsets(),
        onLotClick: (ann) => onMarkerSelectRef.current?.(ann),
        // POIs (preview, see map3d/poiLayer.js). ?poisdemo=1 adds two
        // made-up places inside the loteo, for loteos that have none.
        pois,
        northOffset,
        panoramaWidth,
        demoPois: new URLSearchParams(window.location.search).has('poisdemo'),
        buildingsUrl,
        onPoiClick: (ann) => (onPoiSelectRef.current ?? onMarkerSelectRef.current)?.(ann),
        onLoadingChange: setLoading,
        onError: (err) => {
          console.error('MapViewer: no se pudo armar el mapa', err);
          setError('No se pudo cargar el mapa.');
        },
      });
    } catch (err) {
      // WebGL unavailable (very old phone, disabled GPU) lands here.
      console.error('MapViewer: no se pudo iniciar WebGL', err);
      setError('Este dispositivo no puede mostrar el mapa 3D.');
      return undefined;
    }
    sceneRef.current = scene;
    scene.setInsets(readInsets());
    scene.setSelected(selectedIdRef.current);
    scene.setSelectedPoi(selectedPoiIdRef.current);
    scene.setMode(variantRef.current);
    return () => {
      sceneRef.current = null;
      scene.dispose();
      // The next stage starts clean (cleared here, not in the effect body,
      // to avoid an extra render pass).
      setError(null);
      setLoading(true);
    };
  }, [latitude, longitude, annotations, loteLabels, geoSurfaces, geoCalibrationPoints, pois, northOffset, panoramaWidth, buildingsUrl]);

  useEffect(() => {
    sceneRef.current?.setMode(variant);
  }, [variant]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    sceneRef.current?.setSelectedPoi(selectedPoiId ?? null);
  }, [selectedPoiId]);

  // The panel opens, collapses or switches to the phone layout: the free area
  // changes. Window resizes too (the panel width doesn't, but the sheet does).
  useEffect(() => {
    const update = () => sceneRef.current?.setInsets(readInsets());
    update();
    window.addEventListener('resize', update);
    const unsubscribe = subscribePanelCollapsed(update);
    return () => {
      window.removeEventListener('resize', update);
      unsubscribe();
    };
  }, [selectedId, usePanel]);

  if (latitude == null || longitude == null) return null;

  return (
    <div className="map-viewer">
      <div ref={containerRef} className="map-viewer__canvas" />
      {loading && !error && <div className="map-viewer__loading">Cargando mapa…</div>}
      {error && <div className="map-viewer__error">{error}</div>}
      <div className="map-viewer__attrib">
        {ATTRIBUTION[variant] ?? ATTRIBUTION.satellite}
        {buildingsUrl && BUILDINGS_ATTRIBUTION}
      </div>
    </div>
  );
}
