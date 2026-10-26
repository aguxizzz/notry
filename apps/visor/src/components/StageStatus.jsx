import './StageStatus.css';

/**
 * Aviso de carga de etapa ("Cargando etapa… 40%") o, si falló, el error con
 * "Reintentar". `raised` lo sube por encima del filtro de recomendados.
 */
export function StageStatus({ loading, progress, error, onRetry, raised }) {
  if (error) {
    return (
      <div className={`stage-transition-error${raised ? ' stage-transition-error--above-filter' : ''}`} role="alert">
        <span>{error.message}</span>
        <button type="button" onClick={onRetry}>Reintentar</button>
      </div>
    );
  }
  if (!loading) return null;
  return (
    <div className={`stage-transition-status${raised ? ' stage-transition-status--above-filter' : ''}`} role="status" aria-live="polite">
      {progress > 0 && progress < 100 ? `Cargando etapa… ${Math.round(progress)}%` : 'Cargando etapa…'}
    </div>
  );
}
