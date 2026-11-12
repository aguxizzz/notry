// Side-panel body for the "Detección automática" tool: detection params and status.
// The preview isn't drawn here: App renders it over the plano itself (BlueprintEditor's
// detectOverlay), so moving a slider shows its effect at full size.
import { useEffect, useState } from 'react';
import { Slider } from './inspector/InspectorUI';

export default function AutoDetectInspector({ isLoading, error, params, onParamsChange, generatedCount, onExit }) {
  // While dragging, only this panel follows the slider (draft). App gets the value on release:
  // each App update re-renders the whole editor and reprocesses the plano, which froze the drag.
  const [draft, setDraft] = useState(params);
  useEffect(() => { setDraft(params); }, [params]);

  const move = key => value => setDraft(prev => ({ ...prev, [key]: value }));
  const commit = key => value => {
    if (params[key] !== value) onParamsChange({ ...params, [key]: value });
  };

  return (
    <>
      <p className="ins-help">
        Hacé clic <strong>adentro de un lote</strong> en el plano y se arma su contorno.
        En el plano se ve lo que detecta: <strong style={{ color: 'var(--accent)' }}>dorado</strong> son
        bordes, <strong style={{ color: 'var(--color-danger)' }}>rojo</strong> es texto que se ignora.
      </p>

      <Slider
        id="ad-threshold"
        label="Detección de líneas"
        valueLabel={draft.threshold}
        min={50}
        max={230}
        value={draft.threshold}
        onChange={move('threshold')}
        onCommit={commit('threshold')}
        ends={['Solo las oscuras', 'También las claras']}
      />
      <Slider
        id="ad-text"
        label="Tamaño máximo de texto"
        valueLabel={`${draft.maxTextDim} px`}
        min={5}
        max={80}
        value={draft.maxTextDim}
        onChange={move('maxTextDim')}
        onCommit={commit('maxTextDim')}
        ends={['Ignora poco', 'Ignora más']}
      />
      <Slider
        id="ad-epsilon"
        label="Simplificación del contorno"
        valueLabel={draft.epsilon.toFixed(1)}
        min={0.5}
        max={6}
        step={0.5}
        value={draft.epsilon}
        onChange={move('epsilon')}
        onCommit={commit('epsilon')}
        ends={['Más vértices', 'Menos vértices']}
      />

      {isLoading && <p className="ins-help">Procesando el plano…</p>}
      {error && <p className="ins-error">{error}</p>}

      <div className="setup-actions">
        <button type="button" className="ins-mini ins-mini--primary" onClick={onExit}>
          Listo{generatedCount > 0 ? ` · ${generatedCount} lote${generatedCount === 1 ? '' : 's'}` : ''}
        </button>
      </div>
    </>
  );
}
