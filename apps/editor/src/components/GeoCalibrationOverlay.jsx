import { Suspense, lazy, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import BlueprintEditor from './BlueprintEditor';
import CalibrationInspector from './CalibrationInspector';
import { geoHomography } from '../utils/geoCalibration';

// Lazy: the Three.js map and its tile code only load when they're on screen.
const GeoCalibrationMap = lazy(() => import('./GeoCalibrationMap'));

const TOOLS = [
  { id: 'points', label: 'Puntos' },
  { id: 'adjust', label: 'Ajustar' },
];

const HINTS = {
  points: 'Clic en el plano y después en el mapa para sumar un par',
  adjust: 'Arrastrá el plano para moverlo · una esquina para agrandarlo y girarlo · un pin para afinar esa zona',
};

// Full-screen "link the blueprint to the map" step of the Satellite view,
// opened from its Calibrar button (same role as CalibrationOverlay for the
// panorama). Two tools: 'points' shows blueprint and map side by side to add
// pairs; 'adjust' works on the map alone, moving/scaling/rotating the
// blueprint over it (`onAdjust` is useGeoCalibration.adjust). Drawing
// manzanas/calles lives in the Satellite view itself, not here.
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
  surfaces,
  onAdjust,
  onCancelCalibration,
  onDeleteCalibrationPoint,
  onClearCalibration,
  onUpdateGeoPolygons,
}) {
  // Already linked → straight to Ajustar on the map; otherwise pairs first.
  // Adjust needs a valid homography, so losing it (deleting pairs) falls back to points.
  const [toolState, setTool] = useState(() => (geoHomography(geoCalibrationPoints) ? 'adjust' : 'points'));
  const canAdjust = !!geoHomography(geoCalibrationPoints);
  const tool = canAdjust ? toolState : 'points';

  // Manzanas/calles shown read-only, so the fit can be checked against them too.
  const mapSurfaces = useMemo(() => ({ shapes: surfaces.geoRings, drawing: [] }), [surfaces.geoRings]);

  return (
    <div className="calibration-overlay">
      <div className="calibration-overlay__topbar">
        <span className="calibration-overlay__eyebrow">Vincular plano con el mapa</span>
        <div className="geo-draw-toolbar">
          <div className="geo-map-toolbar__modes" role="group" aria-label="Herramienta">
            {TOOLS.map(t => (
              <button
                key={t.id}
                type="button"
                className={`geo-map-toolbar__mode${tool === t.id ? ' is-active' : ''}`}
                aria-pressed={tool === t.id}
                disabled={t.id === 'adjust' && !canAdjust}
                title={t.id === 'adjust' && !canAdjust ? 'Primero calibrá con 4 puntos' : undefined}
                onClick={() => setTool(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="geo-draw-toolbar__hint">{HINTS[tool]}</span>
        </div>
        <button type="button" className="editor-btn editor-btn--secondary" onClick={onCancelCalibration}>
          <X size={16} />
          Listo
        </button>
      </div>

      <div className="calibration-overlay__body">
        {/* Keyed: hiding the blueprint pane must not make React reuse its
            <main> for the map, which would rebuild the whole 3D scene. */}
        {tool === 'points' && (
        <main key="blueprint" className="viewer-pane calibration-overlay__stage">
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
        )}

        <main key="map" className="viewer-pane calibration-overlay__stage">
          <div className="viewer-surface">
            <Suspense fallback={<div className="viewer-feedback">Cargando mapa satelital…</div>}>
              <GeoCalibrationMap
                latitude={latitude}
                longitude={longitude}
                points={geoCalibrationPoints}
                polygons={geoPolygons}
                blueprintUrl={blueprintUrl}
                surfaces={mapSurfaces}
                adjustMode={tool === 'adjust'}
                onMapPointPicked={onMapPointPicked}
                onAdjust={onAdjust}
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
