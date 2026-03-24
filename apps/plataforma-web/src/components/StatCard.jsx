import React from 'react';

const StatCard = ({ label, value, color = '#c5a059' }) => {
  return (
    <div className="stat-card" style={{ '--card-accent': color }}>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <h3 className="stat-value">{value}</h3>
      </div>
    </div>
  );
};

export default StatCard;
