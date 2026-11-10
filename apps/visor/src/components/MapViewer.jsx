// 3D map of the loteo for the visor's 'satellite' and 'render' modes. Thin
// React wrapper around map3d/mapScene.js: it builds the scene once per stage
// and forwards mode, selected lot and panel insets to it.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createMapScene } from '../map3d/mapScene.js';
import { getLotPanelInsets } from '../hooks/usePanelLayout.js';
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

// Low-end device (devicePerf.js, forced with ?lite=1): same class the
// panorama uses to go easy on the phone.
const isLiteDevice = () => document.documentElement.classList.contains('perf-lite');

/**
 * Same props as the old ArcGIS SatelliteViewer, so ViewerExperience only
 * swapped the component. `variant` is 'satellite' or 'render'; `selectedId`
 * is the lot with its ficha open (from useLotSelection), the map flies to it.
 * `usePanel`/`panelCollapsed` come from usePanelLayout and only trigger a
 * new reading of how much of the screen the panel covers.
 */
export default function MapViewer({
  latitude, longitude, annotations, loteLabels, variant = 'satellite', selectedId, onMarkerSelect,
  usePanel, panelCollapsed,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The scene is built in one effect and fed from the others; these refs let
  // a freshly built scene pick up the current values right away. Synced in a
  // layout effect, which runs before every regular effect of the same commit.
  const onMarkerSelectRef = useRef(onMarkerSelect);
  const variantRef = useRef(variant);
  const selectedIdRef = useRef(selectedId);
  useLayoutEffect(() => {
    onMarkerSelectRef.current = onMarkerSelect;
    variantRef.current = variant;
    selectedIdRef.current = selectedId;
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
        lite: isLiteDevice(),
        onLotClick: (ann) => onMarkerSelectRef.current?.(ann),
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
    scene.setMode(variantRef.current);
    return () => {
      sceneRef.current = null;
      scene.dispose();
      // The next stage starts clean (cleared here, not in the effect body,
      // to avoid an extra render pass).
      setError(null);
      setLoading(true);
    };
  }, [latitude, longitude, annotations, loteLabels]);

  useEffect(() => {
    sceneRef.current?.setMode(variant);
  }, [variant]);

  useEffect(() => {
    sceneRef.current?.setSelected(selectedId);
  }, [selectedId]);

  // The panel opens, collapses or switches to the phone layout: the free area
  // changes. Window resizes too (the panel width doesn't, but the sheet does).
  useEffect(() => {
    const update = () => sceneRef.current?.setInsets(readInsets());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [selectedId, panelCollapsed, usePanel]);

  if (latitude == null || longitude == null) return null;

  return (
    <div className="map-viewer">
      <div ref={containerRef} className="map-viewer__canvas" />
      {loading && !error && <div className="map-viewer__loading">Cargando mapa…</div>}
      {error && <div className="map-viewer__error">{error}</div>}
      <div className="map-viewer__attrib">{ATTRIBUTION[variant] ?? ATTRIBUTION.satellite}</div>
    </div>
  );
}
