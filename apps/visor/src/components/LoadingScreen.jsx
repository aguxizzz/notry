import { useEffect, useRef, useState } from 'react';
import './LoadingScreen.css';

const SLIDE_MS = 4500;        // tiempo por foto
const CAPTION_SWAP_MS = 450;  // la leyenda sale, cambia y vuelve a entrar
const HINT_MS = 4000;         // el aviso dura 4s desde la última interacción
const RING_LEN = 106.8;       // 2πr del anillo del aviso (r = 17)

// Precarga las fotos de a una (la 1ª primero) para no competir con el
// panorama por ancho de banda. Devuelve solo las que ya cargaron, en orden;
// una que falla se saltea. La lista se toma una sola vez: si después llega
// otra (p. ej. la del group_visor_data tras la del branding) no se cambia a
// mitad de la galería.
function usePreloadedSlides(gallery) {
  const [slides, setSlides] = useState([]);
  const sourceRef = useRef(null);
  if (sourceRef.current === null && gallery.length > 0) sourceRef.current = gallery;
  const source = sourceRef.current;

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let i = 0;
    const next = () => {
      if (cancelled || i >= source.length) return;
      const item = source[i++];
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (cancelled) return;
        setSlides((prev) => [...prev, item]);
        next();
      };
      img.onerror = next;
      img.src = item.url;
    };
    next();
    return () => { cancelled = true; };
  }, [source]);

  return slides;
}

// Un logo oscuro no se lee sobre la foto: en ese caso va dentro de un chip
// claro. Si el servidor no permite leer los píxeles (CORS), queda sin chip,
// igual que en la pantalla oscura de siempre.
function useIsDarkLogo(url) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(false);
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let lum = 0;
        let weight = 0;
        for (let p = 0; p < data.length; p += 4) {
          const a = data[p + 3] / 255;
          if (a < 0.2) continue;
          lum += (0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) * a;
          weight += a;
        }
        setDark(weight > 0 && lum / weight < 110);
      } catch (_) {
        // canvas "tainted": sin datos, sin chip.
      }
    };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  return dark;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Pantalla de carga del visor. Sin fotos es la de siempre (logo + barra al
 * centro); con `gallery` muestra las fotos del desarrollo a sangre mientras
 * baja el panorama (diseño A de design-lab/carga-galeria.html).
 *
 * @param {string|null} logoUrl
 * @param {number} progress  0–100 (load-progress de PSV)
 * @param {{url: string, caption?: string}[]} gallery
 * @param {boolean} done     terminó la carga: la foto se agranda y se disuelve
 */
export function LoadingScreen({ logoUrl = null, progress = 0, gallery = [], done = false }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
  const indeterminate = pct <= 0;
  const slides = usePreloadedSlides(gallery);
  const hasMedia = slides.length > 0;
  const darkLogo = useIsDarkLogo(hasMedia ? logoUrl : null);

  // Galería: `step` cuenta los cambios para reiniciar el Ken Burns de la foto
  // que entra (su <img> cambia de key y se vuelve a montar).
  const [view, setView] = useState({ idx: 0, prev: -1, step: 0 });
  const [captionIdx, setCaptionIdx] = useState(0);
  const [captionSwapping, setCaptionSwapping] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || done) return undefined;
    const t = setInterval(() => {
      setView((v) => ({ idx: (v.idx + 1) % slides.length, prev: v.idx, step: v.step + 1 }));
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length, done]);

  useEffect(() => {
    if (view.step === 0) return undefined;
    setCaptionSwapping(true);
    const t = setTimeout(() => {
      setCaptionIdx(view.idx);
      setCaptionSwapping(false);
    }, CAPTION_SWAP_MS);
    return () => clearTimeout(t);
  }, [view.idx, view.step]);

  // Aviso al tocar/arrastrar/usar la rueda antes de que esté listo.
  const [nudged, setNudged] = useState(false);
  const [ripples, setRipples] = useState([]);
  const hintTimerRef = useRef(null);
  const rippleIdRef = useRef(0);
  const rootRef = useRef(null);

  useEffect(() => () => clearTimeout(hintTimerRef.current), []);

  const nudge = (event) => {
    if (done) return;
    if (event && rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const id = ++rippleIdRef.current;
      setRipples((prev) => [...prev, { id, x: event.clientX - rect.left, y: event.clientY - rect.top }]);
    }
    setNudged(true);
    clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setNudged(false), HINT_MS);
  };

  const nudgeRef = useRef(nudge);
  nudgeRef.current = nudge;

  // React registra wheel como pasivo; para poder cancelarlo hay que ir directo.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const onWheel = (e) => { e.preventDefault(); nudgeRef.current(null); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pctLabel = indeterminate ? 'Cargando…' : `${pct}%`;
  const count = slides.length;
  const caption = slides[captionIdx]?.caption ?? '';

  const rootClass = [
    'viewer-loading-screen',
    hasMedia ? 'viewer-loading-screen--gallery' : '',
    nudged ? 'is-nudged' : '',
    done ? 'is-done' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={rootClass} onPointerDown={nudge} aria-busy={!done}>
      {hasMedia && (
        <>
          <div className="vls-media" aria-hidden="true">
            {slides.map((s, i) => {
              const active = i === view.idx;
              const prev = i === view.prev && view.prev !== view.idx;
              const key = active ? `a${view.step}` : prev ? `a${view.step - 1}` : 'idle';
              return (
                <figure key={s.url} className={`vls-slide${active ? ' is-active' : ''}${prev ? ' is-prev' : ''}`}>
                  <img key={key} src={s.url} alt="" draggable={false} />
                </figure>
              );
            })}
          </div>
          <div className="vls-scrim" aria-hidden="true" />
        </>
      )}

      {logoUrl && (
        <div className="vls-brand">
          <img
            className={`viewer-loading-screen__logo${hasMedia && darkLogo ? ' is-chip' : ''}`}
            src={logoUrl}
            alt=""
            draggable={false}
          />
        </div>
      )}

      {hasMedia ? (
        <div className="vls-panel">
          <div className={`vls-caption${captionSwapping ? ' is-swapping' : ''}`}>
            {count > 1 && <span className="vls-count">{pad2(captionIdx + 1)} / {pad2(count)}</span>}
            {caption && <span className="vls-cap">{caption}</span>}
          </div>
          <span className="vls-pill" role="progressbar" aria-valuenow={indeterminate ? undefined : pct} aria-valuemin={0} aria-valuemax={100}>
            <span className="vls-spinner" aria-hidden="true" />
            <span className="vls-pill__label">Preparando recorrido 360° · </span>
            <span className="vls-pill__label--short">Preparando 360° · </span>
            {pctLabel}
          </span>
          <div className={`vls-edge${indeterminate ? ' is-indet' : ''}`} aria-hidden="true">
            <div className="vls-edge__fill" style={indeterminate ? undefined : { width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <div className="viewer-loading-bar" role="progressbar" aria-valuenow={indeterminate ? undefined : pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`viewer-loading-bar__track${indeterminate ? ' viewer-loading-bar__track--indeterminate' : ''}`}>
            <div className="viewer-loading-bar__fill" style={indeterminate ? undefined : { width: `${pct}%` }} />
          </div>
          <span className="viewer-loading-bar__pct">{pctLabel}</span>
        </div>
      )}

      {ripples.map((r) => (
        <span
          key={r.id}
          className="vls-ripple"
          style={{ left: r.x, top: r.y }}
          onAnimationEnd={() => setRipples((prev) => prev.filter((x) => x.id !== r.id))}
        />
      ))}

      <div className={`vls-hint${nudged ? ' is-on' : ''}`} role="status" aria-live="polite">
        <svg className="vls-ring" viewBox="0 0 40 40" aria-hidden="true">
          <circle className="vls-ring__bg" cx="20" cy="20" r="17" />
          <circle
            className="vls-ring__fg"
            cx="20" cy="20" r="17"
            strokeDasharray={RING_LEN}
            strokeDashoffset={RING_LEN * (1 - pct / 100)}
          />
        </svg>
        <b>Todavía estamos preparando el recorrido</b>
        <span>{indeterminate ? 'Cargando…' : `${pct}% · en un momento entrás`}</span>
      </div>
    </div>
  );
}
