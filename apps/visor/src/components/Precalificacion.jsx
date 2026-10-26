import { useState, useEffect, useRef } from 'react';
import { trackEvent } from '../analytics.js';
import { API_BASE } from '../api/config.js';
import './Precalificacion.css';

// Formulario de precalificación de la ficha del lote (LotPanel/LotFloat) y su
// feedback de envío.

const PRE_CALIFICACION_URL = `${API_BASE}/public/pre-qualification`;

const IconWarning = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9.5" />
    <line x1="12" y1="7.5" x2="12" y2="13" />
    <circle cx="12" cy="16.3" r="1" fill="currentColor" stroke="none" />
  </svg>
);

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
