// Ring "Lotes por estado" de Inventario (conic-gradient segmentado).
// Stateless, sin lógica. Movida desde InventarioView.jsx en la Fase 3.

import { buildRingGradient } from './inventoryStats';
import './StateRing.css';

export default function StateRing({ counts, availablePct }) {
  const gradient = buildRingGradient(counts);
  return (
    <div className="inv-ring">
      <div className="inv-ring-pie" style={{ '--ring-grad': gradient }} />
      <div className="inv-ring-ctr">
        <b>{availablePct}%</b>
        <span>disponible</span>
      </div>
    </div>
  );
}