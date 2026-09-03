import { useState } from 'react';
import { Crosshair, Eye, MoveDiagonal2, X } from 'lucide-react';

const GUIDE_DISMISSED_KEY = 'notry:calibration-guide-intro-dismissed:v1';

function getGuideInitiallyVisible() {
  try {
    return window.localStorage.getItem(GUIDE_DISMISSED_KEY) !== 'true';
  } catch {
    return true;
  }
}

function getBlueprintHint(pairCount) {
  if (pairCount === 0) return 'Empezá por una esquina fácil de reconocer en las dos imágenes.';
  if (pairCount === 1) return 'Elegí el próximo punto lejos del primero.';
  if (pairCount === 2) return 'Buscá otra zona del loteo para ampliar la cobertura.';
  return 'Completá el último punto cubriendo el sector que todavía quedó vacío.';
}

export default function CalibrationInspector({
  calibrationPoints,
  pendingBlueprintPoints,
  mode,
  onCancelCalibration,
  onDeleteCalibrationPoint,
  onClearCalibration,
  embedded = false,
}) {
  const pairCount = calibrationPoints?.length ?? 0;
  const pendingCount = pendingBlueprintPoints?.length ?? 0;
  const [guideVisible, setGuideVisible] = useState(getGuideInitiallyVisible);
  // Matching phase: back in the panorama, working through blueprint points
  // queued during the collecting phase. Otherwise still collecting in the
  // blueprint (batchTarget of them before the view switches automatically).
  const isComplete = pairCount >= 4;
  const choosingPanoramaPoint = mode === 'panorama' && pendingCount > 0;
  const targetView = choosingPanoramaPoint ? 'Panorama' : 'Plano';
  const batchTarget = Math.max(1, 4 - pairCount);
  const currentPair = pairCount + 1;

  const hideGuide = () => {
    setGuideVisible(false);
    try {
      window.localStorage.setItem(GUIDE_DISMISSED_KEY, 'true');
    } catch {
      // The guide still works when browser storage is unavailable.
    }
  };

  return (
    <div className={`calibration-inspector${embedded ? ' is-embedded' : ''}`}>
      {!embedded && <h3 className="context-title">Calibración</h3>}

      {guideVisible ? (
        <section className="calibration-guide" aria-labelledby="calibration-guide-title">
          <div className="calibration-guide__header">
            <div>
              <Crosshair size={15} />
              <strong id="calibration-guide-title">Antes de empezar</strong>
            </div>
            <button type="button" onClick={hideGuide}>Ocultar</button>
          </div>
          <p>Vas a marcar 4 puntos en común entre el plano y el panorama. Con esos 4 alcanza para una proyección precisa.</p>
          <ul>
            <li><Eye size={14} /><span>Elegí esquinas o cruces que se vean claramente en ambos.</span></li>
            <li><MoveDiagonal2 size={14} /><span>Distribuí los puntos por toda el área, no en un solo sector.</span></li>
            <li><X size={14} /><span>Evitá árboles, sombras y referencias que puedan confundirse.</span></li>
          </ul>
        </section>
      ) : (
        <button type="button" className="calibration-guide-link" onClick={() => setGuideVisible(true)}>
          <Crosshair size={14} /> Cómo elegir buenos puntos
        </button>
      )}

      {isComplete ? (
        <div className="calibration-step is-done" aria-live="polite">
          <div className="calibration-step__header">
            <span>Calibración</span>
            <strong>4 / 4 pares</strong>
          </div>
          <div className="calibration-step__copy">
            <strong>Listo, la calibración está completa.</strong>
            <span>Si un punto quedó mal ubicado, arrastralo para ajustarlo o borralo y volvé a marcarlo.</span>
          </div>
          <div className="calibration-progress" aria-label="4 de 4 pares completados">
            {[0, 1, 2, 3].map(index => <span key={index} className="is-complete" />)}
          </div>
        </div>
      ) : (
        <div className={`calibration-step${choosingPanoramaPoint ? ' is-panorama' : ''}`} aria-live="polite">
          <div className="calibration-step__header">
            <span>Ahora en {targetView}</span>
            <strong>{pairCount} / 4 pares</strong>
          </div>
          <div className="calibration-step__main">
            <div className={`calibration-step__number${choosingPanoramaPoint ? ' is-panorama' : ''}`}>
              {currentPair}
            </div>
            <div className="calibration-step__copy">
              <strong>
                {choosingPanoramaPoint
                  ? `Marcá exactamente el mismo lugar que el punto ${currentPair}.`
                  : batchTarget > 1
                    ? `Marcá ${batchTarget} puntos de referencia en el plano.`
                    : `Elegí la referencia ${currentPair} en el plano.`}
              </strong>
              <span>
                {choosingPanoramaPoint
                  ? `Faltan ${pendingCount} por marcar en el panorama, en el mismo orden. La vista vuelve al plano cuando termines.`
                  : batchTarget > 1 && pendingCount > 0
                    ? `${pendingCount} / ${batchTarget} marcados — ${getBlueprintHint(pairCount + pendingCount)}`
                    : getBlueprintHint(pairCount + pendingCount)}
              </span>
            </div>
          </div>
          <div className="calibration-progress" aria-label={`${pairCount} de 4 pares completados`}>
            {[0, 1, 2, 3].map(index => (
              <span key={index} className={index < pairCount ? 'is-complete' : index === pairCount ? 'is-current' : ''} />
            ))}
          </div>
        </div>
      )}

      {pairCount > 0 && (
        <div className="calibration-pairs">
          <span className="inspector-section-title">
            Pares marcados
            {pairCount < 4
              ? ` — faltan ${4 - pairCount}`
              : <span className="text-success"> — ✓ Lista</span>}
          </span>

          <div className="calibration-pair-list">
            {calibrationPoints.map((_, i) => (
              <div key={i} className="calibration-pair-row">
                <div>
                  <span className="calibration-pair-dot" />
                  <span>Par {i + 1}</span>
                </div>
                <button
                  className="calib-point-delete"
                  onClick={() => onDeleteCalibrationPoint?.(i)}
                  title={`Borrar par ${i + 1}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="calibration-actions">
        {pairCount > 0 && (
          <button className="calib-btn-danger" onClick={onClearCalibration}>
            Borrar toda la calibración
          </button>
        )}
        <button className="calib-btn-secondary" onClick={onCancelCalibration}>
          Salir de calibración
        </button>
      </div>
    </div>
  );
}
