import { useEffect, useRef, useState } from 'react';
import './OnboardingOverlay.css';

const IconHand = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 12V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M12 10.5V5a1.5 1.5 0 0 1 3 0v6" />
    <path d="M15 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.3-2.2 6-6 6-2.4 0-3.6-.8-4.6-2.2L4.8 14a1.4 1.4 0 0 1 2-2l2.2 2" />
  </svg>
);

const HINT_MS = 6500;
const FADE_MS = 350;
const SWAY_YAW = 0.22;
const SWAY_SPEED = 1800;

/**
 * Bienvenida liviana (reemplaza al modal de 5 pasos): una pista de gesto que
 * no tapa nada ni pide "Continuar", mientras la cámara se mece un poco para
 * mostrar que la foto se mueve. Se va sola, al primer toque/rueda sobre la
 * foto, o en silencio si se abre un lote. Al irse (no en silencio) hace
 * titilar `pulseSelector` para señalar dónde está la lista de lotes.
 */
export function OnboardingOverlay({ visible, onDismiss, containerRef, psvRef, sway = false, silenceWhen = false, pulseSelector }) {
  const [phase, setPhase] = useState('hidden'); // hidden | in | out
  const activeRef = useRef(false);
  const finishRef = useRef(() => {});
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const pulseRef = useRef(pulseSelector);
  pulseRef.current = pulseSelector;

  useEffect(() => {
    if (!visible) return undefined;
    activeRef.current = true;
    const raf = requestAnimationFrame(() => setPhase('in'));
    let fadeTimer;

    const finish = (silent) => {
      if (!activeRef.current) return;
      activeRef.current = false;
      clearTimeout(timer);
      setPhase('out');
      fadeTimer = setTimeout(() => {
        setPhase('hidden');
        onDismissRef.current?.();
      }, FADE_MS);
      if (!silent) pulse(pulseRef.current);
    };
    finishRef.current = finish;
    const timer = setTimeout(() => finish(false), HINT_MS);

    const el = containerRef?.current;
    const onTouch = () => finish(false);
    el?.addEventListener('pointerdown', onTouch, { capture: true });
    el?.addEventListener('wheel', onTouch, { capture: true, passive: true });

    const viewer = psvRef?.current;
    if (sway && viewer) {
      try {
        const { yaw, pitch } = viewer.getPosition();
        viewer.animate({ yaw: yaw + SWAY_YAW, pitch, speed: SWAY_SPEED })
          .then((done) => {
            if (done !== false && activeRef.current) viewer.animate({ yaw, pitch: viewer.getPosition().pitch, speed: SWAY_SPEED });
          });
      } catch (_) { /* el visor se desmontó */ }
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(fadeTimer);
      el?.removeEventListener('pointerdown', onTouch, { capture: true });
      el?.removeEventListener('wheel', onTouch, { capture: true });
      activeRef.current = false;
    };
    // Solo al aparecer: sway/refs se leen en ese momento.
  }, [visible]);

  // Abrir un lote (desde el panel o la foto) la cierra sin titilar nada.
  useEffect(() => {
    if (silenceWhen) finishRef.current(true);
  }, [silenceWhen]);

  if (!visible && phase === 'hidden') return null;

  return (
    <div className={`gesture-hint${phase === 'in' ? ' is-on' : ''}`} role="status">
      <div className="gesture-hint__track"><span className="gesture-hint__hand"><IconHand /></span></div>
      <b>Arrastrá para mirar alrededor</b>
      <small>Tocá un lote para ver su ficha</small>
    </div>
  );
}

function pulse(selector) {
  const el = selector && document.querySelector(selector);
  if (!el) return;
  el.classList.remove('hint-pulse');
  void el.offsetWidth;
  el.classList.add('hint-pulse');
  setTimeout(() => el.classList.remove('hint-pulse'), 2400);
}
