const ZOOM_IN_LABEL = 'Acercar';
const ZOOM_OUT_LABEL = 'Alejar';
const RESET_VIEW_LABEL = 'Centrar vista';
const FULLSCREEN_LABEL = 'Pantalla completa';

export default function BlueprintControls({ onZoomIn, onZoomOut, onReset, onFullscreen }) {
  const handleFullscreen = (e) => {
    e.stopPropagation();
    onFullscreen();
  };

  return (
    <div className="blueprint-controls">
      <button className="blueprint-btn" onClick={onZoomOut} aria-label={ZOOM_IN_LABEL}>
        -
      </button>
      <button className="blueprint-btn" onClick={onZoomIn} aria-label={ZOOM_OUT_LABEL}>
        +
      </button>
      <button className="blueprint-btn blueprint-btn--wide" onClick={onReset} aria-label={RESET_VIEW_LABEL}>
        RESET
      </button>
      <button className="blueprint-btn blueprint-btn--wide" onClick={handleFullscreen} aria-label={FULLSCREEN_LABEL}>
        ⛶
      </button>
    </div>
  );
}