import {
  Camera,
  Crosshair,
  Grid3x3,
  Layers,
  MapPin,
  MousePointer2,
  Pentagon,
  Redo2,
  Route,
  Satellite,
  Square,
  Type,
  Undo2,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { RenderStatus, RenderTools } from './RenderToolbar';
import { MAX_STREET_WIDTH_M, MIN_STREET_WIDTH_M } from '../utils/geoSurfaces';

const GLIDE_MS = 180;

/**
 * The toolbar is centered, so when its width changes (another tool set) its
 * left edge jumps by half the difference and the view switcher moves under the
 * cursor. This animates that jump instead: the observer fires after layout and
 * before paint, so the bar starts where it was and slides to its new center.
 */
function useGlideRecenter(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let lastWidth = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      const width = el.offsetWidth;
      const delta = width - lastWidth;
      lastWidth = width;
      if (!delta) return;
      // Hidden (side panel over it on narrow screens) or reduced motion: just jump.
      if (getComputedStyle(el).pointerEvents === 'none') return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // Start shifted by half the growth, i.e. with the left edge where it was.
      el.animate(
        [{ transform: `translateX(calc(-50% + ${delta / 2}px))` }, { transform: 'translateX(-50%)' }],
        { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'V' },
  { id: 'polygon', icon: Pentagon, label: 'Lote', shortcut: '1' },
  { id: 'poi', icon: MapPin, label: 'Lugar', shortcut: '2' },
  { id: 'text', icon: Type, label: 'Texto', shortcut: '3' },
  // Solo tiene sentido dibujarlo en el plano — en el panorama esférico un
  // "rectángulo" se deforma igual que cualquier otro polígono.
  { id: 'rect', icon: Square, label: 'Rectángulo', shortcut: '2' },
];

// Tools of the Satellite view. They draw manzanas/calles on the map
// (useGeoSurfaces), not lots: lots come from the plano through the calibration.
const SATELLITE_TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'V' },
  { id: 'manzana', icon: Pentagon, label: 'Manzana', shortcut: '1' },
  { id: 'calle', icon: Route, label: 'Calle', shortcut: '2' },
];

const SATELLITE_HINTS = {
  manzana: 'Clic para agregar puntos · clic en el primero o Enter para cerrar · Supr saca el último',
  calle: 'Clic para trazar el eje · Enter para terminar · Supr saca el último',
};

/** Manzana/calle tools + street width, shown instead of the lot tools in the Satellite view. */
function SatelliteTools({ surfaces }) {
  const { tool, canDraw, selectedCalle, streetWidth } = surfaces;
  const showWidth = tool === 'calle' || !!selectedCalle;
  return (
    <div className="toolbar-tools" aria-label="Herramientas del satélite">
      {SATELLITE_TOOLS.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            className={`tool-btn${tool === t.id ? ' active' : ''}`}
            onClick={() => surfaces.setTool(t.id)}
            title={canDraw ? `${t.label} (${t.shortcut})` : 'Primero vinculá el plano con el mapa'}
            aria-label={`${t.label}. Atajo ${t.shortcut}`}
            aria-pressed={tool === t.id}
            disabled={!canDraw}
          >
            <Icon size={18} />
            <span>{t.label}</span>
            <kbd>{t.shortcut}</kbd>
          </button>
        );
      })}
      {showWidth && (
        <label className="geo-draw-toolbar__width">
          <span>{selectedCalle ? 'Ancho de la calle' : 'Ancho'}</span>
          <input
            type="number"
            min={MIN_STREET_WIDTH_M}
            max={MAX_STREET_WIDTH_M}
            step="0.5"
            value={selectedCalle?.width ?? streetWidth}
            onChange={e => {
              const value = Number(e.target.value);
              if (value >= MIN_STREET_WIDTH_M && value <= MAX_STREET_WIDTH_M) surfaces.changeStreetWidth(value);
            }}
          />
          <span>m</span>
        </label>
      )}
    </div>
  );
}

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
  geoCalibrationPoints,
  render,
  geoSurfaces,
}) {
  // 'render' isn't a view of its own: it's the Panorama view drawing surfaces
  // (manzanas/calles) instead of lots, picked with the Lotes | Superficies switch.
  const isRenderMode = mode === 'render';
  const isPanoramaView = mode === 'panorama' || isRenderMode;
  const isSatelliteMode = mode === 'satellite';
  // Plano and Panorama share the lot tools; Render and Satélite bring their own.
  const hasLotTools = !isRenderMode && !isSatelliteMode;
  const toolbarRef = useRef(null);
  useGlideRecenter(toolbarRef);

  return (
    <>
      <div ref={toolbarRef} className="toolbar" aria-label="Herramientas del editor">
        <div className="view-switcher" aria-label="Vista del editor">
          <button
            type="button"
            className={isPanoramaView ? 'is-active' : ''}
            // Already in the panorama (lots or surfaces): stay where you are.
            onClick={() => { if (!isPanoramaView) onModeChange('panorama'); }}
            disabled={!panoramaUrl}
            aria-pressed={isPanoramaView}
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
            className={isSatelliteMode ? 'is-active' : ''}
            onClick={() => onModeChange('satellite')}
            disabled={!blueprintUrl}
            title={blueprintUrl ? undefined : 'Necesita el plano: los lotes se ubican en el mapa a partir de él'}
            aria-pressed={isSatelliteMode}
          >
            <Satellite size={16} />
            <span>Satélite</span>
          </button>
        </div>

        <span className="toolbar-divider" aria-hidden="true" />

        {isPanoramaView && (
          <>
            <div className="view-switcher view-switcher--sub" aria-label="Qué dibujar en el panorama">
              <button
                type="button"
                className={!isRenderMode ? 'is-active' : ''}
                onClick={() => onModeChange('panorama')}
                aria-pressed={!isRenderMode}
              >
                <Pentagon size={15} />
                <span>Lotes</span>
              </button>
              <button
                type="button"
                className={isRenderMode ? 'is-active' : ''}
                onClick={() => onModeChange('render')}
                aria-pressed={isRenderMode}
                title="Manzanas y calles dibujadas sobre el panorama"
              >
                <Layers size={15} />
                <span>Superficies</span>
              </button>
            </div>
            <span className="toolbar-divider" aria-hidden="true" />
          </>
        )}

        {isRenderMode ? (
          <RenderTools render={render} />
        ) : isSatelliteMode ? (
          <SatelliteTools surfaces={geoSurfaces} />
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

        {isSatelliteMode && (
          <>
            <span className="toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              className="calibration-mode-btn"
              onClick={() => onToolChange('calibrate-geo')}
              title="Vincular el plano con el mapa (puntos y ajuste)"
            >
              <Crosshair size={17} />
              <span>Calibrar</span>
              {geoCalibrationPoints?.length > 0 && (
                <small className={geoCalibrationPoints.length >= 4 ? 'is-ready' : ''}>
                  {geoCalibrationPoints.length}
                </small>
              )}
            </button>
          </>
        )}

        {hasLotTools && blueprintUrl && panoramaUrl && (
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

        {hasLotTools && blueprintUrl && (
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

      {isRenderMode && <RenderStatus render={render} />}

      {isSatelliteMode && SATELLITE_HINTS[geoSurfaces.tool] && (
        <div className="drawing-actions" role="status">
          <span>{SATELLITE_HINTS[geoSurfaces.tool]}</span>
          {geoSurfaces.drawing.length > 0 && (
            <button type="button" className="editor-btn editor-btn--primary" onClick={geoSurfaces.finish}>
              Terminar
            </button>
          )}
        </div>
      )}
    </>
  );
}
