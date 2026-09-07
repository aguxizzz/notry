import { useRef, useEffect, useState } from 'react';
import './StageSwitcher.css';

export default function StageSwitcher({ stages, currentStageId, pendingStageId = null, progress = 0, onSelect, disabled = false }) {
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
  }, [currentStageId, stages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const btn = btnRefs.current[currentStageId];
      if (!btn) return;
      const btnRect = btn.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setPill((value) => value ? {
        ...value,
        left: btnRect.left - containerRect.left + container.scrollLeft,
        top: btnRect.top - containerRect.top,
        width: btnRect.width,
        height: btnRect.height,
      } : value);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [currentStageId]);

  if (!stages || stages.length < 2) return null;

  const focusStage = (index) => {
    const target = stages[(index + stages.length) % stages.length];
    btnRefs.current[target.id]?.focus();
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); focusStage(index + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusStage(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusStage(0); }
    else if (event.key === 'End') { event.preventDefault(); focusStage(stages.length - 1); }
  };

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
        const isPending = stage.id === pendingStageId && !isActive;
        const label = stage.name || (stage.tipo === 'general' ? 'General' : `Etapa ${i + 1}`);
        return (
          <button
            key={stage.id}
            ref={(el) => { btnRefs.current[stage.id] = el; }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-busy={isPending || undefined}
            tabIndex={isActive || (!currentStageId && i === 0) ? 0 : -1}
            disabled={disabled}
            className={`stage-switcher-btn${isActive ? ' active' : ''}${isPending ? ' pending' : ''}${stage.tipo === 'general' ? ' is-general' : ''}`}
            onClick={() => onSelect(stage.id)}
            onKeyDown={(event) => handleKeyDown(event, i)}
            title={label}
          >
            {stage.tipo === 'general' && (
              <svg className="stage-switcher-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            )}
            <span className="stage-switcher-label">{label}</span>
            {isPending && (
              <span className="stage-switcher-progress" aria-hidden="true">
                {progress > 0 && progress < 100 ? `${Math.round(progress)}%` : ''}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
