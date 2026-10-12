import { Suspense, lazy } from 'react';
import { X } from 'lucide-react';
import BlueprintEditor from './BlueprintEditor';
import CalibrationInspector from './CalibrationInspector';

// Lazy: @arcgis/core is heavy, keep it out of the main bundle chunk (same
// criterion as apps/visor's SatelliteViewer).
const GeoCalibrationMap = lazy(() => import('./GeoCalibrationMap'));

// Full-screen geo-calibration workspace, parallel to CalibrationOverlay's
// blueprint↔panorama flow. Unlike that one, the blueprint and the satellite
// map are shown side by side (no view-switching needed — clicking either
// pane is independent, the map isn't a spherical viewer that needs full
// screen real estate the way the panorama does).
export default function GeoCalibrationOverlay({
  blueprintUrl,
  annotations,
  onBlueprintClick,
  latitude,
  longitude,
  geoCalibrationPoints,
  pendingGeoBlueprintPoint,
  onMapPointPicked,
  geoPolygons,
  onCancelCalibration,
  onDeleteCalibrationPoint,
  onClearCalibration,
  onUpdateGeoPolygons,
}) {
  return (
    <div className="calibration-overlay">
      <div className="calibration-overlay__topbar">
        <span className="calibration-overlay__eyebrow">Calibración geográfica (satelital)</span>
        <button type="button" className="editor-btn editor-btn--secondary" onClick={onCancelCalibration}>
          <X size={16} />
          Salir
        </button>
      </div>

      <div className="calibration-overlay__body">
        <main className="viewer-pane calibration-overlay__stage">
          <div className="viewer-surface">
            {blueprintUrl ? (
              <BlueprintEditor
                blueprintUrl={blueprintUrl}
                activeTool="calibrate-geo"
                annotations={annotations}
                selectedId={null}
                onClick={onBlueprintClick}
                onMarkerSelect={() => {}}
                onPolygonUpdate={() => {}}
                onMarkerDragEnd={() => {}}
              />
            ) : (
              <div className="viewer-feedback viewer-feedback--empty">
                <p>Este loteo no tiene plano.</p>
              </div>
            )}
          </div>
        </main>

        <main className="viewer-pane calibration-overlay__stage">
          <div className="viewer-surface">
            <Suspense fallback={<div className="viewer-feedback">Cargando mapa satelital…</div>}>
              <GeoCalibrationMap
                latitude={latitude}
                longitude={longitude}
                points={geoCalibrationPoints}
                polygons={geoPolygons}
                onMapPointPicked={onMapPointPicked}
              />
            </Suspense>
          </div>
        </main>

        <aside className="calibration-overlay__guide">
          <CalibrationInspector
            mode="geo"
            geoCalibrationPoints={geoCalibrationPoints}
            pendingGeoBlueprintPoint={pendingGeoBlueprintPoint}
            onCancelCalibration={onCancelCalibration}
            onDeleteCalibrationPoint={onDeleteCalibrationPoint}
            onClearCalibration={onClearCalibration}
            onUpdateGeoPolygons={onUpdateGeoPolygons}
            embedded
          />
        </aside>
      </div>
    </div>
  );
}
