// Map background, blueprint opacity and orientation (state from useMapView).
// In the Satellite view the pieces go into the main toolbar separately (the
// background switch next to the view switcher, like Lotes | Superficies in
// Panorama); while calibrating GeoCalibrationMap shows them all in its own bar.
import { Compass, Grid3x3 } from 'lucide-react';

const MODES = [
  { id: 'satellite', label: 'Satélite' },
  { id: 'render', label: 'Render' },
];

/** Satélite | Render: what's painted as the ground of the map. */
export function MapBackgroundSwitch({ view }) {
  const { mode, setMode } = view;
  return (
    <div className="view-switcher view-switcher--sub" role="group" aria-label="Fondo del mapa">
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          className={mode === m.id ? 'is-active' : ''}
          aria-pressed={mode === m.id}
          onClick={() => setMode(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Blueprint opacity + north-up toggle. `hasBlueprint` is false until there
 * are 4 pairs: nothing to fade or turn yet, so it shows a hint instead.
 */
export function MapBlueprintControls({ view, hasBlueprint }) {
  const { opacity, setOpacity, orientation, setOrientation } = view;
  if (!hasBlueprint) {
    // Only while calibrating: without 4 pairs there's no blueprint to fade or turn.
    return <span className="map-controls__hint">Con 4 puntos el plano aparece encima</span>;
  }
  return (
    <>
      <label className="map-controls__opacity" title="Qué tanto se ve el plano sobre el mapa">
        <Grid3x3 size={15} aria-hidden="true" />
        <span>Plano</span>
        <input
          type="range" min="0" max="1" step="0.05"
          value={opacity}
          onChange={e => setOpacity(Number(e.target.value))}
        />
      </label>
      {/* Toggle: lit = north up; off = map turned like the blueprint (default). */}
      <button
        type="button"
        className={`editor-icon-btn${orientation === 'north' ? ' is-active' : ''}`}
        aria-pressed={orientation === 'north'}
        aria-label="Norte arriba"
        title={orientation === 'plano' ? 'Poner el norte arriba' : 'Girar el mapa como el plano'}
        onClick={() => setOrientation(o => (o === 'plano' ? 'north' : 'plano'))}
      >
        <Compass size={17} />
      </button>
    </>
  );
}

/** Both together, bare (no wrapper): the calibration map's own floating bar. */
export default function MapControls({ view, hasBlueprint }) {
  return (
    <>
      <MapBackgroundSwitch view={view} />
      <span className="toolbar-divider" aria-hidden="true" />
      <MapBlueprintControls view={view} hasBlueprint={hasBlueprint} />
    </>
  );
}
