// Card de velocidad de venta (barras verticales de lotes vendidos por mes).
// Stateless, sin lógica. Reemplaza a la grilla "Distribución por loteo".

import './SalesVelocityChart.css';

export default function SalesVelocityChart({ months }) {
  const max = months.reduce((m, d) => Math.max(m, d.count), 0) || 1;
  const total = months.reduce((sum, d) => sum + d.count, 0);
  const avg = months.length > 0 ? total / months.length : 0;

  return (
    <div className="inv-velocity">
      <div className="inv-velocity-bars">
        {months.map(m => (
          <div className="inv-vbar" key={m.key}>
            <span className="inv-vbar-v">{m.count}</span>
            <div className="inv-vbar-track">
              <i style={{ height: m.count > 0 ? `${Math.max(6, (m.count / max) * 100)}%` : '0%' }} />
            </div>
            <span className="inv-vbar-l">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="inv-velocity-summary">
        <span><b>{total}</b> vendidos en {months.length} meses</span>
        <span><b>{avg.toFixed(1)}</b> prom. por mes</span>
      </div>
    </div>
  );
}
