import { Loader } from '../ui/components';
import './StatCard.css';

const StatCard = ({ label, value, color = 'var(--accent-color)', loading = false, subtitle }) => {
  return (
    <div className="stat-card" style={{ '--stat-accent': color }}>
      <span className="stat-label">{label}</span>
      {loading ? (
        <span className="stat-value-loading" aria-label="Cargando">
          <Loader size="sm" />
        </span>
      ) : (
        <span className="stat-value">{value}</span>
      )}
      {subtitle && !loading && <span className="stat-subtitle">{subtitle}</span>}
    </div>
  );
};

export default StatCard;