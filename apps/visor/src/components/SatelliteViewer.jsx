import { useEffect, useRef, useState } from 'react';
import EsriMap from '@arcgis/core/Map.js';
import SceneView from '@arcgis/core/views/SceneView.js';
import esriConfig from '@arcgis/core/config.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol.js';
import '@arcgis/core/assets/esri/themes/dark/main.css';

// A diferencia de blueprint/panorama (donde el borde SVG alcanza para el
// hit-test del mouse), en la SceneView 3D el hitTest necesita superficie:
// sin fill, clickear "adentro" del lote no pega contra el Graphic. Por eso
// acá todos los lotes llevan un fill gris parejo en reposo, con el mismo
// lenguaje de hover (brightness) que el resto de la app.
const POLY_VAR = {
  default: { fill: [160, 160, 160, 0.35], outline: [255, 255, 255, 0.9] },
  recommended: { fill: [197, 160, 89, 0.42], outline: [197, 160, 89, 0.95] },
  muted: { fill: [130, 130, 130, 0.25], outline: [255, 255, 255, 0.6] },
};

function getPolyVar(status) {
  return POLY_VAR[status] || POLY_VAR.default;
}

// Free tier: World Imagery + World Elevation no requieren API key para uso
// básico, pero Esri viene exigiéndola cada vez más seguido para algunos
// basemaps. Si aparece bloqueada la carga, conseguir una key gratuita en
// https://developers.arcgis.com y setear VITE_ARCGIS_API_KEY.
const ARCGIS_API_KEY = import.meta.env.VITE_ARCGIS_API_KEY || '';

/**
 * Vista satelital 3D interactiva (terreno real + textura satelital de Esri
 * World Imagery), navegable con mouse: drag = pan, scroll = zoom,
 * ctrl+drag/drag secundario = rotar/inclinar cámara. Dibuja los polígonos
 * de lote (`annotations` con `geo_coordinates`) pegados al terreno real.
 */
export default function SatelliteViewer({ latitude, longitude, annotations, onMarkerSelect }) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  onMarkerSelectRef.current = onMarkerSelect;

  useEffect(() => {
    if (latitude == null || longitude == null || !containerRef.current) return;

    setError(null);
    if (ARCGIS_API_KEY) esriConfig.apiKey = ARCGIS_API_KEY;

    const graphicsLayer = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } });

    // annId -> Graphic, para resolver el highlight de hover por id.
    const graphicsById = new Map();

    (annotations || [])
      .filter((ann) => ann.type === 'polygon' && ann.geo_coordinates?.length >= 3)
      .forEach((ann) => {
        const polyVar = getPolyVar(ann.status || ann.estado);
        const geometry = new Polygon({
          rings: [ann.geo_coordinates.map(([lat, lng]) => [lng, lat])],
          spatialReference: { wkid: 4326 },
        });
        const graphic = new Graphic({
          geometry,
          attributes: { annId: ann.uuid ?? ann.id },
          symbol: new SimpleFillSymbol({
            color: polyVar.fill,
            outline: { color: polyVar.outline, width: 2 },
          }),
        });
        graphicsById.set(graphic.attributes.annId, graphic);
        graphicsLayer.add(graphic);
      });

    const map = new EsriMap({
      basemap: 'satellite',
      ground: 'world-elevation',
      layers: [graphicsLayer],
    });

    const view = new SceneView({
      container: containerRef.current,
      map,
      camera: {
        position: { latitude, longitude, z: 350 },
        tilt: 60,
      },
      popupEnabled: false,
      // El "brightness" del hover se resuelve con el highlight nativo de
      // ArcGIS (ver layerView.highlight más abajo): mutar graphic.symbol a
      // mano no siempre repinta de forma confiable un polígono "draped"
      // sobre terreno (elevationInfo on-the-ground) en la SceneView 3D.
      highlightOptions: {
        color: [255, 255, 255],
        fillOpacity: 0.5,
        haloOpacity: 1,
      },
    });

    // ArcGIS setea cursor "grab"/"default" inline sobre su propio canvas para
    // feedback de navegación; !important es la única forma de que nuestro
    // cursor de hover no quede pisado por esa asignación interna.
    const setCursor = (cursor) => {
      view.container.style.cursor = cursor;
      const surface = view.container.querySelector('canvas');
      if (surface) surface.style.setProperty('cursor', cursor, 'important');
    };

    const clickHandle = view.on('click', (event) => {
      view.hitTest(event, { include: graphicsLayer }).then((response) => {
        const hit = response.results.find((r) => r.graphic?.attributes?.annId != null);
        if (!hit) return;
        const ann = (annotations || []).find((a) => (a.uuid ?? a.id) === hit.graphic.attributes.annId);
        if (ann) onMarkerSelectRef.current?.(ann);
      });
    });

    let layerView = null;
    let highlightHandle = null;
    let hoveredId = null;
    const setHovered = (id) => {
      if (id === hoveredId) return;
      hoveredId = id;
      if (highlightHandle) {
        highlightHandle.remove();
        highlightHandle = null;
      }
      if (id != null && layerView) {
        const graphic = graphicsById.get(id);
        if (graphic) highlightHandle = layerView.highlight(graphic);
      }
      setCursor(id != null ? 'pointer' : 'default');
    };

    view.whenLayerView(graphicsLayer).then((lv) => {
      layerView = lv;
    });

    const hoverHandle = view.on('pointer-move', (event) => {
      view.hitTest(event, { include: graphicsLayer }).then((response) => {
        const hit = response.results.find((r) => r.graphic?.attributes?.annId != null);
        setHovered(hit ? hit.graphic.attributes.annId : null);
      });
    });

    let cancelled = false;
    view.when(
      () => {},
      (err) => {
        if (cancelled) return;
        console.error('SatelliteViewer: error al inicializar ArcGIS SceneView', err);
        setError('No se pudo cargar la vista satelital.');
      }
    );

    return () => {
      cancelled = true;
      if (highlightHandle) highlightHandle.remove();
      clickHandle.remove();
      hoverHandle.remove();
      view.destroy();
      graphicsLayer.destroy();
    };
  }, [latitude, longitude, annotations]);

  if (latitude == null || longitude == null) return null;

  return (
    <div className="satellite-viewer">
      <div ref={containerRef} className="satellite-viewer__canvas" />
      {error && <div className="satellite-viewer__error">{error}</div>}
    </div>
  );
}
