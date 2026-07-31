import { Loader } from '../ui/components';
import './StatCard.css';

// Celda de una métrica dentro del panel segmentado de Inicio (ver StatCard.css).
// El color se usa solo para el punto identificador, no para un filo dorado.
const StatCard = ({ label, value, color = 'var(--accent-color)', loading = false, subtitle }) => {
  return (
    <div className="stat-card" style={{ '--stat-accent': color }}>
      <span className="stat-label">
        <span className="stat-dot" aria-hidden="true" />
        {label}
      </span>
      {loading ? (
        <span className="stat-value-loading" aria-label="Cargando">
          <Loader size="sm" />
        </span>
      ) : (
        <span className="stat-row">
          <span className="stat-value">{value}</span>
          {subtitle && <span className="stat-caption">{subtitle}</span>}
        </span>
      )}
    </div>
  );
};

export default StatCard;
