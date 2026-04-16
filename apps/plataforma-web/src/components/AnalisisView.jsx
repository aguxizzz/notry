import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [fadeState, setFadeState] = useState('visible'); // 'visible' | 'fading-out' | 'fading-in'
  const [topLotsFocusedIdx, setTopLotsFocusedIdx] = useState(-1);
  const [heatmapFocusedIdx, setHeatmapFocusedIdx] = useState(-1);
  const prevDaysRef = useRef(analisisLastDays);

  // Animate when time period changes
  useEffect(() => {
    if (prevDaysRef.current === analisisLastDays) return;
    prevDaysRef.current = analisisLastDays;

    // Fade out → swap data → fade in
    setFadeState('fading-out');
    const outTimer = setTimeout(() => {
      setFadeState('fading-in');
      const inTimer = setTimeout(() => setFadeState('visible'), 300);
    }, 200);
    return () => { clearTimeout(outTimer); };
  }, [analisisLastDays]);

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

  const topLots = [...clicksData]
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  // Dynamic row sizing: list expands to fill the full panel height.
  // count < 4 → no expansion (rows stay at natural height).
  // count >= 4 → each row takes a proportional share of the panel.
  const lotCount = topLots.length;

  // Keyboard navigation for top lots ranking
  const handleTopLotsKeyDown = useCallback((e, index) => {
    if (topLots.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTopLotsFocusedIdx(Math.min(index + 1, topLots.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTopLotsFocusedIdx(Math.max(index - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTopLotsFocusedIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setTopLotsFocusedIdx(topLots.length - 1);
    }
  }, [topLots.length]);

  // Keyboard navigation for heatmap grid cells
  const handleHeatmapCellKeyDown = useCallback((e, index) => {
    if (clicksData.length === 0) return;
    const cols = Math.min(clicksData.length, 6); // approximate column count
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHeatmapFocusedIdx(Math.min(index + 1, clicksData.length - 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHeatmapFocusedIdx(Math.max(index - 1, 0));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHeatmapFocusedIdx(Math.min(index + cols, clicksData.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHeatmapFocusedIdx(Math.max(index - cols, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHeatmapFocusedIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHeatmapFocusedIdx(clicksData.length - 1);
    }
  }, [clicksData.length]);

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

      {/* ── Report period block ── */}
      <div className="report-block">
        <span className="report-block-label">Análisis de período</span>

        {/* Time period selector */}
        <div
          className="report-time-selector"
          role="group"
          aria-label="Seleccionar período de análisis"
        >
          {TIME_OPTIONS.map(d => (
            <Button
              key={d}
              variant="outline"
              size="sm"
              className={analisisLastDays === d ? 'active' : ''}
              onClick={() => onAnalisisLastDaysChange?.(d)}
              aria-pressed={analisisLastDays === d}
              aria-label={`Últimos ${d} días`}
            >
              {d}d
            </Button>
          ))}
        </div>

        <p className="report-block-sub">
          Mostrando datos de los últimos <span className="text-emphasis">{analisisLastDays}</span> días
        </p>

        {/* Stat cards row */}
        {!reportStats ? (
          <div className="stats-loading">
            <Loader size="sm" />
          </div>
        ) : (
          <div className={`report-stats-row analisis-fade-${fadeState}`}>
            <StatCard
              label="Prospectos en el período"
              value={reportStats.prospectos}
              color="var(--color-stat-info)"
            />
            <StatCard
              label="Ventas en el período"
              value={`$${reportStats.ventas.toLocaleString('es-AR')}`}
              color="var(--color-stat-success)"
            />
            <StatCard
              label="Lotes vendidos"
              value={reportStats.lotesVendidos}
              color="var(--color-danger)"
            />
          </div>
        )}
      </div>

      {/* ── Loteo activity block ── */}
      <div className="loteo-activity-block">
        <span className="report-block-label">Actividad por loteo</span>

        {/* loteo selector */}
        <div
          className="loteo-selector"
          role="group"
          aria-label="Seleccionar loteo. Usa Tab para navegar y Enter o Espacio para seleccionar."
        >
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

        {/* Two-column layout: stats (left, stacked) + heatmap (right) */}
        <div className="loteo-activity-inner">
          {/* Left column: stacked stats */}
          <div className="analisis-left-col">
            <div className="analisis-summary">
              <div className="analisis-stat analisis-stat--primary">
                <span className="analisis-stat-value">{totalClicks}</span>
                <span className="analisis-stat-label">Clics totales</span>
              </div>
              <div className="analisis-stat">
                <span className="analisis-stat-value">{clicksData.length}</span>
                <span className="analisis-stat-label">Lotes con actividad</span>
              </div>
            </div>

            {/* Top 10 lots ranking */}
            <div className="top-lots-panel" role="region" aria-label="Ranking de lotes">
              <div className="top-lots-header">
                <span className="top-lots-title">Ranking lotes</span>
                <span className="top-lots-subtitle">Top 10</span>
              </div>
              <div
                className="top-lots-list"
                style={{ '--lot-count': lotCount }}
                role="listbox"
                aria-label="Ranking de lotes, usa flechas arriba y abajo para navegar"
              >
                {topLots.length === 0 ? (
                  <p className="top-lots-empty">Sin datos disponibles</p>
                ) : (
                  topLots.map((item, i) => (
                    <div
                      key={item.lote_uuid}
                      role="option"
                      tabIndex={topLotsFocusedIdx === i ? 0 : -1}
                      aria-selected={topLotsFocusedIdx === i}
                      aria-label={`${item.name}, ${item.clicks} clics, posición ${i + 1}`}
                      className="top-lot-row"
                      onClick={() => setTopLotsFocusedIdx(i)}
                      onKeyDown={(e) => handleTopLotsKeyDown(e, i)}
                      onFocus={() => setTopLotsFocusedIdx(i)}
                    >
                      <div className="top-lot-rank">{String(i + 1).padStart(2, '0')}</div>
                      <div className="top-lot-info">
                        <span className="top-lot-name">{item.name}</span>
                        <div className="top-lot-bar-track">
                          <div
                            className="top-lot-bar-fill"
                            style={{
                              width: `${maxClicks > 0 ? (item.clicks / maxClicks) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="top-lot-clicks">{item.clicks.toLocaleString('es-AR')}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Heatmap column */}
          <div className="heatmap-card">
            <div className="heatmap-header">
              <span className="heatmap-title">
                Mapa de calor — {selectedLoteo?.name ?? 'Selecciona un loteo'}
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
              <p className="heatmap-empty">Sin datos de clics para este loteo.</p>
            ) : shouldShowBlueprint ? (
              <BlueprintHeatmap
                blueprintUrl={visorData.blueprintUrl}
                annotations={annotationsWithCoords}
                clicksData={clicksData}
                missingCoordinatesCount={missingCoordinatesCount}
              />
            ) : (
              <div
                className="heatmap-grid"
                role="grid"
                aria-label={`Mapa de calor de ${selectedLoteo?.name ?? 'loteo'}, usa flechas para navegar`}
              >
                {clicksData.map((item, i) => {
                  const bg = getHeatColor(item.clicks, maxClicks);
                  const fg = getTextColor(item.clicks, maxClicks);
                  return (
                    <div
                      key={item.lote_uuid}
                      role="gridcell"
                      tabIndex={heatmapFocusedIdx === i ? 0 : -1}
                      aria-label={`${item.name}, ${item.clicks} clics`}
                      className="heatmap-cell"
                      style={{ background: bg, color: fg }}
                      onClick={() => setHeatmapFocusedIdx(i)}
                      onKeyDown={(e) => handleHeatmapCellKeyDown(e, i)}
                      onFocus={() => setHeatmapFocusedIdx(i)}
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
      </div>
    </div>
  );
}
