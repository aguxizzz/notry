import { useEffect, useState } from 'react';
import { STATUS, typologyLabel, useBuilding } from '../building.js';
import UnitGallery from './UnitGallery.jsx';

const m2 = (value) => `${value.toLocaleString('es-AR')} m²`;
const money = ({ amount, currency }) => `${currency} ${amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

function Row({ label, value }) {
  return (
    <div className="unit-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function UnitPanel({ unit, onClose }) {
  const { floorById } = useBuilding();
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
              <span className="unit-panel__eyebrow">{floorById[shown.floor].name}</span>
              <h2>Unidad {shown.code}</h2>
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
            {/* Sin fotos (el demo, o una unidad que todavía no tiene) no se muestra el recuadro. */}
            {shown.images?.length > 0 && <UnitGallery images={shown.images} />}

            {/* Solo disponibles: el back ya lo filtra, esto cubre también el demo. */}
            {shown.price && shown.status === 'available' && (
              <div className="unit-price">
                <span>Precio</span>
                <strong>{money(shown.price)}</strong>
              </div>
            )}

            <button type="button" className="cta" onClick={() => setContacted(true)}>
              {contacted ? 'Demo: no se envía nada' : 'Contactar'}
            </button>

            {typologyLabel(shown) && (
              <section className="unit-card">
                <h3>Tipología</h3>
                <p>{typologyLabel(shown)}</p>
              </section>
            )}

            {(shown.dormitorios > 0 || shown.banos != null) && (
              <section className="unit-card">
                <h3>Detalle de ambientes</h3>
                {shown.dormitorios > 0 && <Row label="Dormitorios" value={shown.dormitorios} />}
                {shown.banos != null && <Row label="Baños" value={shown.banos} />}
              </section>
            )}

            {(shown.total != null || shown.cubierta != null || shown.semi) && (
              <section className="unit-card">
                <h3>Detalle de superficie</h3>
                {shown.total != null && <Row label="Superficie total" value={m2(shown.total)} />}
                {shown.cubierta != null && <Row label="Superficie cubierta" value={m2(shown.cubierta)} />}
                {shown.semi > 0 && <Row label="Superficie semicubierta" value={m2(shown.semi)} />}
              </section>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
