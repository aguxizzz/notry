import { useState, useEffect } from 'react';

const PRE_CALIFICACION_URL = 'https://ejemplo.com/api/lote/pre-calificacion';

/**
 * Subcomponente del formulario de pre calificación.
 */
function PrecalificacionForm({ lotDetail, onBack, onClose }) {
  const [nombre, setNombre] = useState('');
  const [numero, setNumero] = useState('');
  const [presupuesto, setPresupuesto] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!nombre && !numero) return;

    fetch(PRE_CALIFICACION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lotDetail.markerId, nombre, numero, presupuesto }),
    }).catch((err) => console.warn('POST pre calificación:', err));

    onClose();
  };

  const metaParts = [];
  if (lotDetail.precio) metaParts.push(`Precio: ${lotDetail.precio}`);
  if (lotDetail.area) metaParts.push(`Área: ${lotDetail.area}`);

  return (
    <div id="info-panel-form" className="info-panel-form visible">
      <div id="precal-detail-summary">
        <div id="precal-detail-title">{lotDetail.title}</div>
        {metaParts.length > 0 && (
          <div id="precal-detail-meta">{metaParts.join(' · ')}</div>
        )}
      </div>
      <form onSubmit={handleSubmit}>
        <label htmlFor="precal-nombre">Nombre</label>
        <input
          type="text"
          id="precal-nombre"
          name="nombre"
          placeholder="Ingrese su nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
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
        />
        <button type="submit" className="btn-enviar">Enviar solicitud</button>
      </form>
    </div>
  );
}

/**
 * Panel lateral/modal que muestra el detalle de un marcador y el formulario de precalificación.
 *
 * @param {{ isOpen: boolean, title: string, content: string, markerId: string,
 *           detail: { precio?: string, area?: string }, onClose: Function }} props
 */
export function InfoPanel({ isOpen, title, content, markerId, detail = {}, onClose }) {
  const [showForm, setShowForm] = useState(false);

  // Resetear a vista info cada vez que se abre un marcador nuevo
  useEffect(() => {
    setShowForm(false);
  }, [markerId]);

  if (!isOpen) return null;

  const lotDetail = {
    title: title ?? '',
    markerId,
    precio: detail.precio != null ? String(detail.precio).trim() : '',
    area: detail.area != null ? String(detail.area).trim() : '',
  };

  return (
    <div
      id="info-backdrop"
      className="visible"
      aria-hidden="false"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        id="info-panel"
        className={`info-panel${showForm ? ' info-panel--form-visible' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-live="polite"
      >
        {/* HEADER */}
        <header id="info-panel-header">
          <div id="info-panel-header-left">
            {showForm && (
              <button
                type="button"
                id="info-panel-back"
                aria-label="Volver al detalle"
                onClick={() => setShowForm(false)}
              />
            )}
          </div>
          <div id="info-panel-header-center">
            {showForm
              ? <span className="info-panel-form-title">Pre calificación</span>
              : <span id="info-panel-lot-title">{title}</span>
            }
          </div>
          <div id="info-panel-header-right">
            <button type="button" id="info-panel-close" aria-label="Cerrar" onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <div id="info-panel-content">
          {!showForm ? (
            <div id="info-panel-view">
              <div
                id="info-content"
                dangerouslySetInnerHTML={{ __html: content ?? '' }}
              />
              {markerId && (
                <div id="info-actions">
                  <button type="button" onClick={() => setShowForm(true)}>
                    Pre calificación
                  </button>
                </div>
              )}
            </div>
          ) : (
            <PrecalificacionForm
              lotDetail={lotDetail}
              onBack={() => setShowForm(false)}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
