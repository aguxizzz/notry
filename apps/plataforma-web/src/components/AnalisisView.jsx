import { useState, useEffect } from 'react';
import BlueprintHeatmap from './BlueprintHeatmap';

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

export default function AnalisisView({ token, onSessionExpired, prefetchedLoteos = [], cachedClicks = {}, cachedVisorData = {} }) {
  const [loteos, setLoteos]           = useState(prefetchedLoteos);
  const [loteosLoading, setLoteosLoading] = useState(prefetchedLoteos.length === 0);
  const [loteosError, setLoteosError] = useState(null);

  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [clicksData, setClicksData]   = useState([]);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [clicksError, setClicksError] = useState(null);

  const [visorData, setVisorData]     = useState(null);
  const [visorLoading, setVisorLoading] = useState(false);
  const [visorError, setVisorError]   = useState(null);

  // fetch loteos on mount or use prefetched data
  useEffect(() => {
    if (!token) return;
    if (prefetchedLoteos.length > 0) {
      setLoteos(prefetchedLoteos);
      setLoteosLoading(false);
      if (prefetchedLoteos.length > 0) setSelectedLoteo(prefetchedLoteos[0]);
    } else {
      fetchLoteos();
    }
  }, [token, prefetchedLoteos]);

  // use cached data or fetch on demand whenever selected loteo changes
  useEffect(() => {
    if (!selectedLoteo) return;
    const controller = new AbortController();

    // Use cached clicks if available, otherwise fetch
    if (cachedClicks[selectedLoteo.id]) {
      setClicksData(cachedClicks[selectedLoteo.id]);
      setClicksLoading(false);
    } else {
      fetchClicks(selectedLoteo.id, controller.signal);
    }

    // Use cached visor data if available, otherwise fetch
    if (cachedVisorData[selectedLoteo.id]) {
      setVisorData(cachedVisorData[selectedLoteo.id]);
      setVisorLoading(false);
    } else {
      fetchVisorData(selectedLoteo.id, controller.signal);
    }

    return () => controller.abort();
  }, [selectedLoteo, cachedClicks, cachedVisorData]);

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

  const fetchClicks = async (loteoId, signal) => {
    setClicksLoading(true);
    setClicksError(null);
    setClicksData([]);
    try {
      const res = await fetch(`${API_BASE}/loteos/${loteoId}/clicks`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal,
      });
      if (res.status === 401 && onSessionExpired) {
        onSessionExpired();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cargar clicks');
      setClicksData([...data].sort((a, b) => b.clicks - a.clicks));
    } catch (err) {
      if (err.name !== 'AbortError') {
        setClicksError(err.message);
        console.error(err);
      }
    } finally {
      setClicksLoading(false);
    }
  };

  const fetchVisorData = async (loteoId, signal) => {
    setVisorLoading(true);
    setVisorError(null);
    setVisorData(null);
    try {
      const res = await fetch(`${API_BASE}/loteos/${loteoId}/visor_data`, { signal });
      if (res.status === 401 && onSessionExpired) {
        onSessionExpired();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Error al cargar datos del blueprint');
      setVisorData(data);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setVisorError(err.message);
        console.error(err);
        setVisorData(null);
      }
    } finally {
      setVisorLoading(false);
    }
  };

  const maxClicks   = clicksData.reduce((m, d) => Math.max(m, d.clicks), 0);
  const totalClicks = clicksData.reduce((s, d) => s + d.clicks, 0);

  // Check if we can show blueprint heatmap
  const canShowBlueprint = visorData?.blueprintUrl && visorData?.annotations;
  const polygonAnnotations = visorData?.annotations?.filter(
    a => a.type === 'polygon'
  ) || [];
  const annotationsWithCoords = polygonAnnotations.filter(
    a => a.blueprint_coordinates && a.blueprint_coordinates.length > 0
  );
  const missingCoordinatesCount = polygonAnnotations.length - annotationsWithCoords.length;
  const shouldShowBlueprint = canShowBlueprint && annotationsWithCoords.length > 0;

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

        {clicksLoading || visorLoading ? (
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
        ) : shouldShowBlueprint ? (
          <BlueprintHeatmap
            blueprintUrl={visorData.blueprintUrl}
            annotations={annotationsWithCoords}
            clicksData={clicksData}
            missingCoordinatesCount={missingCoordinatesCount}
          />
        ) : (
          <div className="heatmap-grid">
            {clicksData.map((item) => {
              const bg      = getHeatColor(item.clicks, maxClicks);
              const fg      = getTextColor(item.clicks, maxClicks);
              const pct     = maxClicks > 0 ? Math.round((item.clicks / maxClicks) * 100) : 0;
              return (
                <div
                  key={item.lote_uuid}
                  className="heatmap-cell"
                  style={{ background: bg, color: fg }}
                  title={`${item.name}\n${item.clicks} clicks`}
                >
                  <span className="cell-id">{item.name}</span>
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
