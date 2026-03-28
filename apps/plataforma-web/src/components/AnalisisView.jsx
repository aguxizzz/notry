import { useState, useEffect } from 'react';

const API_BASE = 'https://notry-back.onrender.com/api/v1';

function getHeatColor(clicks, maxClicks) {
  if (maxClicks === 0) return 'rgb(245, 240, 232)';
  const ratio = clicks / maxClicks;
  const r = Math.round(245 + (197 - 245) * ratio);
  const g = Math.round(240 + (160 - 240) * ratio);
  const b = Math.round(232 + (89  - 232) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function getTextColor(clicks, maxClicks) {
  if (maxClicks === 0) return 'var(--text-muted)';
  return clicks / maxClicks > 0.55 ? '#1a1a2a' : 'var(--text-main)';
}

export default function AnalisisView({ token }) {
  const [loteos, setLoteos]           = useState([]);
  const [loteosLoading, setLoteosLoading] = useState(true);
  const [loteosError, setLoteosError] = useState(null);

  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [clicksData, setClicksData]   = useState([]);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [clicksError, setClicksError] = useState(null);

  // fetch loteos on mount
  useEffect(() => {
    if (!token) return;
    fetchLoteos();
  }, [token]);

  // fetch clicks whenever selected loteo changes
  useEffect(() => {
    if (!selectedLoteo) return;
    fetchClicks(selectedLoteo.id);
  }, [selectedLoteo]);

  const fetchLoteos = async () => {
    setLoteosLoading(true);
    setLoteosError(null);
    try {
      const res = await fetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cargar loteos');
      setLoteos(data.items);
      if (data.items.length > 0) setSelectedLoteo(data.items[0]);
    } catch (err) {
      setLoteosError(err.message);
      console.error(err);
    } finally {
      setLoteosLoading(false);
    }
  };

  const fetchClicks = async (loteoId) => {
    setClicksLoading(true);
    setClicksError(null);
    setClicksData([]);
    try {
      const res = await fetch(`${API_BASE}/loteos/${loteoId}/clicks`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cargar clicks');
      setClicksData([...data].sort((a, b) => b.clicks - a.clicks));
    } catch (err) {
      setClicksError(err.message);
      console.error(err);
    } finally {
      setClicksLoading(false);
    }
  };

  const maxClicks   = clicksData.reduce((m, d) => Math.max(m, d.clicks), 0);
  const totalClicks = clicksData.reduce((s, d) => s + d.clicks, 0);

  if (loteosLoading) {
    return (
      <div className="analisis-loading">
        <span className="loader"></span>
      </div>
    );
  }

  if (loteosError) {
    return (
      <div className="analisis-error">
        <p>{loteosError}</p>
        <button className="outline-button" onClick={fetchLoteos}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="analisis-content">

      {/* loteo selector */}
      <div className="loteo-selector">
        {loteos.map((loteo) => (
          <button
            key={loteo.id}
            className={`loteo-pill ${selectedLoteo?.id === loteo.id ? 'active' : ''}`}
            onClick={() => setSelectedLoteo(loteo)}
          >
            {loteo.name}
          </button>
        ))}
      </div>

      {/* summary strip */}
      {!clicksLoading && !clicksError && (
        <div className="analisis-summary">
          <div className="analisis-stat">
            <span className="analisis-stat-value">{totalClicks}</span>
            <span className="analisis-stat-label">Clicks totales</span>
          </div>
          <div className="analisis-stat">
            <span className="analisis-stat-value">{clicksData.length}</span>
            <span className="analisis-stat-label">Lotes con actividad</span>
          </div>
          <div className="analisis-stat">
            <span className="analisis-stat-value">{maxClicks}</span>
            <span className="analisis-stat-label">Máximo clicks</span>
          </div>
        </div>
      )}

      {/* heatmap */}
      <div className="heatmap-card">
        <div className="heatmap-header">
          <span className="heatmap-title">
            Mapa de Calor — {selectedLoteo?.name ?? 'Selecciona un loteo'}
          </span>
          <div className="heatmap-legend">
            <span className="legend-label">Menos</span>
            <div className="legend-gradient"></div>
            <span className="legend-label">Más</span>
          </div>
        </div>

        {clicksLoading ? (
          <div className="heatmap-loading">
            <span className="loader"></span>
          </div>
        ) : clicksError ? (
          <div className="analisis-error" style={{ padding: '40px' }}>
            <p>{clicksError}</p>
            <button className="outline-button" onClick={() => fetchClicks(selectedLoteo.id)}>
              Reintentar
            </button>
          </div>
        ) : clicksData.length === 0 ? (
          <p className="heatmap-empty">Sin datos de clicks para este loteo.</p>
        ) : (
          <div className="heatmap-grid">
            {clicksData.map((item) => {
              const bg      = getHeatColor(item.clicks, maxClicks);
              const fg      = getTextColor(item.clicks, maxClicks);
              const pct     = maxClicks > 0 ? Math.round((item.clicks / maxClicks) * 100) : 0;
              const shortId = item.lote_uuid.split('-')[0];
              return (
                <div
                  key={item.lote_uuid}
                  className="heatmap-cell"
                  style={{ background: bg, color: fg }}
                  title={`${item.lote_uuid}\n${item.clicks} clicks`}
                >
                  <span className="cell-id">{shortId}</span>
                  <span className="cell-clicks">{item.clicks}</span>
                  <div
                    className="cell-bar"
                    style={{
                      width: `${pct}%`,
                      background: fg === '#1a1a2a' ? 'rgba(26,26,42,0.18)' : 'rgba(197,160,89,0.25)',
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
