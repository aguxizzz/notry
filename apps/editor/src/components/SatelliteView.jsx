// Satellite view of the editor, alongside Plano and Panorama: the lots (and the
// manzanas/calles drawn here) over the real map, through the plano↔geo
// calibration. Linking the plano to the map happens in GeoCalibrationOverlay;
// this view only asks for it when there's no valid calibration yet.
import { Suspense, lazy, useMemo } from 'react';
import { Link2, MapPinOff } from 'lucide-react';

// Lazy: the Three.js map and its tile code only load when this view opens.
const GeoCalibrationMap = lazy(() => import('./GeoCalibrationMap'));

/**
 * `geo` is useGeoCalibration (pairs + live-projected lots), `surfaces` is
 * useGeoSurfaces (drawing tool and shapes). `onLink` opens the calibration.
 */
export default function SatelliteView({ latitude, longitude, blueprintUrl, geo, surfaces, onLink }) {
  const { tool, canDraw, geoRings, geoDrawing, selected } = surfaces;
  const mapSurfaces = useMemo(() => ({
    shapes: geoRings.map(s => ({ ...s, selected: selected?.id === s.id })),
    drawing: geoDrawing,
  }), [geoRings, geoDrawing, selected]);

  // Without a center there's no map to show at all; the pin still comes from the CRM.
  if (latitude == null || longitude == null) {
    return (
      <div className="viewer-feedback viewer-feedback--empty">
        <MapPinOff size={40} />
        <h2>Este loteo no tiene ubicación</h2>
        <p>Cargá la latitud y longitud desde la ficha del loteo en el CRM.</p>
      </div>
    );
  }

  // Not linked yet: nothing of the plano can be placed on the map, so the
  // only thing to do here is go link it.
  if (!canDraw) {
    return (
      <div className="viewer-feedback viewer-feedback--empty">
        <Link2 size={40} />
        <h2>Falta vincular el plano con el mapa</h2>
        <p>Marcá 4 puntos que coincidan entre el plano y el satélite. Después se ajusta arrastrando el plano sobre el mapa.</p>
        <button type="button" className="editor-btn editor-btn--primary" onClick={onLink} disabled={!blueprintUrl}>
          Vincular con el plano
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="viewer-feedback">Cargando mapa satelital…</div>}>
      <GeoCalibrationMap
        latitude={latitude}
        longitude={longitude}
        points={geo.points}
        showPins={false}
        initialOpacity={0}
        polygons={geo.polygons}
        blueprintUrl={blueprintUrl}
        surfaces={mapSurfaces}
        drawingTool={tool === 'manzana' || tool === 'calle'}
        onMapPointPicked={surfaces.handleMapPoint}
      />
    </Suspense>
  );
}
