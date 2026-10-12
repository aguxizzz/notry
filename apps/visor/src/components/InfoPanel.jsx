import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { POI_ICON_MARKERS } from '../icons/poiIcons';
import { trackEvent } from '../analytics.js';

const IconLink = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBack = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
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

const IconWhatsApp = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/>
  </svg>
);

const IconRequest = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <path d="M14 2v6h6"/>
    <path d="M9 15h6"/>
    <path d="M9 18h4"/>
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

const PRE_CALIFICACION_URL = 'https://notry-back.vercel.app/api/v1/public/pre-qualification';

const ESTADO_CONFIG = {
  available: { accent: 'var(--estado-available-accent)', accentHover: 'var(--estado-available-accent-h)', label: 'Disponible' },
  unavailable: { accent: 'var(--estado-unavailable-accent)', accentHover: 'var(--estado-unavailable-accent-h)', label: 'No disponible' },
  sold:      { accent: 'var(--estado-sold-accent)',      accentHover: 'var(--estado-sold-accent-h)',      label: 'Vendido'    },
  reserved:  { accent: 'var(--estado-reserved-accent)',  accentHover: 'var(--estado-reserved-accent-h)',  label: 'Reservado'  },
};

// Set to true to re-enable price display
const SHOW_PRICE = false;
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

const formatPrice = (price) => {
  if (!price) return '';
  const num = parseFloat(price);
  if (isNaN(num)) return price;
  return `$${num.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const formatArea = (area) => {
  if (!area) return '';
  return `${area} m²`;
};

function PrecalificacionForm({ lotDetail, onClose, origin, loteoId }) {
  const [nombre, setNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [formError, setFormError] = useState('');
  const [submitStatus, setSubmitStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

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
    fetch(PRE_CALIFICACION_URL, {
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
      setSubmitStatus('success');
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
        {(lotDetail.price || lotDetail.area_m2 || lotDetail.estado) && (
          <div id="precal-detail-summary">
            <div id="precal-detail-meta">
              {lotDetail.area_m2 && (
                <div className="precal-meta-item">
                  <span className="precal-meta-label">Área</span>
                  <span className="precal-meta-value">{formatArea(lotDetail.area_m2)}</span>
                </div>
              )}
              {SHOW_PRICE && lotDetail.price && (
                <div className="precal-meta-item">
                  <span className="precal-meta-label">Precio</span>
                  <span className="precal-meta-value">{formatPrice(lotDetail.price)}</span>
                </div>
              )}
              {lotDetail.estado && ESTADO_CONFIG[lotDetail.estado] && (
                <div className="precal-meta-item" style={{ gridColumn: (SHOW_PRICE && lotDetail.price) && lotDetail.area_m2 ? '1 / -1' : 'auto' }}>
                  <span className="precal-meta-label">Estado</span>
                  <span className="precal-meta-value" style={{ color: ESTADO_CONFIG[lotDetail.estado].accent }}>
                    {ESTADO_CONFIG[lotDetail.estado].label}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} autoComplete="off">
          <label htmlFor="precal-nombre">Nombre completo</label>
          <input
            type="text"
            id="precal-nombre"
            name="nombre"
            placeholder="Ingrese su nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value.replace(/[^\p{L}\p{M}\s.'-]/gu, ''))}
            autoComplete="off"
            required
            minLength={2}
            maxLength={255}
            autoFocus
          />
          <label htmlFor="precal-numero">Número de teléfono</label>
          <input
            type="tel"
            id="precal-numero"
            name="numero"
            placeholder="Ingrese su número de teléfono"
            value={numero}
            onChange={(e) => setNumero(normalizePhoneInput(e.target.value))}
            autoComplete="off"
            required
            inputMode="tel"
            maxLength={25}
            pattern="\+?[0-9][0-9\s().-]*"
          />
          {formError && <p className="precal-form-error" role="alert">{formError}</p>}
          <button type="submit" className="btn-enviar" disabled={submitStatus !== 'idle'}>
            {submitStatus === 'loading' ? 'Enviando...' : 'Enviar solicitud'}
          </button>
        </form>
      </div>

      {submitStatus !== 'idle' && (
        <div className="precal-overlay">
          {submitStatus === 'loading' && (
            <div className="precal-feedback precal-loading">
              <svg className="spinner" xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              <span>Enviando...</span>
            </div>
          )}
          {submitStatus === 'success' && (
            <div className="precal-feedback precal-success">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>Solicitud enviada</span>
              <span className="precal-success-detail">Nos contactaremos a través de los datos proporcionados.</span>
              <button type="button" className="btn-cerrar" onClick={onClose}>Cerrar</button>
            </div>
          )}
          {submitStatus === 'error' && (
            <div className="precal-feedback precal-error">
              <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>Error enviando solicitud</span>
              <button type="button" className="btn-retry" onClick={() => setSubmitStatus('idle')}>Reintentar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Duration must match --t in index.css (0.28s)
const CLOSE_DURATION_MS = 280;

export function InfoPanel({ isOpen, title, content, markerId, detail = {}, origin, whatsappPhone, loteoId, onClose, onGoToStage }) {
  const [showForm, setShowForm] = useState(false);
  const [transDir, setTransDir] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);

  // Holds the frozen content shown during the close animation.
  // Update synchronously when opening to ensure content shows on first render.
  const displayRef = useRef({ title, content, markerId, detail });
  if (isOpen) {
    displayRef.current = { title, content, markerId, detail };
  }

  useLayoutEffect(() => {
    // This effect ensures displayRef is updated even if the panel doesn't fully open
    // (though it should already be updated synchronously above for the first render)
    if (isOpen) {
      displayRef.current = { title, content, markerId, detail };
    }
  }, [isOpen, title, content, markerId, detail]);

  useEffect(() => {
    if (!isOpen) {
      // Signal that the panel is closing — freeze showForm so the form
      // stays mounted for the entire duration of the CSS close animation.
      setIsClosing(true);
      const timer = setTimeout(() => {
        closingRef.current = false;
        setIsClosing(false);
        setShowForm(false);
        setTransDir(null);
      }, CLOSE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isClosing && isOpen) {
      setShowForm(false);
      setTransDir(null);
    }
  }, [markerId, isClosing, isOpen]);

  const goToForm = () => {
    setTransDir('forward');
    setShowForm(true);
    trackEvent(loteoId, 'form_open', { type: 'lote', id: displayRef.current.markerId });
  };
  const goBack  = () => { setTransDir('back');    setShowForm(false); };
  const wrappedOnClose = () => { closingRef.current = true; onClose(); };

  const display = displayRef.current;

  const estadoKey = display.detail?.estado;
  const estadoCfg = ESTADO_CONFIG[estadoKey] ?? null;
  const isPoi = display.detail?.type === 'poi';
  const isPhotoPoi = isPoi && !!display.detail?.image_url;

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
    target_loteo_id: display.detail?.target_loteo_id ?? null,
    target_stage_name: display.detail?.target_stage_name ?? null,
    content: display.content ?? '',
  };

  // panelAccentStyle kept minimal — header is always white with gold top-bar;
  // metric card borders use the global --accent (gold), not estado colors.
  const panelAccentStyle = {};

  return (
    <div
      id="info-backdrop"
      className={isOpen ? 'visible' : ''}
      onClick={(e) => { if (e.target === e.currentTarget) { closingRef.current = true; onClose(); } }}
    >
      <div id="info-panel" className={isPhotoPoi ? 'info-panel-photo' : undefined} role="dialog" aria-modal="true" aria-live="polite" style={panelAccentStyle}>

        <header id="info-panel-header">
          <div id="info-panel-header-left">
            {showForm && (
              <button
                type="button"
                id="info-panel-back"
                aria-label="Volver al detalle"
                onClick={goBack}
              >
                <IconBack />
              </button>
            )}
          </div>
          <div id="info-panel-header-center">
            <span id="info-panel-lot-title">{display.title}</span>
            {!showForm && estadoCfg && (
              <span className="estado-badge" data-estado={estadoKey}>
                {estadoCfg.label}
              </span>
            )}
            {showForm && (
              <span id="info-panel-form-title-header">Solicitud</span>
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
          {showForm ? (
            <PrecalificacionForm key={display.markerId} lotDetail={lotDetail} origin={origin} loteoId={loteoId} onClose={wrappedOnClose} />
          ) : isPoi ? (
            <div id="info-panel-view">
              {poiDetail.image_url ? (
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
            <div
              id="info-panel-view"
              className={transDir === 'back' ? 'anim-from-left' : ''}
            >
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

              {display.detail?.estado === 'available' && display.markerId && display.detail?.estado !== 'sold' && display.detail?.estado !== 'reserved' && (
                <>
                  <div className="lote-status-available">
                    ¡Este lote está disponible! Solicita más información y te contactamos pronto.
                  </div>
                  <div id="info-actions">
                    <button type="button" onClick={goToForm} className="btn-request">
                      <IconRequest />
                      <span>Solicitar contacto</span>
                    </button>
                    {whatsappPhone && (
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
                    )}
                  </div>
                  {/*
                  <div className="lote-financing">
                    Excelente financiación
                  </div>
                  */}
                </>
              )}

              {/*
              <div className="lote-amenities">
                <div className="amenity-item">
                  <IconWater />
                  <span>Red de agua</span>
                </div>
                <div className="amenity-item">
                  <IconGas />
                  <span>Red de gas</span>
                </div>
                <div className="amenity-item">
                  <IconElectricity />
                  <span>Energía eléctrica</span>
                </div>
                <div className="amenity-item">
                  <IconSecurity />
                  <span>Seguridad 24hs</span>
                </div>
                <div className="amenity-item">
                  <IconLighting />
                  <span>Iluminación LED</span>
                </div>
                <div className="amenity-item">
                  <IconWaste />
                  <span>Recolección</span>
                </div>
              </div>
              */}

              {display.detail?.comments && (
                <div className="lote-comments">
                  <span className="lote-comments-label">Detalles del lote</span>
                  <span className="lote-comments-text">{display.detail.comments}</span>
                </div>
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

      </div>
    </div>
  );
}
