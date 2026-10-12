import { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map.js';
import MapView from '@arcgis/core/views/MapView.js';
import esriConfig from '@arcgis/core/config.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol.js';
import Search from '@arcgis/core/widgets/Search.js';
import '@arcgis/core/assets/esri/themes/light/main.css';

// Mismo free-tier de World Imagery que apps/visor/SatelliteViewer.jsx y
// apps/editor/GeoCalibrationMap.jsx: sin key funciona, pero puede pedir una
// si Esri lo empieza a exigir. Setear VITE_ARCGIS_API_KEY si eso pasa.
const ARCGIS_API_KEY = import.meta.env.VITE_ARCGIS_API_KEY || '';

// Fallback cuando el loteo todavía no tiene coordenadas: centro de
// Argentina, zoom bajo para que el buscador sea el punto de entrada real.
const DEFAULT_CENTER = [-64, -34];
const DEFAULT_ZOOM = 4;
const PICKED_ZOOM = 18;

/**
 * Mapa satelital con pin arrastrable para elegir latitud/longitud a mano
 * (reemplaza tipear los números a ciegas). Click o drag del pin reportan el
 * punto vía onChange({ latitude, longitude }). Incluye buscador de
 * direcciones para centrar rápido sin coordenadas previas.
 */
export default function LocationPickerMap({ latitude, longitude, onChange }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const markerLayerRef = useRef(null);
  const markerGraphicRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const hasPoint = latitude != null && latitude !== '' && longitude != null && longitude !== '';

  useEffect(() => {
    if (!containerRef.current) return;

    if (ARCGIS_API_KEY) esriConfig.apiKey = ARCGIS_API_KEY;

    const markerLayer = new GraphicsLayer();
    markerLayerRef.current = markerLayer;

    // 'hybrid' = misma imagen satelital que 'satellite' + capa de referencia
    // (fronteras de países/provincias, rutas, labels de ciudades) encima.
    const map = new Map({ basemap: 'hybrid', layers: [markerLayer] });

    const initialCenter = hasPoint
      ? [Number(longitude), Number(latitude)]
      : DEFAULT_CENTER;

    const view = new MapView({
      container: containerRef.current,
      map,
      center: initialCenter,
      zoom: hasPoint ? PICKED_ZOOM : DEFAULT_ZOOM,
    });
    viewRef.current = view;

    const search = new Search({ view, includeDefaultSources: true });
    view.ui.add(search, { position: 'top-right' });

    const placeMarker = (lat, lng) => {
      markerLayer.removeAll();
      const graphic = new Graphic({
        geometry: new Point({ latitude: lat, longitude: lng }),
        symbol: new SimpleMarkerSymbol({
          color: [197, 160, 89, 0.9],
          size: 16,
          outline: { color: [255, 255, 255, 1], width: 2 },
        }),
      });
      markerLayer.add(graphic);
      markerGraphicRef.current = graphic;
    };

    if (hasPoint) placeMarker(Number(latitude), Number(longitude));

    const reportPoint = (mapPoint) => {
      if (!mapPoint) return;
      placeMarker(mapPoint.latitude, mapPoint.longitude);
      onChangeRef.current?.({ latitude: mapPoint.latitude, longitude: mapPoint.longitude });
    };

    // Click en cualquier lado del mapa mueve el pin ahí. Para reubicar
    // alcanza con clickear de nuevo en otro punto (más simple y robusto que
    // soportar drag del marker, que en ArcGIS requiere hit-testing async
    // contra cada evento de drag y compite con el pan nativo del mapa).
    const clickHandle = view.on('click', (event) => {
      reportPoint(view.toMap(event));
    });

    const searchHandle = search.on('search-complete', (event) => {
      const result = event.results?.[0]?.results?.[0];
      const geometry = result?.extent?.center || result?.feature?.geometry;
      if (geometry) reportPoint(geometry);
    });

    let cancelled = false;
    view.when(
      () => {
        if (!cancelled) setError(null);
      },
      (err) => {
        if (cancelled) return;
        console.error('LocationPickerMap: error al inicializar ArcGIS MapView', err);
        setError('No se pudo cargar el mapa satelital.');
      }
    );

    return () => {
      cancelled = true;
      clickHandle.remove();
      searchHandle.remove();
      view.destroy();
      viewRef.current = null;
      markerLayerRef.current = null;
      markerGraphicRef.current = null;
    };
    // Solo se inicializa una vez: cambios posteriores de lat/lng vienen del
    // propio mapa (click/drag/search), no hace falta re-crear la vista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="location-picker-map">
      <div ref={containerRef} className="location-picker-map__canvas" />
      {error && <div className="location-picker-map__error">{error}</div>}
      {!hasPoint && !error && (
        <div className="location-picker-map__hint">
          Buscá una dirección o clickeá en el mapa para marcar el terreno
        </div>
      )}
    </div>
  );
}
