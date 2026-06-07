import './StageSwitcher.css';

/**
 * StageSwitcher — barra para cambiar entre etapas de un grupo (multi-panorama).
 * La imagen general aparece primero; las etapas en su orden.
 *
 * @param {Array}    props.stages         - [{ id, name, tipo, orden }]
 * @param {string}   props.currentStageId
 * @param {Function} props.onSelect       - (stageId) => void
 */
export default function StageSwitcher({ stages, currentStageId, onSelect }) {
  if (!stages || stages.length < 2) return null;

  return (
    <div className="stage-switcher" role="tablist" aria-label="Etapas">
      {stages.map((stage, i) => {
        const isActive = stage.id === currentStageId;
        const label = stage.name || (stage.tipo === 'general' ? 'General' : `Etapa ${i + 1}`);
        return (
          <button
            key={stage.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`stage-switcher-btn${isActive ? ' active' : ''}${stage.tipo === 'general' ? ' is-general' : ''}`}
            onClick={() => onSelect(stage.id)}
            title={label}
          >
            {stage.tipo === 'general' && (
              <svg className="stage-switcher-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            )}
            <span className="stage-switcher-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
