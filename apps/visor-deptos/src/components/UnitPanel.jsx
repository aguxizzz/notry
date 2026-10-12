import { useEffect, useState } from 'react';
import { FLOOR_BY_ID, STATUS, typologyLabel } from '../data.js';

const m2 = (value) => `${value.toLocaleString('es-AR')} m²`;

function Row({ label, value }) {
  return (
    <div className="unit-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function UnitPanel({ unit, onClose }) {
  // Se conserva la última unidad para que el contenido no desaparezca
  // mientras el panel hace la animación de salida.
  const [shown, setShown] = useState(unit);
  if (unit && unit !== shown) setShown(unit);

  const [contacted, setContacted] = useState(false);
  useEffect(() => {
    if (!contacted) return undefined;
    const timer = setTimeout(() => setContacted(false), 2200);
    return () => clearTimeout(timer);
  }, [contacted]);

  const open = !!unit;

  return (
    <aside className={`unit-panel glass${open ? ' is-open' : ''}`} aria-hidden={!open} inert={!open}>
      {shown && (
        <>
          <header className="unit-panel__header">
            <div>
              <span className="unit-panel__eyebrow">{FLOOR_BY_ID[shown.floor].name}</span>
              <h2>Unidad {shown.id}</h2>
            </div>
            <span className="badge" style={{ '--status': STATUS[shown.status].color }}>
              {STATUS[shown.status].label}
            </span>
            <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div className="unit-panel__body" key={shown.id}>
            <div className="unit-panel__media">
              <span>Render de la unidad</span>
            </div>

            <button type="button" className="cta" onClick={() => setContacted(true)}>
              {contacted ? 'Demo: no se envía nada' : 'Contactar'}
            </button>

            <section className="unit-card">
              <h3>Tipología</h3>
              <p>{typologyLabel(shown)}</p>
            </section>

            <section className="unit-card">
              <h3>Detalle de ambientes</h3>
              {shown.dormitorios > 0 && <Row label="Dormitorios" value={shown.dormitorios} />}
              <Row label="Baños" value={shown.banos} />
            </section>

            <section className="unit-card">
              <h3>Detalle de superficie</h3>
              <Row label="Superficie total" value={m2(shown.total)} />
              <Row label="Superficie cubierta" value={m2(shown.cubierta)} />
              <Row label="Superficie semicubierta" value={m2(shown.semi)} />
            </section>
          </div>
        </>
      )}
    </aside>
  );
}
