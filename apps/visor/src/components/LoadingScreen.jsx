export function LoadingScreen({ logoUrl = null, progress = 0 }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const indeterminate = pct <= 0;

  return (
    <div className="viewer-loading-screen">
      {logoUrl && (
        <img className="viewer-loading-screen__logo" src={logoUrl} alt="" />
      )}
      <div className="viewer-loading-bar" role="progressbar" aria-valuenow={indeterminate ? undefined : pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`viewer-loading-bar__track${indeterminate ? ' viewer-loading-bar__track--indeterminate' : ''}`}>
          <div className="viewer-loading-bar__fill" style={indeterminate ? undefined : { width: `${pct}%` }} />
        </div>
        <span className="viewer-loading-bar__pct">{indeterminate ? 'Cargando…' : `${pct}%`}</span>
      </div>
    </div>
  );
}
