import React from 'react';

const StatCard = ({ label, value, color = '#c5a059' }) => {
  return (
    <div className="stat-card" style={{ '--stat-accent': color }}>
      <div className="stat-inner">
        <div className="stat-left">
          <span className="stat-label">{label}</span>
        </div>
        <div className="stat-right">
          <span className="stat-value">{value}</span>
        </div>
      </div>
    </div>
  );
};

export default StatCard;