import { useLayoutEffect, useRef } from 'react';
import { Ico } from './LotUi.jsx';
import { headingDegrees } from '../headingStore.js';
import { I } from '../icons/uiIcons.js';

// Brújula horizontal del flotante (celular): una cinta de rumbos que corre
// debajo de los modos de vista; la marca dorada del centro es hacia dónde se
// mira. Tocarla gira la cámara hacia el norte. Los rumbos se repiten de -180°
// a 540° para que la cinta siempre llene el ancho.
const TAPE_PX_PER_DEG = 2.4;
const TAPE_LABELS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
const TAPE_MARKS = Array.from({ length: 49 }, (_, i) => i * 15 - 180);

// `heading` es el store de rumbo (headingStore.js): la cinta se corre directo
// en el DOM, sin re-render.
export function CompassTape({ heading, northOffset, onNorth }) {
  const buttonRef = useRef(null);
  const trackRef = useRef(null);
  const shown = northOffset !== null && northOffset !== undefined;

  useLayoutEffect(() => {
    if (!shown) return undefined;
    let lastLabel = null;
    return heading.subscribe((yaw) => {
      const deg = headingDegrees(yaw, northOffset);
      if (trackRef.current) trackRef.current.style.transform = `translateX(${-(deg + 180) * TAPE_PX_PER_DEG}px)`;
      // El aria-label solo cambia con el grado entero.
      const label = `Rumbo ${Math.round(deg) % 360}°. Mirar hacia el norte`;
      if (label !== lastLabel && buttonRef.current) {
        buttonRef.current.setAttribute('aria-label', label);
        lastLabel = label;
      }
    });
  }, [heading, northOffset, shown]);

  if (!shown) return null;
  return (
    <button ref={buttonRef} type="button" className="lf-tape" onClick={onNorth} aria-label="Mirar hacia el norte">
      <span ref={trackRef} className="lf-tape-track" aria-hidden="true">
        {TAPE_MARKS.map((deg) => {
          const label = TAPE_LABELS[(deg + 360) % 360];
          return (
            <span
              key={deg}
              className={`lf-tape-mark${label ? ' is-label' : ''}${label === 'N' ? ' is-north' : ''}`}
              style={{ left: `${(deg + 180) * TAPE_PX_PER_DEG}px` }}
            >
              {label ?? ''}
            </span>
          );
        })}
      </span>
    </button>
  );
}

export function MapControls({ onZoomIn, onZoomOut, onReset, hidden = false }) {
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  return (
    <div className={`lp-map-ctrl${hidden ? ' is-hidden' : ''}`} role="group" aria-label="Controles de la vista">
      <button type="button" onClick={onZoomIn} aria-label="Acercar" title="Acercar"><Ico d={I.plus} /></button>
      <button type="button" onClick={onZoomOut} aria-label="Alejar" title="Alejar"><Ico d={I.minus} /></button>
      <button type="button" onClick={onReset} aria-label="Volver a la vista inicial" title="Volver a la vista inicial"><Ico d={I.home} /></button>
      <button type="button" onClick={toggleFullscreen} aria-label="Pantalla completa" title="Pantalla completa"><Ico d={I.expand} /></button>
    </div>
  );
}
