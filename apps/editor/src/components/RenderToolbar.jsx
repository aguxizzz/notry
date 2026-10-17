import { PenLine, Pentagon, Route, Square } from 'lucide-react';

const RENDER_LAYERS = [
  { key: 'lotes', label: 'Lotes' },
  { key: 'manzanas', label: 'Manzanas' },
  { key: 'calles', label: 'Calles' },
];

// 10 anchos discretos para calles nuevas, de 8 a 225 px de textura.
const STREET_WIDTH_MIN = 8;
const STREET_WIDTH_MAX = 225;
const STREET_WIDTH_OPTIONS = Array.from({ length: 10 }, (_, i) =>
  Math.round(STREET_WIDTH_MIN + ((STREET_WIDTH_MAX - STREET_WIDTH_MIN) * i) / 9)
);

/** Herramientas del modo Render (va dentro de la barra, en lugar de las de lotes). */
export function RenderTools({ render }) {
  return (
    <div className="toolbar-tools" aria-label="Herramientas de render">
      <button
        type="button"
        className={`tool-btn${render.tool === 'manzana' ? ' active' : ''}`}
        onClick={() => render.toggleTool('manzana')}
        title="Dibujar manzana (1)"
        aria-label="Dibujar manzana. Atajo 1"
      >
        <Pentagon size={18} />
        <span>Manzana</span>
        <kbd>1</kbd>
      </button>
      <button
        type="button"
        className={`tool-btn${render.tool === 'calle' ? ' active' : ''}`}
        onClick={() => render.toggleTool('calle')}
        title="Dibujar calle: trazá el eje central, el contorno se genera con ancho constante (2)"
        aria-label="Dibujar calle. Atajo 2"
      >
        <Square size={18} />
        <span>Calle</span>
        <kbd>2</kbd>
      </button>
      {render.tool === 'calle' && (
        <label className="render-opacity-control" title="Ancho de la calle (px de textura): se traza por su eje central, la Ruta">
          <Route size={16} />
          <span>Ancho</span>
          <select
            value={render.streetWidth}
            onChange={(e) => render.setStreetWidth(Number(e.target.value))}
          >
            {STREET_WIDTH_OPTIONS.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </label>
      )}

      <button
        type="button"
        className={`tool-btn${render.streetEditMode ? ' active' : ''}`}
        onClick={render.toggleStreetEditMode}
        disabled={!render.hasStreetPaths}
        title="Editar ruta: clickeá una calle para mover, agregar o quitar puntos de su eje (3)"
        aria-label="Editar ruta. Atajo 3"
      >
        <PenLine size={18} />
        <span>Editar ruta</span>
        <kbd>3</kbd>
      </button>
      {render.streetEditMode && render.streetEditTarget && (
        <label className="render-opacity-control" title="Ancho de la calle seleccionada (px de textura)">
          <span>Ancho</span>
          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={render.editTargetWidth}
            onChange={(e) => render.setEditTargetWidth(Number(e.target.value))}
          />
        </label>
      )}

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="render-layers" aria-label="Capas visibles">
        {RENDER_LAYERS.map(layer => (
          <label key={layer.key} className="render-layer-toggle">
            <input
              type="checkbox"
              checked={render.layersVisible?.[layer.key] ?? true}
              onChange={() => render.toggleLayer(layer.key)}
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
          value={render.manzanaOpacity}
          onChange={(e) => render.setManzanaOpacity(Number(e.target.value))}
        />
      </label>

      <span className="toolbar-divider" aria-hidden="true" />

      <div className="render-color-swatches" aria-label="Color de las superficies">
        <button
          type="button"
          className={`render-color-swatch${render.colorMode === 'light' ? ' is-active' : ''}`}
          title="Color claro"
          onClick={() => render.setColorMode('light')}
        />
        <button
          type="button"
          className={`render-color-swatch render-color-swatch--dark${render.colorMode === 'dark' ? ' is-active' : ''}`}
          title="Color oscuro"
          onClick={() => render.setColorMode('dark')}
        />
      </div>

      {render.hasShapes && (
        <button
          type="button"
          className="editor-btn editor-btn--secondary"
          onClick={render.clearShapes}
          title="Borrar todas las manzanas y calles dibujadas (L)"
          aria-label="Limpiar. Atajo L"
        >
          Limpiar
          <kbd>L</kbd>
        </button>
      )}
    </div>
  );
}

/** Barra de estado bajo la toolbar mientras se dibuja o se edita una Ruta. */
export function RenderStatus({ render }) {
  if (render.tool) {
    const count = render.drawingPts.length;
    return (
      <div className="drawing-actions" role="status">
        <span>
          {count === 0
            ? (render.tool === 'calle' ? 'Click agrega punto del eje' : 'Click agrega punto')
            : `${count} punto${count === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          className="editor-btn editor-btn--primary"
          onClick={render.finishShape}
          disabled={!render.canFinishShape}
        >
          Finalizar {render.tool === 'manzana' ? 'manzana' : 'calle'}
        </button>
        <button type="button" className="editor-btn editor-btn--secondary" onClick={render.cancelDrawing}>
          Cancelar
        </button>
      </div>
    );
  }

  if (render.streetEditMode) {
    return (
      <div className="drawing-actions" role="status">
        <span>
          {render.streetEditTarget
            ? 'Arrastrá un punto del eje para moverlo, o el punto celeste intermedio para agregar uno nuevo'
            : 'Clickeá una calle trazada para editar su eje'}
        </span>
        {render.streetEditTarget && <DeleteShapeButton render={render} label="Borrar calle" />}
      </div>
    );
  }

  if (render.selectedSurface) {
    const label = render.selectedSurface.kind === 'manzana' ? 'Manzana' : 'Calle';
    return (
      <div className="drawing-actions" role="status">
        <span>{label} seleccionada</span>
        <DeleteShapeButton render={render} label={`Borrar ${label.toLowerCase()}`} />
        <button type="button" className="editor-btn editor-btn--secondary" onClick={render.clearSelection}>
          Cancelar
        </button>
      </div>
    );
  }

  return null;
}

function DeleteShapeButton({ render, label }) {
  return (
    <button
      type="button"
      className="editor-btn editor-btn--secondary"
      onClick={render.deleteSelected}
      title={`${label} (Supr). Se deshace con Ctrl+Z`}
    >
      {label}
      <kbd>Supr</kbd>
    </button>
  );
}
