// Card de "Requieren atención" (fila con número + label + chevron).
// Stateless, sin lógica. Movida desde InventarioView.jsx en la Fase 3.
// Antes vivía acá el bug de import faltante de ChevronRight — ahora se importa
// correctamente en este archivo.

import { ChevronRight } from 'lucide-react';
import './AlertCard.css';

export default function AlertCard({ tone, n, label, sub, active = false, onClick, controls }) {
  return (
    <button
      type="button"
      className={`inv-alert inv-alert--${tone}${n === 0 ? ' is-zero' : ''}${active ? ' is-active' : ''}`}
      onClick={onClick}
      disabled={n === 0}
      aria-pressed={active}
      aria-controls={controls}
    >
      <div className="inv-alert-n">{n}</div>
      <div className="inv-alert-l">
        {label}
        {sub && <small>{sub}</small>}
      </div>
      <ChevronRight size={18} className="inv-alert-go" aria-hidden="true" />
    </button>
  );
}
