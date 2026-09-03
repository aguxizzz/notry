import { X } from 'lucide-react';
import { ImageIcon } from 'lucide-react';
import BlueprintEditor from './BlueprintEditor';
import EditorViewer from './EditorViewer';
import CalibrationInspector from './CalibrationInspector';

// Full-screen calibration workspace: replaces the toolbar, lot list and
// inspector while activeTool === 'calibrate'. Only the active viewer (mode
// still drives blueprint vs. panorama, switched automatically by the click
// handler in App.jsx) and the step guide stay visible.
export default function CalibrationOverlay({
  mode,
  panoramaUrl,
  blueprintUrl,
  annotations,
  selectedId,
  onClick,
  onMarkerSelect,
  onPolygonUpdate,
  onMarkerDragEnd,
  onMarkerDrag,
  getPositionRef,
  onViewerReadyChange,
  onPanoramaDimensions,
  calibrationPoints,
  pendingBlueprintPoints,
  onCancelCalibration,
  onDeleteCalibrationPoint,
  onClearCalibration,
}) {
  return (
    <div className="calibration-overlay">
      <div className="calibration-overlay__topbar">
        <span className="calibration-overlay__eyebrow">Calibración de plano y panorama</span>
        <button type="button" className="editor-btn editor-btn--secondary" onClick={onCancelCalibration}>
          <X size={16} />
          Salir
        </button>
      </div>

      <div className="calibration-overlay__body">
        <main className="viewer-pane calibration-overlay__stage">
          <div className="viewer-surface">
            {mode === 'blueprint' && blueprintUrl ? (
              <BlueprintEditor
                blueprintUrl={blueprintUrl}
                activeTool="calibrate"
                annotations={annotations}
                selectedId={selectedId}
                onClick={onClick}
                onMarkerSelect={onMarkerSelect}
                onPolygonUpdate={onPolygonUpdate}
                onMarkerDragEnd={onMarkerDragEnd}
              />
            ) : mode === 'panorama' && panoramaUrl ? (
              <EditorViewer
                panoramaUrl={panoramaUrl}
                activeTool="calibrate"
                annotations={annotations}
                onClick={onClick}
                onMarkerSelect={onMarkerSelect}
                onPolygonUpdate={onPolygonUpdate}
                onMarkerDragEnd={onMarkerDragEnd}
                onMarkerDrag={onMarkerDrag}
                getPositionRef={getPositionRef}
                onViewerReadyChange={onViewerReadyChange}
                onPanoramaDimensions={onPanoramaDimensions}
              />
            ) : (
              <div className="viewer-feedback viewer-feedback--empty">
                <ImageIcon size={40} />
                <h2>Falta la imagen de este modo</h2>
                <p>Este loteo no tiene {mode === 'blueprint' ? 'plano' : 'panorama'} cargado.</p>
              </div>
            )}
          </div>
        </main>

        <aside className="calibration-overlay__guide">
          <CalibrationInspector
            calibrationPoints={calibrationPoints}
            pendingBlueprintPoints={pendingBlueprintPoints}
            mode={mode}
            onCancelCalibration={onCancelCalibration}
            onDeleteCalibrationPoint={onDeleteCalibrationPoint}
            onClearCalibration={onClearCalibration}
            embedded
          />
        </aside>
      </div>
    </div>
  );
}
