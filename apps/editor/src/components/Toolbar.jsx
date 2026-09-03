import {
  Camera,
  Crosshair,
  Grid3x3,
  MapPin,
  MousePointer2,
  Pentagon,
  Redo2,
  Square,
  Type,
  Undo2,
} from 'lucide-react';

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'V' },
  { id: 'polygon', icon: Pentagon, label: 'Lote', shortcut: '1' },
  { id: 'poi', icon: MapPin, label: 'Lugar', shortcut: '2' },
  { id: 'text', icon: Type, label: 'Texto', shortcut: '3' },
  // Solo tiene sentido dibujarlo en el plano — en el panorama esférico un
  // "rectángulo" se deforma igual que cualquier otro polígono.
  { id: 'rect', icon: Square, label: 'Rectángulo', shortcut: '2' },
];

export default function Toolbar({
  activeTool,
  onToolChange,
  mode,
  onModeChange,
  panoramaUrl,
  blueprintUrl,
  drawingPolygon,
  onFinishPolygon,
  onCancelPolygon,
  rectStart,
  onCancelRect,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  calibrationPoints,
}) {
  return (
    <>
      <div className="toolbar" aria-label="Herramientas del editor">
        <div className="view-switcher" aria-label="Vista del editor">
          <button
            type="button"
            className={mode === 'panorama' ? 'is-active' : ''}
            onClick={() => onModeChange('panorama')}
            disabled={!panoramaUrl}
            aria-pressed={mode === 'panorama'}
          >
            <Camera size={16} />
            <span>Panorama</span>
          </button>
          <button
            type="button"
            className={mode === 'blueprint' ? 'is-active' : ''}
            onClick={() => onModeChange('blueprint')}
            disabled={!blueprintUrl}
            aria-pressed={mode === 'blueprint'}
          >
            <Grid3x3 size={16} />
            <span>Plano</span>
          </button>
        </div>

        <span className="toolbar-divider" aria-hidden="true" />

        <div className="toolbar-tools" aria-label="Herramientas de edición">
          {TOOLS.filter(tool => tool.id === 'rect'
            ? mode === 'blueprint'
            : mode !== 'blueprint' || (tool.id !== 'poi' && tool.id !== 'text')
          ).map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                className={`tool-btn${activeTool === tool.id ? ' active' : ''}`}
                onClick={() => onToolChange(tool.id)}
                title={`${tool.label} (${tool.shortcut})`}
                aria-label={`${tool.label}. Atajo ${tool.shortcut}`}
                aria-pressed={activeTool === tool.id}
                disabled={!panoramaUrl && !blueprintUrl}
              >
                <Icon size={18} />
                <span>{tool.label}</span>
                <kbd>{tool.shortcut}</kbd>
              </button>
            );
          })}
        </div>

        {blueprintUrl && panoramaUrl && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className={`calibration-mode-btn${activeTool === 'calibrate' ? ' active' : ''}`}
              onClick={() => onToolChange('calibrate')}
              aria-pressed={activeTool === 'calibrate'}
              title="Calibrar correspondencia entre plano y panorama"
            >
              <Crosshair size={17} />
              <span>Calibrar</span>
              {calibrationPoints?.length > 0 && (
                <small className={calibrationPoints.length >= 4 ? 'is-ready' : ''}>
                  {calibrationPoints.length}
                </small>
              )}
            </button>
          </>
        )}

        <span className="toolbar-divider" aria-hidden="true" />

        <div className="history-controls" aria-label="Historial">
          <button type="button" className="editor-icon-btn" onClick={onUndo} disabled={!canUndo} title="Deshacer (Ctrl+Z)" aria-label="Deshacer">
            <Undo2 size={17} />
          </button>
          <button type="button" className="editor-icon-btn" onClick={onRedo} disabled={!canRedo} title="Rehacer (Ctrl+Y)" aria-label="Rehacer">
            <Redo2 size={17} />
          </button>
        </div>
      </div>

      {activeTool === 'polygon' && drawingPolygon.length > 0 && (
        <div className="drawing-actions" role="status">
          <span>{drawingPolygon.length} punto{drawingPolygon.length === 1 ? '' : 's'}</span>
          <button type="button" className="editor-btn editor-btn--primary" onClick={onFinishPolygon} disabled={drawingPolygon.length < 3}>
            Finalizar lote
          </button>
          <button type="button" className="editor-btn editor-btn--secondary" onClick={onCancelPolygon}>
            Cancelar
          </button>
        </div>
      )}

      {activeTool === 'rect' && rectStart && (
        <div className="drawing-actions" role="status">
          <span>Click en la esquina opuesta</span>
          <button type="button" className="editor-btn editor-btn--secondary" onClick={onCancelRect}>
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}
