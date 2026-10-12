import { useEffect, useRef, useState } from 'react';
import { getPreviewMask } from '../utils/lotDetection';
import './AutoDetectInspector.css';

export default function AutoDetectInspector({
  blueprintUrl,
  isLoading,
  error,
  params,
  onParamsChange,
  generatedCount,
}) {
  const canvasRef = useRef(null);
  const [previewReady, setPreviewReady] = useState(false);
  const previewTimeoutRef = useRef(null);

  // Update preview when params change (debounced)
  useEffect(() => {
    if (!blueprintUrl || !params) return;

    let isMounted = true;

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }

    previewTimeoutRef.current = setTimeout(async () => {
      if (!isMounted) return;
      const preview = await getPreviewMask(blueprintUrl, params);
      if (isMounted && preview && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        canvasRef.current.width = preview.width;
        canvasRef.current.height = preview.height;
        ctx.putImageData(preview, 0, 0);
        setPreviewReady(true);
      }
    }, 200);

    return () => {
      isMounted = false;
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
  }, [blueprintUrl, params]);

  const handleThresholdChange = (val) => {
    onParamsChange({ ...params, threshold: parseInt(val) });
  };

  const handleMaxTextDimChange = (val) => {
    onParamsChange({ ...params, maxTextDim: parseInt(val) });
  };

  const handleEpsilonChange = (val) => {
    onParamsChange({ ...params, epsilon: parseFloat(val) });
  };

  return (
    <div className="autodetect-inspector">
      <div className="section-title">Detección Automática</div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {isLoading && (
        <div className="loading-state">
          <span>Procesando…</span>
        </div>
      )}

      <div className="param-group">
        <label>
          <span className="param-label">
            Umbral de binarización
            <small>{params.threshold}</small>
          </span>
          <input
            type="range"
            min="50"
            max="200"
            value={params.threshold}
            onChange={(e) => handleThresholdChange(e.target.value)}
            disabled={isLoading}
            className="param-slider"
          />
          <small className="param-hint">Menor = más líneas detectadas</small>
        </label>
      </div>

      <div className="param-group">
        <label>
          <span className="param-label">
            Tamaño máx. de texto (px)
            <small>{params.maxTextDim}</small>
          </span>
          <input
            type="range"
            min="5"
            max="50"
            value={params.maxTextDim}
            onChange={(e) => handleMaxTextDimChange(e.target.value)}
            disabled={isLoading}
            className="param-slider"
          />
          <small className="param-hint">Mayor = menos texto removido</small>
        </label>
      </div>

      <div className="param-group">
        <label>
          <span className="param-label">
            Tolerancia simplificación
            <small>{params.epsilon.toFixed(1)}</small>
          </span>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={params.epsilon}
            onChange={(e) => handleEpsilonChange(e.target.value)}
            disabled={isLoading}
            className="param-slider"
          />
          <small className="param-hint">Mayor = menos vértices</small>
        </label>
      </div>

      <div className="preview-section">
        <div className="preview-label">
          Vista previa
          {!previewReady && !isLoading && <small>cargando…</small>}
        </div>
        <div className="preview-wrap">
          <canvas ref={canvasRef} className="autodetect-preview" />
        </div>
      </div>

      {generatedCount > 0 && (
        <div className="status-message">
          ✓ {generatedCount} lote{generatedCount === 1 ? '' : 's'} generado{generatedCount === 1 ? '' : 's'}
        </div>
      )}

      <small className="help-text">
        Click en el plano para detectar un lote. El sistema binariza la imagen, elimina texto quemado,
        y traza el contorno usando flood fill.
      </small>
    </div>
  );
}
