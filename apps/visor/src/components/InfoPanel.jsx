import { useState, useEffect } from 'react';

const PRE_CALIFICACION_URL = 'https://ejemplo.com/api/lote/pre-calificacion';

function PrecalificacionForm({ lotDetail, onClose }) {
  const [nombre, setNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [presupuesto, setPresupuesto] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    fetch(PRE_CALIFICACION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lotDetail.markerId, nombre, numero, presupuesto }),
    }).catch((err) => console.warn('POST pre calificación:', err));
    onClose();
  };

  return (
    <div className="info-panel-form">
      {(lotDetail.precio || lotDetail.area) && (
        <div id="precal-detail-summary">
          <div id="precal-detail-meta">
            {lotDetail.precio && (
              <div className="precal-meta-item">
                <span className="precal-meta-label">Precio</span>
                <span className="precal-meta-value">{lotDetail.precio}</span>
              </div>
            )}
            {lotDetail.area && (
              <div className="precal-meta-item">
                <span className="precal-meta-label">Área</span>
                <span className="precal-meta-value">{lotDetail.area}</span>
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
          type="text"
          id="precal-presupuesto"
          name="presupuesto"
          placeholder="Ej. 50.000.000"
          value={presupuesto}
          onChange={(e) => setPresupuesto(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="btn-enviar">Enviar solicitud</button>
      </form>
    </div>
  );
}

export function InfoPanel({ isOpen, title, content, markerId, detail = {}, onClose }) {
  const [showForm, setShowForm] = useState(false);
  const [transDir, setTransDir] = useState(null);

  useEffect(() => {
    if (!isOpen) { setShowForm(false); setTransDir(null); }
  }, [isOpen]);

  useEffect(() => {
    setShowForm(false);
    setTransDir(null);
  }, [markerId]);

  const goToForm = () => { setTransDir('forward'); setShowForm(true); };
  const goBack  = () => { setTransDir('back');    setShowForm(false); };

  const lotDetail = {
    title: title ?? '',
    markerId,
    precio: detail.precio != null ? String(detail.precio).trim() : '',
    area:   detail.area   != null ? String(detail.area).trim()   : '',
  };

  return (
    <div
      id="info-backdrop"
      className={isOpen ? 'visible' : ''}
      aria-hidden={!isOpen}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div id="info-panel" role="dialog" aria-modal="true" aria-live="polite">

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
              ? <span className="info-panel-form-title">Solicitud: {title}</span>
              : <span id="info-panel-lot-title">{title}</span>
            }
          </div>
          <div id="info-panel-header-right">
            <button type="button" id="info-panel-close" aria-label="Cerrar" onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        <div id="info-panel-content">
          {!showForm ? (
            <div
              id="info-panel-view"
              className={transDir === 'back' ? 'anim-from-left' : ''}
            >
              <div id="info-content" dangerouslySetInnerHTML={{ __html: content ?? '' }} />
              {markerId && (
                <div id="info-actions">
                  <button type="button" onClick={goToForm}>
                    Pre calificación
                  </button>
                </div>
              )}
            </div>
          ) : (
            <PrecalificacionForm key={markerId} lotDetail={lotDetail} onClose={onClose} />
          )}
        </div>

      </div>
    </div>
  );
}
