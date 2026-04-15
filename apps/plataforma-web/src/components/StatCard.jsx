import React from 'react';

const StatCard = ({ label, value, color = 'var(--accent-color)', loading = false }) => {
  return (
    <div className="stat-card" style={{ '--stat-accent': color }}>
      <div className="stat-inner">
        <div className="stat-left">
          <span className="stat-label">{label}</span>
        </div>
        <div className="stat-right">
          {loading ? (
            <span className="stat-value-loading" aria-label="Cargando">
              <span className="stat-spinner"></span>
            </span>
          ) : (
            <span className="stat-value">{value}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatCard;