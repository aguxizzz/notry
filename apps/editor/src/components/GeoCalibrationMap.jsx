import { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map.js';
import MapView from '@arcgis/core/views/MapView.js';
import esriConfig from '@arcgis/core/config.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Point from '@arcgis/core/geometry/Point.js';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol.js';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol.js';
import '@arcgis/core/assets/esri/themes/dark/main.css';

// Same free-tier caveat as apps/visor/src/components/SatelliteViewer.jsx —
// set VITE_ARCGIS_API_KEY if World Imagery ever gets gated for this app.
const ARCGIS_API_KEY = import.meta.env.VITE_ARCGIS_API_KEY || '';

/**
 * 2D satellite mini-map used to calibrate blueprint↔lat/lng correspondences.
 * Click anywhere on the map to report the picked point via onMapPointPicked;
 * draws the already-calibrated points and, once baked, the resulting lot
 * polygons (geo_coordinates) for visual confirmation.
 */
export default function GeoCalibrationMap({ latitude, longitude, points, polygons, onMapPointPicked }) {
  const containerRef = useRef(null);
  const pointsLayerRef = useRef(null);
  const polygonsLayerRef = useRef(null);
  const onMapPointPickedRef = useRef(onMapPointPicked);
  const [error, setError] = useState(null);

  useEffect(() => {
    onMapPointPickedRef.current = onMapPointPicked;
  }, [onMapPointPicked]);

  useEffect(() => {
    if (latitude == null || longitude == null || !containerRef.current) return;

    if (ARCGIS_API_KEY) esriConfig.apiKey = ARCGIS_API_KEY;

    const pointsLayer = new GraphicsLayer();
    const polygonsLayer = new GraphicsLayer();
    pointsLayerRef.current = pointsLayer;
    polygonsLayerRef.current = polygonsLayer;

    const map = new Map({ basemap: 'satellite', layers: [polygonsLayer, pointsLayer] });

    const view = new MapView({
      container: containerRef.current,
      map,
      center: [longitude, latitude],
      zoom: 19,
    });

    const clickHandle = view.on('click', (event) => {
      const mapPoint = view.toMap(event);
      if (!mapPoint) return;
      onMapPointPickedRef.current?.({ latitude: mapPoint.latitude, longitude: mapPoint.longitude });
    });

    let cancelled = false;
    view.when(
      () => {
        if (!cancelled) setError(null);
      },
      (err) => {
        if (cancelled) return;
        console.error('GeoCalibrationMap: error al inicializar ArcGIS MapView', err);
        setError('No se pudo cargar el mini-mapa satelital.');
      }
    );

    return () => {
      cancelled = true;
      clickHandle.remove();
      view.destroy();
      pointsLayerRef.current = null;
      polygonsLayerRef.current = null;
    };
  }, [latitude, longitude]);

  useEffect(() => {
    const layer = pointsLayerRef.current;
    if (!layer) return;
    layer.removeAll();
    (points ?? []).forEach((pair) => {
      if (!pair.geo) return;
      const [lat, lng] = pair.geo;
      layer.add(new Graphic({
        geometry: new Point({ latitude: lat, longitude: lng }),
        symbol: new SimpleMarkerSymbol({
          color: [245, 158, 11, 0.9],
          size: 14,
          outline: { color: [255, 255, 255, 1], width: 2 },
        }),
      }));
    });
  }, [points]);

  useEffect(() => {
    const layer = polygonsLayerRef.current;
    if (!layer) return;
    layer.removeAll();
    (polygons ?? []).forEach((polygon) => {
      if (!polygon.geo_coordinates || polygon.geo_coordinates.length < 3) return;
      layer.add(new Graphic({
        geometry: new Polygon({
          rings: [polygon.geo_coordinates.map(([lat, lng]) => [lng, lat])],
          spatialReference: { wkid: 4326 },
        }),
        symbol: new SimpleFillSymbol({
          color: [34, 211, 238, 0.2],
          outline: { color: [34, 211, 238, 0.9], width: 2 },
        }),
      }));
    });
  }, [polygons]);

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
      {error && <div className="geo-calibration-map__error">{error}</div>}
    </div>
  );
}
