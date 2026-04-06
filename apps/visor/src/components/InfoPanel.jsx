import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

const IconRuler = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/>
    <path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/>
  </svg>
);

const IconDollar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);

const PRE_CALIFICACION_URL = 'https://notry-back.onrender.com/api/v1/public/pre-qualification';

const ESTADO_CONFIG = {
  available: { accent: '#1e6e3e', accentHover: '#175c33', label: 'Disponible' },
  sold:      { accent: '#a82828', accentHover: '#8e2020', label: 'Vendido'    },
  reserved:  { accent: '#1e4d8c', accentHover: '#173f75', label: 'Reservado'  },
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

function PrecalificacionForm({ lotDetail, onClose }) {
  const [nombre, setNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [presupuesto, setPresupuesto] = useState('');
  const [metodoPago, setMetodoPago] = useState('contado');
  const [submitStatus, setSubmitStatus] = useState('idle'); // 'idle' | 'loading' | 'success' | 'error'

  const handleSubmit = (e) => {
    e.preventDefault();
    if (lotDetail.estado === 'sold') { onClose(); return; }
    setSubmitStatus('loading');
    fetch(PRE_CALIFICACION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lote_id: lotDetail.markerId,
        name: nombre,
        phone: numero,
        budget: Number(presupuesto) || 0,
        payment_method: metodoPago,
      }),
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmitStatus('success');
      setTimeout(() => onClose(), 7000);
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
              {lotDetail.price && (
                <div className="precal-meta-item">
                  <span className="precal-meta-label">Precio</span>
                  <span className="precal-meta-value">{formatPrice(lotDetail.price)}</span>
                </div>
              )}
              {lotDetail.area_m2 && (
                <div className="precal-meta-item">
                  <span className="precal-meta-label">Área</span>
                  <span className="precal-meta-value">{formatArea(lotDetail.area_m2)}</span>
                </div>
              )}
              {lotDetail.estado && ESTADO_CONFIG[lotDetail.estado] && (
                <div className="precal-meta-item" style={{ gridColumn: lotDetail.price && lotDetail.area_m2 ? '1 / -1' : 'auto' }}>
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
          <label htmlFor="precal-nombre">Nombre</label>
          <input
            type="text"
            id="precal-nombre"
            name="nombre"
            placeholder="Ingrese su nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoComplete="off"
            required
            autoFocus
          />
          <label htmlFor="precal-numero">Número</label>
          <input
            type="text"
            id="precal-numero"
            name="numero"
            placeholder="Ingrese su número"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            autoComplete="off"
            required
          />
          <label htmlFor="precal-presupuesto">Presupuesto</label>
          <input
            type="number"
            id="precal-presupuesto"
            name="presupuesto"
            placeholder="Ej. 50000000"
            value={presupuesto}
            onChange={(e) => setPresupuesto(e.target.value)}
            autoComplete="off"
            min="0"
          />
          <label htmlFor="precal-metodo-pago">Método de pago</label>
          <select
            id="precal-metodo-pago"
            name="metodoPago"
            value={metodoPago}
            onChange={(e) => setMetodoPago(e.target.value)}
            disabled={submitStatus !== 'idle'}
          >
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
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

export function InfoPanel({ isOpen, title, content, markerId, detail = {}, onClose }) {
  const [showForm, setShowForm] = useState(false);
  const [transDir, setTransDir] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);

  // Freeze displayed content while the panel is closing so the close animation
  // plays with the content still visible, not an empty shell.
  const displayRef = useRef({ title: '', content: '', markerId: null, detail: {} });
  if (isOpen) {
    displayRef.current = { title, content, markerId, detail };
  }
  const display = displayRef.current;

  useEffect(() => {
    if (!isOpen) {
      // Signal that the panel is closing — freeze showForm so the form
      // stays mounted for the entire duration of the CSS close animation.
      setIsClosing(true);
      const timer = setTimeout(() => {
        // Animation complete; reset everything.
        closingRef.current = false;
        setIsClosing(false);
        setShowForm(false);
        setTransDir(null);
      }, CLOSE_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    // Only reset form when marker changes AND panel is open and NOT mid-close-animation.
    // This prevents resetting showForm while the CSS close animation is playing.
    if (!isClosing && isOpen) {
      setShowForm(false);
      setTransDir(null);
    }
  }, [markerId, isClosing, isOpen]);

  const goToForm = () => { setTransDir('forward'); setShowForm(true); };
  const goBack  = () => { setTransDir('back');    setShowForm(false); };
  const wrappedOnClose = () => { closingRef.current = true; onClose(); };

  const estadoKey = display.detail?.estado;
  const estadoCfg = ESTADO_CONFIG[estadoKey] ?? null;

  const lotDetail = {
    title: display.title ?? '',
    markerId: display.markerId,
    price: display.detail?.price != null ? String(display.detail.price).trim() : '',
    area_m2: display.detail?.area_m2 != null ? String(display.detail.area_m2).trim() : '',
    estado: estadoKey ?? '',
  };

  const panelAccentStyle = estadoCfg
    ? { '--accent': estadoCfg.accent, '--accent-hover': estadoCfg.accentHover, '--panel-header-bg': estadoCfg.accent }
    : {};

  return (
    <div
      id="info-backdrop"
      className={isOpen ? 'visible' : ''}
      aria-hidden={!isOpen}
      onClick={(e) => { if (e.target === e.currentTarget) { closingRef.current = true; onClose(); } }}
    >
      <div id="info-panel" role="dialog" aria-modal="true" aria-live="polite" style={panelAccentStyle}>

        <header id="info-panel-header">
          <div id="info-panel-header-left">
            {showForm && (
              <button
                type="button"
                id="info-panel-back"
                aria-label="Volver al detalle"
                onClick={goBack}
              />
            )}
          </div>
          <div id="info-panel-header-center">
            {showForm
              ? <span className="info-panel-form-title">Solicitud: {display.title}</span>
              : <span id="info-panel-lot-title">{display.title}</span>
            }
          </div>
          <div id="info-panel-header-right">
            <button type="button" id="info-panel-close" aria-label="Cerrar" onClick={() => { closingRef.current = true; onClose(); }}>
              ×
            </button>
          </div>
        </header>

        <div id="info-panel-content">
          {showForm ? (
            <PrecalificacionForm key={display.markerId} lotDetail={lotDetail} onClose={wrappedOnClose} />
          ) : (
            <div
              id="info-panel-view"
              className={transDir === 'back' ? 'anim-from-left' : ''}
            >
              {estadoCfg && (
                <div className="estado-badge" style={{ background: estadoCfg.accent }}>
                  {estadoCfg.label}
                </div>
              )}
              {(display.detail?.price || display.detail.area_m2) && (
                <div className="lote-metrics">
                  {display.detail.price && (
                    <div className="lote-metric-card">
                      <span className="lote-metric-icon"><IconDollar /></span>
                      <span className="lote-metric-label">Precio</span>
                      <span className="lote-metric-value">{formatPrice(display.detail.price)}</span>
                    </div>
                  )}
                  {display.detail.area_m2 && (
                    <div className="lote-metric-card">
                      <span className="lote-metric-icon"><IconRuler /></span>
                      <span className="lote-metric-label">Área</span>
                      <span className="lote-metric-value">{formatArea(display.detail.area_m2)}</span>
                    </div>
                  )}
                </div>
              )}
              {display.content && (
                <div id="info-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(display.content) }} />
              )}
              {display.markerId && display.detail?.estado !== 'sold' && (
                <div id="info-actions">
                  <button type="button" onClick={goToForm}>
                    Quiero este lote
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
