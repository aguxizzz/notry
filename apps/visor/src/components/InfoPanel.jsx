import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { POI_ICON_MARKERS } from '../icons/poiIcons';
import { trackEvent } from '../analytics.js';
import { API_BASE } from '../api/config.js';

const IconLink = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const IconWarning = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9.5" />
    <line x1="12" y1="7.5" x2="12" y2="13" />
    <circle cx="12" cy="16.3" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconDistance = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

const IconRuler = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/>
    <path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/>
  </svg>
);

const IconDollar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

export const IconWhatsApp = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/>
  </svg>
);

const IconWater = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </svg>
);

const IconGas = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v10"/><path d="M8 6v4"/><path d="M16 6v4"/><path d="M12 12c-3 0-6 2-6 6v2h12v-2c0-4-3-6-6-6Z"/>
  </svg>
);

const IconElectricity = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);

const IconSecurity = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);

const IconLighting = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.23A4.485 4.485 0 0 0 18 8 4.5 4.5 0 0 0 13.5 2a4.5 4.5 0 0 0-4 6c0 1.89 1.16 3.31 2.91 4.04"/>
  </svg>
);

const IconWaste = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
  </svg>
);

export const SERVICE_DEFS = {
  water: { label: 'Agua potable', Icon: IconWater },
  electricity: { label: 'Luz eléctrica', Icon: IconElectricity },
  gas: { label: 'Gas', Icon: IconGas },
  lighting: { label: 'Alumbrado público', Icon: IconLighting },
  security: { label: 'Seguridad', Icon: IconSecurity },
  waste: { label: 'Recolección de residuos', Icon: IconWaste },
};

const PRE_CALIFICACION_URL = `${API_BASE}/public/pre-qualification`;

const ESTADO_CONFIG = {
  available: { accent: 'var(--estado-available-accent)', accentHover: 'var(--estado-available-accent-h)', label: 'Disponible' },
  unavailable: { accent: 'var(--estado-unavailable-accent)', accentHover: 'var(--estado-unavailable-accent-h)', label: 'No disponible' },
  sold:      { accent: 'var(--estado-sold-accent)',      accentHover: 'var(--estado-sold-accent-h)',      label: 'Vendido'    },
  reserved:  { accent: 'var(--estado-reserved-accent)',  accentHover: 'var(--estado-reserved-accent-h)',  label: 'Reservado'  },
};

// Set to true to re-enable price display
export const SHOW_PRICE = false;
const PHONE_ALLOWED = /^\+?[0-9][0-9\s().-]*$/;
const PERSON_NAME_ALLOWED = /^[\p{L}][\p{L}\p{M}\s.'-]*$/u;

const normalizePhoneInput = (value) => String(value ?? '').replace(/[^0-9+\s().-]/g, '');
const isValidPhone = (value) => {
  const phone = String(value ?? '').trim();
  const digits = phone.replace(/\D/g, '');
  return PHONE_ALLOWED.test(phone) && digits.length >= 7 && digits.length <= 15;
};
const isValidPersonName = (value) => {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 255 && PERSON_NAME_ALLOWED.test(name);
};

const SUBMITTED_LOTS_KEY = 'notry_precal_submitted';

export const getSubmittedLotsSet = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(SUBMITTED_LOTS_KEY));
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
};

export const markLotAsSubmitted = (key) => {
  try {
    const set = getSubmittedLotsSet();
    set.add(key);
    localStorage.setItem(SUBMITTED_LOTS_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage no disponible (modo privado, etc.) — no bloqueante
  }
};

export const formatPrice = (price) => {
  if (!price) return '';
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatArea = (area) => {
  if (!area) return '';
  return `${area} m²`;
};

const formatDistance = (value, unit) => {
  if (value == null || value === '') return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  const rounded = Number.isInteger(num) ? num : Math.round(num * 10) / 10;
  return unit === 'min' ? `${rounded} min en auto` : `${rounded} km`;
};

// Datos de ejemplo para el modo showcase (grabación) — evita tener que
// tipear en cámara, el operador solo hace click.
const SHOWCASE_NOMBRE = 'Juan Pérez';
const SHOWCASE_NUMERO = '+54 9 11 5555-0123';

export function PrecalificacionForm({ lotDetail, onClose, origin, loteoId, submitStatus, setSubmitStatus, onSubmitted, showcase = false }) {
  const [nombre, setNombre] = useState(showcase ? SHOWCASE_NOMBRE : '');
  const [numero, setNumero] = useState(showcase ? SHOWCASE_NUMERO : '');
  const [formError, setFormError] = useState('');
  const timeoutRef = useRef(null);
  const hasTrackedOpenRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const trackFirstInteraction = () => {
    if (hasTrackedOpenRef.current) return;
    hasTrackedOpenRef.current = true;
    trackEvent(loteoId, 'form_open', { type: 'lote', id: lotDetail.markerId });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (lotDetail.estado !== 'available') { onClose(); return; }
    if (!isValidPersonName(nombre)) {
      setFormError('Ingresá un nombre válido, sin números ni símbolos.');
      return;
    }
    if (!isValidPhone(numero)) {
      setFormError('Ingresá un teléfono válido de entre 7 y 15 dígitos.');
      return;
    }
    setFormError('');
    setSubmitStatus('loading');

    // Showcase: nunca pegarle al backend real — se simula el mismo timing
    // (loading → success) para que la animación se vea igual en la grabación.
    const submitPromise = showcase
      ? new Promise((resolve) => { timeoutRef.current = setTimeout(resolve, 900); })
      : fetch(PRE_CALIFICACION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lote_id: lotDetail.markerId,
            name: nombre,
            phone: numero,
            origin,
          }),
        }).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        });

    submitPromise.then(() => {
      setSubmitStatus('success');
      onSubmitted();
      trackEvent(loteoId, 'form_submit', { type: 'lote', id: lotDetail.markerId });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => onClose(), 7000);
    }).catch(() => {
      setSubmitStatus('error');
    });
  };

  return (
    <div className="info-panel-form">
      <div className="precal-form-inner" style={{ opacity: submitStatus !== 'idle' ? 0.35 : 1, pointerEvents: submitStatus === 'error' ? 'none' : 'auto', transition: 'opacity 0.2s' }}>
        <form onSubmit={handleSubmit} autoComplete="off">
          <label htmlFor="precal-nombre">Nombre completo</label>
          <input
            type="text"
            id="precal-nombre"
            name="nombre"
            placeholder="Ingrese su nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value.replace(/[^\p{L}\p{M}\s.'-]/gu, ''))}
            onFocus={trackFirstInteraction}
            autoComplete="off"
            required
            minLength={2}
            maxLength={255}
          />
          <label htmlFor="precal-numero">Número de teléfono</label>
          <input
            type="tel"
            id="precal-numero"
            name="numero"
            placeholder="Ingrese su número de teléfono"
            value={numero}
            onChange={(e) => setNumero(normalizePhoneInput(e.target.value))}
            onFocus={trackFirstInteraction}
            autoComplete="off"
            required
            inputMode="tel"
            maxLength={25}
            pattern="\+?[0-9][0-9\s().-]*"
          />
          {formError && (
            <p className="precal-form-error" role="alert">
              <IconWarning />
              <span>{formError}</span>
            </p>
          )}
          <button type="submit" className="btn-enviar" disabled={submitStatus !== 'idle'}>
            {submitStatus === 'loading' ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Feedback de envío (loading/success/error) — se renderiza cubriendo todo
// el panel, no solo la sección del form.
export function PrecalificacionOverlay({ submitStatus, setSubmitStatus, onClose }) {
  if (submitStatus === 'idle') return null;
  return (
    <div className="precal-overlay">
      {submitStatus === 'loading' && (
        <div className="precal-feedback precal-loading">
          <div className="precal-badge precal-badge--loading">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <circle className="precal-badge-track" cx="22" cy="22" r="18" strokeWidth="3.5" />
              <circle className="precal-badge-arc" cx="22" cy="22" r="18" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="34 200" />
            </svg>
          </div>
          <span className="precal-feedback-title">Enviando solicitud</span>
          <span className="precal-feedback-detail">Estamos procesando tus datos, un momento.</span>
        </div>
      )}
      {submitStatus === 'success' && (
        <div className="precal-feedback precal-success">
          <div className="precal-badge precal-badge--success">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path className="precal-check" d="M6 12.5l4 4 8-9" />
            </svg>
          </div>
          <span className="precal-feedback-title">Solicitud enviada</span>
          <span className="precal-feedback-detail">Nos contactaremos a través de los datos proporcionados.</span>
          <button type="button" className="btn-cerrar" onClick={onClose}>Cerrar</button>
        </div>
      )}
      {submitStatus === 'error' && (
        <div className="precal-feedback precal-error">
          <div className="precal-badge precal-badge--error">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <circle cx="12" cy="12" r="9.5" />
              <line x1="12" y1="7.5" x2="12" y2="13" strokeLinecap="round" />
              <circle cx="12" cy="16.3" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <span className="precal-feedback-title">No pudimos enviar tu solicitud</span>
          <span className="precal-feedback-detail">Verificá tu conexión e intentá nuevamente.</span>
          <button type="button" className="btn-retry" onClick={() => setSubmitStatus('idle')}>Reintentar</button>
        </div>
      )}
    </div>
  );
}

// Duration must match --t in index.css (0.28s)
const CLOSE_DURATION_MS = 280;

export function InfoPanel({ isOpen, title, content, markerId, detail = {}, docked = false, services = null, origin, whatsappPhone, hideContactForm = false, loteoId, onClose, onGoToStage, showcase = false }) {
  const [isClosing, setIsClosing] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [submitStatus, setSubmitStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const [submittedLots, setSubmittedLots] = useState(getSubmittedLotsSet);
  const closingRef = useRef(false);

  // Holds the frozen content shown during the close animation.
  // Update synchronously when opening to ensure content shows on first render.
  const displayRef = useRef({ title, content, markerId, detail, services, docked });
  if (isOpen) {
    displayRef.current = { title, content, markerId, detail, services, docked };
  }

  useLayoutEffect(() => {
    // This effect ensures displayRef is updated even if the panel doesn't fully open
    // (though it should already be updated synchronously above for the first render)
    if (isOpen) {
      displayRef.current = { title, content, markerId, detail, services, docked };
    }
  }, [isOpen, title, content, markerId, detail, services, docked]);

  useEffect(() => {
    if (!isOpen) {
      // Signal that the panel is closing — freeze content so it stays mounted
      // for the entire duration of the CSS close animation.
      setIsClosing(true);
      const timer = setTimeout(() => {
        closingRef.current = false;
        setIsClosing(false);
      }, CLOSE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isClosing && isOpen) {
      setActiveImageIndex(0);
      setSubmitStatus('idle');
    }
  }, [markerId, isClosing, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { closingRef.current = true; onClose(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const wrappedOnClose = () => { closingRef.current = true; onClose(); };

  const display = displayRef.current;

  const estadoKey = display.detail?.estado;
  const estadoCfg = ESTADO_CONFIG[estadoKey] ?? null;
  const isPoi = display.detail?.type === 'poi';
  const poiKind = display.detail?.poi_kind ?? 'place';
  // Solo el poi_kind "perspective" abre la foto a pantalla completa al click;
  // "place" (default) muestra el thumbnail en el marker y el panel de texto.
  const isPhotoPoi = isPoi && !!display.detail?.image_url && poiKind === 'perspective';
  const images = !isPoi && Array.isArray(display.detail?.image_urls) ? display.detail.image_urls : [];
  const hasGallery = images.length > 0;
  const safeImageIndex = Math.min(activeImageIndex, Math.max(images.length - 1, 0));

  const visibleServices = !isPoi && Array.isArray(display.services)
    ? display.services.filter((s) => (s?.estado === 'available' || s?.estado === 'in_progress') && SERVICE_DEFS[s?.tipo])
    : [];
  const hasServices = visibleServices.length > 0;

  // Swipe horizontal sobre la galería (táctil): cambia de imagen.
  const swipeStartRef = useRef(null);
  const handleGalleryTouchStart = (e) => {
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleGalleryTouchEnd = (e) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || images.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setActiveImageIndex(Math.min(Math.max(safeImageIndex + (dx < 0 ? 1 : -1), 0), images.length - 1));
  };

  const lotDetail = {
    title: display.title ?? '',
    markerId: display.markerId,
    price: display.detail?.price != null ? String(display.detail.price).trim() : '',
    area_m2: display.detail?.area_m2 != null ? String(display.detail.area_m2).trim() : '',
    estado: estadoKey ?? '',
    comments: display.detail?.comments ?? null,
  };

  const poiDetail = {
    title: display.title ?? '',
    markerId: display.markerId,
    icon_type: display.detail?.icon_type ?? null,
    link_url: display.detail?.link_url ?? null,
    color: display.detail?.color ?? '#14b8a6',
    image_url: display.detail?.image_url ?? null,
    poi_kind: poiKind,
    distance_value: display.detail?.distance_value ?? null,
    distance_unit: display.detail?.distance_unit ?? null,
    target_loteo_id: display.detail?.target_loteo_id ?? null,
    target_stage_name: display.detail?.target_stage_name ?? null,
    content: display.content ?? '',
  };

  const submittedLotKey = display.markerId != null ? `${loteoId}:${display.markerId}` : null;
  const isAlreadySubmitted = submittedLotKey != null && submittedLots.has(submittedLotKey);

  // panelAccentStyle kept minimal — header is always white with gold top-bar;
  // metric card borders use the global --accent (gold), not estado colors.
  const panelAccentStyle = {};

  return (
    <div
      id="info-backdrop"
      className={`${isOpen ? 'visible' : ''}${display.docked ? ' docked' : ''}`}
      onClick={(e) => { if (e.target === e.currentTarget) { closingRef.current = true; onClose(); } }}
    >
      <div id="info-panel-wrap" className={hasGallery ? 'has-gallery' : undefined}>
        {hasGallery && (
          <div id="info-panel-gallery" onTouchStart={handleGalleryTouchStart} onTouchEnd={handleGalleryTouchEnd}>
            <div id="info-gallery-stage">
              <img src={images[safeImageIndex]} alt={`${display.title || 'Lote'} - imagen ${safeImageIndex + 1}`} draggable={false} />
            </div>
            {images.length > 1 && (
              <div id="info-gallery-tabs">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === safeImageIndex ? 'active' : ''}
                    onClick={() => setActiveImageIndex(i)}
                    aria-label={`Ver imagen ${i + 1}`}
                    aria-current={i === safeImageIndex}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div id="info-panel" className={isPhotoPoi ? 'info-panel-photo' : undefined} role="dialog" aria-modal={display.docked ? undefined : 'true'} aria-live="polite" style={panelAccentStyle}>

        <header id="info-panel-header">
          <div id="info-panel-header-left" />
          <div id="info-panel-header-center">
            <span id="info-panel-lot-title">{display.title}</span>
            {estadoCfg && (
              <span className="estado-badge" data-estado={estadoKey}>
                {estadoCfg.label}
              </span>
            )}
          </div>
          <div id="info-panel-header-right">
            <button type="button" id="info-panel-close" aria-label="Cerrar" onClick={() => { closingRef.current = true; onClose(); }}>
              <span className="sr-only">Cerrar</span>
              <IconClose />
            </button>
          </div>
        </header>

        <div id="info-panel-content">
          {isPoi ? (
            <div id="info-panel-view">
              {isPhotoPoi ? (
                <figure className="poi-photo-view">
                  <img src={poiDetail.image_url} alt={poiDetail.title || 'Foto del lugar'} />
                </figure>
              ) : (
                <>
              <div className="poi-header">
                {poiDetail.icon_type && POI_ICON_MARKERS[poiDetail.icon_type] && (
                  <div className="poi-icon-wrap" style={{ background: poiDetail.color }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={POI_ICON_MARKERS[poiDetail.icon_type]} />
                    </svg>
                  </div>
                )}
                <div className="poi-header-text">
                  <span className="poi-label">Punto de interés</span>
                  {poiDetail.icon_type && (
                    <span className="poi-type-tag">{poiDetail.icon_type}</span>
                  )}
                </div>
              </div>
              {formatDistance(poiDetail.distance_value, poiDetail.distance_unit) && (
                <div className="poi-distance">
                  <IconDistance />
                  <span>{formatDistance(poiDetail.distance_value, poiDetail.distance_unit)}</span>
                </div>
              )}
              {poiDetail.content && (
                <div id="info-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(poiDetail.content) }} />
              )}
              {poiDetail.target_loteo_id && onGoToStage ? (
                <div id="info-actions">
                  <button
                    type="button"
                    className="poi-link-btn"
                    onClick={() => onGoToStage(poiDetail.target_loteo_id)}
                  >
                    <IconLink />
                    {poiDetail.target_stage_name ? `Ir a ${poiDetail.target_stage_name}` : 'Ir a la etapa'}
                  </button>
                </div>
              ) : poiDetail.link_url ? (
                <div id="info-actions">
                  <a
                    href={poiDetail.link_url}
                    target="_self"
                    className="poi-link-btn"
                  >
                    <IconLink />
                    Visitar enlace
                  </a>
                </div>
              ) : !poiDetail.content ? (
                <div className="poi-empty-state">Sin información adicional.</div>
              ) : null}
                </>
              )}
            </div>
          ) : (
            <div id="info-panel-view">
              {((SHOW_PRICE && display.detail?.price) || display.detail.area_m2) && (
                <div className="lote-specs">
                  {display.detail.area_m2 && (
                    <div className="lote-spec-item" style={!SHOW_PRICE ? { gridColumn: '1 / -1' } : undefined}>
                      <span className="lote-spec-icon"><IconRuler /></span>
                      <div className="lote-spec-text">
                        <span className="lote-spec-label">Superficie</span>
                        <span className="lote-spec-value">{formatArea(display.detail.area_m2)}</span>
                      </div>
                    </div>
                  )}
                  {SHOW_PRICE && display.detail.price && (
                    <div className="lote-spec-item">
                      <span className="lote-spec-icon"><IconDollar /></span>
                      <div className="lote-spec-text">
                        <span className="lote-spec-label">Precio</span>
                        <span className="lote-spec-value">{formatPrice(display.detail.price)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {display.detail?.comments && (
                <div className="lote-comments">
                  <span className="lote-comments-label">Detalles del lote</span>
                  <span className="lote-comments-text">{display.detail.comments}</span>
                </div>
              )}

              {hasServices && (
                <ul className="lote-services" aria-label="Servicios del loteo">
                  {visibleServices.map((sv) => {
                    const def = SERVICE_DEFS[sv.tipo];
                    const Icon = def.Icon;
                    const statusText = sv.estado === 'in_progress' ? 'En obras' : 'Disponible';
                    return (
                      <li key={sv.tipo} className={`service-row is-${sv.estado}`}>
                        <Icon />
                        <span className="service-row__label">{def.label}</span>
                        <span className="service-row__status">{statusText}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {display.detail?.estado === 'available' && display.markerId && (
                <>
                  {hideContactForm ? (
                    <div className="lote-status-available">
                      ¡Este lote está disponible! Escribinos por WhatsApp para más información.
                    </div>
                  ) : isAlreadySubmitted ? (
                    <div className="lote-status-available lote-status-submitted">
                      Ya enviaste una solicitud para este lote. Nos pondremos en contacto a la brevedad — no hace falta enviarla de nuevo.
                    </div>
                  ) : (
                    <>
                      <div className="lote-status-available">
                        ¡Este lote está disponible! Solicita más información y te contactamos pronto.
                      </div>
                      <PrecalificacionForm
                        key={display.markerId}
                        lotDetail={lotDetail}
                        origin={origin}
                        loteoId={loteoId}
                        onClose={wrappedOnClose}
                        submitStatus={submitStatus}
                        setSubmitStatus={setSubmitStatus}
                        onSubmitted={() => {
                          markLotAsSubmitted(submittedLotKey);
                          setSubmittedLots((prev) => new Set(prev).add(submittedLotKey));
                        }}
                        showcase={showcase}
                      />
                    </>
                  )}
                  {whatsappPhone && (
                    <div id="info-actions">
                      <a
                        href={`https://wa.me/${whatsappPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola, me interesa el lote ${display.title}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-wa-direct"
                        onClick={() => trackEvent(loteoId, 'whatsapp_click', { type: 'lote', id: display.markerId })}
                      >
                        <IconWhatsApp />
                        <span>Escribir por WhatsApp</span>
                      </a>
                    </div>
                  )}
                </>
              )}

              {display.detail?.estado === 'sold' || display.detail?.estado === 'reserved' || display.detail?.estado === 'unavailable' ? (
                <div className="lote-status-unavailable">
                  {display.detail?.estado === 'sold'
                    ? 'Este lote ya fue vendido'
                    : display.detail?.estado === 'reserved'
                      ? 'Este lote está reservado'
                      : 'Este lote aún no está disponible.'}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <PrecalificacionOverlay submitStatus={submitStatus} setSubmitStatus={setSubmitStatus} onClose={wrappedOnClose} />

        </div>

      </div>
    </div>
  );
}
