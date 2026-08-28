import { useRef, useEffect, useState } from 'react';
import './StageSwitcher.css';

export default function StageSwitcher({ stages, currentStageId, onSelect, disabled = false }) {
  if (!stages || stages.length < 2) return null;

  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [pill, setPill] = useState(null);
  const animateRef = useRef(false);

  useEffect(() => {
    const btn = btnRefs.current[currentStageId];
    const container = containerRef.current;
    if (!btn || !container) return;

    const btnRect = btn.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const next = {
      left: btnRect.left - containerRect.left + container.scrollLeft,
      top: btnRect.top - containerRect.top,
      width: btnRect.width,
      height: btnRect.height,
    };

    if (!animateRef.current) {
      // Primera vez: posicionar sin animación, luego habilitar
      setPill({ ...next, animate: false });
      requestAnimationFrame(() => {
        animateRef.current = true;
        setPill(p => p ? { ...p, animate: true } : p);
      });
    } else {
      setPill({ ...next, animate: true });
    }
  }, [currentStageId]);

  return (
    <div className="stage-switcher" ref={containerRef} role="tablist" aria-label="Etapas">
      {pill && (
        <span
          className="stage-pill"
          style={{
            left: pill.left,
            top: pill.top,
            width: pill.width,
            height: pill.height,
            transition: pill.animate
              ? 'left 0.26s cubic-bezier(0.4,0,0.2,1), width 0.26s cubic-bezier(0.4,0,0.2,1)'
              : 'none',
          }}
        />
      )}

      {stages.map((stage, i) => {
        const isActive = stage.id === currentStageId;
        const label = stage.name || (stage.tipo === 'general' ? 'General' : `Etapa ${i + 1}`);
        return (
          <button
            key={stage.id}
            ref={(el) => { btnRefs.current[stage.id] = el; }}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
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
