import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react';
import './BlueprintControls.css';

const stopPan = (event) => {
  event.stopPropagation();
};

export default function BlueprintControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onFullscreen,
  isFullscreen = false,
}) {
  const handleFullscreen = (e) => {
    e.stopPropagation();
    onFullscreen();
  };

  return (
    <div className="blueprint-controls" role="toolbar" aria-label="Controles del plano">
      <button
        type="button"
        className="blueprint-btn"
        onMouseDown={stopPan}
        onClick={onZoomOut}
        aria-label="Alejar"
        title="Alejar"
      >
        <Minus aria-hidden="true" />
      </button>
      <button
        type="button"
        className="blueprint-btn"
        onMouseDown={stopPan}
        onClick={onZoomIn}
        aria-label="Acercar"
        title="Acercar"
      >
        <Plus aria-hidden="true" />
      </button>
      <span className="blueprint-controls__divider" aria-hidden="true" />
      <button
        type="button"
        className="blueprint-btn"
        onMouseDown={stopPan}
        onClick={onReset}
        aria-label="Restablecer vista"
        title="Restablecer vista"
      >
        <RotateCcw aria-hidden="true" />
      </button>
      <button
        type="button"
        className="blueprint-btn"
        onMouseDown={stopPan}
        onClick={handleFullscreen}
        aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        aria-pressed={isFullscreen}
      >
        {isFullscreen
          ? <Minimize2 aria-hidden="true" />
          : <Maximize2 aria-hidden="true" />}
      </button>
    </div>
  );
}
