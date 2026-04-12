import { useState, useEffect, useCallback } from 'react';
import BlueprintHeatmap from './BlueprintHeatmap';
import StatCard from './StatCard';
import { API_BASE } from '../config';
import { Loader, Button } from '../ui/components';
import { getHeatColor, getTextColor } from '../utils/heatColor';

const TIME_OPTIONS = [1, 5, 10, 20, 30, 60];

export default function AnalisisView({
  token,
  onSessionExpired,
  prefetchedLoteos = [],
  cachedClicks = {},
  cachedVisorData = {},
  cachedReports = {},
  analisisLastDays,
  onAnalisisLastDaysChange,
  onRequestClicks,
  onRequestVisorData,
}) {
  const [loteos, setLoteos]           = useState(prefetchedLoteos);
  const [loteosLoading, setLoteosLoading] = useState(prefetchedLoteos.length === 0);
  const [loteosError, setLoteosError] = useState(null);

  const [selectedLoteo, setSelectedLoteo] = useState(null);

  const reportStats = cachedReports[analisisLastDays] ?? null;
  const clicksData  = cachedClicks[selectedLoteo?.id] ?? [];
  const visorData   = cachedVisorData[selectedLoteo?.id] ?? null;

  // fetch loteos on mount or use prefetched data
  useEffect(() => {
    if (!token) return;
    if (prefetchedLoteos.length > 0) {
      setLoteos(prefetchedLoteos);
      setLoteosLoading(false);
      if (prefetchedLoteos.length > 0 && !selectedLoteo) setSelectedLoteo(prefetchedLoteos[0]);
    } else {
      fetchLoteos();
    }
  }, [token, prefetchedLoteos]);

  // when selected loteo changes, trigger a fetch if not in cache
  useEffect(() => {
    if (!selectedLoteo) return;
    if (!cachedClicks[selectedLoteo.id]) {
      onRequestClicks?.(selectedLoteo.id);
    }
    if (!cachedVisorData[selectedLoteo.id]) {
      onRequestVisorData?.(selectedLoteo.id);
    }
  }, [selectedLoteo?.id]);

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
      if (data.items.length > 0 && !selectedLoteo) setSelectedLoteo(data.items[0]);
    } catch (err) {
      setLoteosError(err.message);
      console.error(err);
    } finally {
      setLoteosLoading(false);
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
        <Loader />
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

      {/* Time period selector */}
      <div className="report-time-selector">
        {TIME_OPTIONS.map(d => (
          <Button
            key={d}
            variant="outline"
            size="sm"
            className={analisisLastDays === d ? 'active' : ''}
            onClick={() => onAnalisisLastDaysChange?.(d)}
          >
            {d}d
          </Button>
        ))}
      </div>

      {/* Stat cards row */}
      {!reportStats ? (
        <div className="stats-loading">
          <Loader size="sm" />
        </div>
      ) : (
        <div className="report-stats-row">
          <StatCard
            label="Prospectos en el período"
            value={reportStats.prospectos}
            color="#3b82f6"
          />
          <StatCard
            label="Ventas en el período"
            value={`$${reportStats.ventas.toLocaleString('es-AR')}`}
            color="#22c55e"
          />
          <StatCard
            label="Lotes vendidos"
            value={reportStats.lotesVendidos}
            color="#ef4444"
          />
        </div>
      )}

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

        {!visorData && !clicksData.length ? (
          <div className="heatmap-loading">
            <Loader />
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
              const bg = getHeatColor(item.clicks, maxClicks);
              const fg = getTextColor(item.clicks, maxClicks);
              return (
                <div
                  key={item.lote_uuid}
                  className="heatmap-cell"
                  style={{ background: bg, color: fg }}
                  title={`${item.name}\n${item.clicks} clicks`}
                >
                  <span className="cell-id">{item.name}</span>
                  <span className="cell-clicks">{item.clicks}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
