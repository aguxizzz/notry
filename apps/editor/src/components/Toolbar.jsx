import {
  Camera,
  Crosshair,
  Grid3x3,
  Layers,
  MapPin,
  MousePointer2,
  PenLine,
  Pentagon,
  Redo2,
  Route,
  Square,
  Type,
  Undo2,
  Wand2,
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

const RENDER_LAYERS = [
  { key: 'lotes', label: 'Lotes' },
  { key: 'manzanas', label: 'Manzanas' },
  { key: 'calles', label: 'Calles' },
];

// Reemplaza el slider libre (10-300) por 10 opciones discretas.
// Mínimo: -20% del mínimo anterior (10 -> 8). Máximo: 75% del máximo anterior (300 -> 225).
const STREET_WIDTH_MIN = 8;
const STREET_WIDTH_MAX = 225;
const STREET_WIDTH_OPTIONS = Array.from({ length: 10 }, (_, i) =>
  Math.round(STREET_WIDTH_MIN + ((STREET_WIDTH_MAX - STREET_WIDTH_MIN) * i) / 9)
);

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
  renderTestMode,
  onRenderTestModeChange,
  renderDrawingPtsCount = 0,
  onFinishRenderShape,
  onCancelRenderDrawing,
  renderLayersVisible,
  onToggleRenderLayer,
  renderColorMode,
  onRenderColorModeChange,
  renderManzanaOpacity = 1,
  onRenderManzanaOpacityChange,
  hasRenderShapes,
  onClearRenderShapes,
  renderStreetWidth = 60,
  onRenderStreetWidthChange,
  renderStreetEditMode,
  onToggleRenderStreetEditMode,
  renderStreetEditTarget,
  hasStreetPathShapes,
  streetEditWidth = 60,
  onStreetEditWidthChange,
}) {
  const isRenderMode = mode === 'render';

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
          <button
            type="button"
            className={isRenderMode ? 'is-active' : ''}
            onClick={() => onModeChange('render')}
            disabled={!panoramaUrl}
            aria-pressed={isRenderMode}
          >
            <Layers size={16} />
            <span>Render</span>
          </button>
        </div>

        <span className="toolbar-divider" aria-hidden="true" />

        {isRenderMode ? (
          <div className="toolbar-tools" aria-label="Herramientas de render">
            <button
              type="button"
              className={`tool-btn${renderTestMode === 'manzana' ? ' active' : ''}`}
              onClick={() => onRenderTestModeChange(renderTestMode === 'manzana' ? null : 'manzana')}
              title="Dibujar manzana (1)"
              aria-label="Dibujar manzana. Atajo 1"
            >
              <Pentagon size={18} />
              <span>Manzana</span>
              <kbd>1</kbd>
            </button>
            <button
              type="button"
              className={`tool-btn${renderTestMode === 'calle' ? ' active' : ''}`}
              onClick={() => onRenderTestModeChange(renderTestMode === 'calle' ? null : 'calle')}
              title="Dibujar calle: trazá el eje central, el contorno se genera con ancho constante (2)"
              aria-label="Dibujar calle. Atajo 2"
            >
              <Square size={18} />
              <span>Calle</span>
              <kbd>2</kbd>
            </button>
            {renderTestMode === 'calle' && (
              <label className="render-opacity-control" title="Ancho de la calle (px de textura): se traza por su eje central, la Ruta">
                <Route size={16} />
                <span>Ancho</span>
                <select
                  value={renderStreetWidth}
                  onChange={(e) => onRenderStreetWidthChange(Number(e.target.value))}
                >
                  {STREET_WIDTH_OPTIONS.map(w => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              className={`tool-btn${renderStreetEditMode ? ' active' : ''}`}
              onClick={onToggleRenderStreetEditMode}
              disabled={!hasStreetPathShapes}
              title="Editar ruta: clickeá una calle para mover, agregar o quitar puntos de su eje (3)"
              aria-label="Editar ruta. Atajo 3"
            >
              <PenLine size={18} />
              <span>Editar ruta</span>
              <kbd>3</kbd>
            </button>
            {renderStreetEditMode && renderStreetEditTarget && (
              <label className="render-opacity-control" title="Ancho de la calle seleccionada (px de textura)">
                <span>Ancho</span>
                <input
                  type="range"
                  min="10"
                  max="300"
                  step="5"
                  value={streetEditWidth}
                  onChange={(e) => onStreetEditWidthChange(Number(e.target.value))}
                />
              </label>
            )}

            <span className="toolbar-divider" aria-hidden="true" />

            <div className="render-layers" aria-label="Capas visibles">
              {RENDER_LAYERS.map(layer => (
                <label key={layer.key} className="render-layer-toggle">
                  <input
                    type="checkbox"
                    checked={renderLayersVisible?.[layer.key] ?? true}
                    onChange={() => onToggleRenderLayer(layer.key)}
                  />
                  <span>{layer.label}</span>
                </label>
              ))}
            </div>

            <span className="toolbar-divider" aria-hidden="true" />

            <label className="render-opacity-control" title="Opacidad de las manzanas: bajala para ver qué hay debajo mientras dibujás calles">
              <span>Opacidad manzanas</span>
              <input
                type="range"
                min="0.15"
                max="1"
                step="0.05"
                value={renderManzanaOpacity}
                onChange={(e) => onRenderManzanaOpacityChange(Number(e.target.value))}
              />
            </label>

            <span className="toolbar-divider" aria-hidden="true" />

            <div className="render-color-swatches" aria-label="Color de las superficies">
              <button
                type="button"
                className={`render-color-swatch${renderColorMode === 'light' ? ' is-active' : ''}`}
                title="Color claro"
                onClick={() => onRenderColorModeChange('light')}
              />
              <button
                type="button"
                className={`render-color-swatch render-color-swatch--dark${renderColorMode === 'dark' ? ' is-active' : ''}`}
                title="Color oscuro"
                onClick={() => onRenderColorModeChange('dark')}
              />
            </div>

            {hasRenderShapes && (
              <button
                type="button"
                className="editor-btn editor-btn--secondary"
                onClick={onClearRenderShapes}
                title="Borrar todas las manzanas y calles dibujadas (L)"
                aria-label="Limpiar. Atajo L"
              >
                Limpiar
                <kbd>L</kbd>
              </button>
            )}
          </div>
        ) : (
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
        )}

        {!isRenderMode && blueprintUrl && panoramaUrl && (
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

        {!isRenderMode && blueprintUrl && (
          <button
            type="button"
            className={`calibration-mode-btn${activeTool === 'autodetect' ? ' active' : ''}`}
            onClick={() => onToolChange('autodetect')}
            aria-pressed={activeTool === 'autodetect'}
            title="Auto-detectar lotes (solo en plano)"
          >
            <Wand2 size={17} />
            <span>Auto-detectar</span>
          </button>
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

      {isRenderMode && renderTestMode && (
        <div className="drawing-actions" role="status">
          <span>
            {renderDrawingPtsCount === 0
              ? (renderTestMode === 'calle' ? 'Click agrega punto del eje' : 'Click agrega punto')
              : `${renderDrawingPtsCount} punto${renderDrawingPtsCount === 1 ? '' : 's'}`}
          </span>
          <button
            type="button"
            className="editor-btn editor-btn--primary"
            onClick={onFinishRenderShape}
            disabled={renderDrawingPtsCount < (renderTestMode === 'calle' ? 2 : 3)}
          >
            Finalizar {renderTestMode === 'manzana' ? 'manzana' : 'calle'}
          </button>
          <button type="button" className="editor-btn editor-btn--secondary" onClick={onCancelRenderDrawing}>
            Cancelar
          </button>
        </div>
      )}

      {isRenderMode && renderStreetEditMode && (
        <div className="drawing-actions" role="status">
          <span>
            {renderStreetEditTarget
              ? 'Arrastrá un punto del eje para moverlo, o el punto celeste intermedio para agregar uno nuevo'
              : 'Clickeá una calle trazada para editar su eje'}
          </span>
        </div>
      )}
    </>
  );
}
