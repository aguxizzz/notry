// Card de distribución por loteo (mini ring + nombre + % disponible).
// Stateless, sin lógica. Movida desde InventarioView.jsx en la Fase 3.

import { buildRingGradient } from './inventoryStats';
import './DonutCard.css';

export default function DonutCard({ name, total, available, reserved, sold, unavailable, availablePct }) {
  // Mismo ring segmentado que "Lotes por estado" (conic-gradient + máscara), en chico.
  const gradient = buildRingGradient({ available, reserved, sold, unavailable });
  return (
    <div className="inv-dcard">
      <div className="inv-ring inv-ring--sm">
        <div className="inv-ring-pie" style={{ '--ring-grad': gradient }} />
        <div className="inv-ring-ctr">
          <b>{total}</b>
          <span>lotes</span>
        </div>
      </div>
      <div className="inv-dcard-n" title={name}>{name}</div>
      <div className="inv-dcard-s">{availablePct}% disponible</div>
    </div>
  );
}