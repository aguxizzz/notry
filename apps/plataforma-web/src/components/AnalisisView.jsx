import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config';
import { Loader } from '../ui/components';
import PeriodSelector from './analisis/PeriodSelector';
import LoteoSelector from './analisis/LoteoSelector';
import TopLotsPanel from './analisis/TopLotsPanel';
import HeatmapCard from './analisis/HeatmapCard';
import './views/AnalisisView.css';

export default function AnalisisView({
  apiFetch,
  token,
  onSessionExpired,
  prefetchedLoteos = [],
  cachedClicks = {},
  clicksLoadingIds = new Set(),
  cachedVisorData = {},
  visorDataLoadingIds = new Set(),
  cachedReports = {},
  analisisLastDays,
  onAnalisisLastDaysChange,
  onRequestClicks,
  onRequestVisorData,
}) {
  const [loteos, setLoteos] = useState(prefetchedLoteos);
  const [loteosLoading, setLoteosLoading] = useState(prefetchedLoteos.length === 0);
  const [loteosError, setLoteosError] = useState(null);
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [fadeState, setFadeState] = useState('visible');
  const [topLotsFocusedIdx, setTopLotsFocusedIdx] = useState(-1);
  const [heatmapFocusedIdx, setHeatmapFocusedIdx] = useState(-1);
  const prevDaysRef = useRef(analisisLastDays);

  useEffect(() => {
    if (prevDaysRef.current === analisisLastDays) return;
    prevDaysRef.current = analisisLastDays;
    setFadeState('fading-out');
    const outTimer = setTimeout(() => {
      setFadeState('fading-in');
      const inTimer = setTimeout(() => setFadeState('visible'), 300);
    }, 200);
    return () => { clearTimeout(outTimer); };
  }, [analisisLastDays]);

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

  useEffect(() => {
    if (!selectedLoteo) return;
    if (!cachedClicks[selectedLoteo.id]) onRequestClicks?.(selectedLoteo.id);
    if (!cachedVisorData[selectedLoteo.id]) onRequestVisorData?.(selectedLoteo.id);
  }, [selectedLoteo?.id]);

  const fetchLoteos = async () => {
    setLoteosLoading(true);
    setLoteosError(null);
    try {
      const data = await apiFetch(`${API_BASE}/loteos?include_lotes=false&limit=50&offset=0`);
      setLoteos(data.items);
      if (data.items.length > 0 && !selectedLoteo) setSelectedLoteo(data.items[0]);
    } catch (err) {
      setLoteosError(err.message);
    } finally {
      setLoteosLoading(false);
    }
  };

  const reportStats = cachedReports[analisisLastDays] ?? null;
  const clicksData = cachedClicks[selectedLoteo?.id] ?? [];
  const visorData = cachedVisorData[selectedLoteo?.id] ?? null;
  const isLoadingClicks = selectedLoteo?.id && clicksLoadingIds.has(selectedLoteo.id);
  const isLoadingVisorData = selectedLoteo?.id && visorDataLoadingIds.has(selectedLoteo.id);
  const maxClicks = clicksData.reduce((m, d) => Math.max(m, d.clicks), 0);
  const totalClicks = clicksData.reduce((s, d) => s + d.clicks, 0);

  const polygonAnnotations = visorData?.annotations?.filter(a => a.type === 'polygon') || [];
  const annotationsWithCoords = polygonAnnotations.filter(
    a => a.blueprint_coordinates && a.blueprint_coordinates.length > 0
  );
  const missingCoordinatesCount = polygonAnnotations.length - annotationsWithCoords.length;
  const shouldShowBlueprint = !!(visorData?.blueprintUrl && visorData?.annotations && annotationsWithCoords.length > 0);

  const topLots = [...clicksData].sort((a, b) => b.clicks - a.clicks).slice(0, 10);

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
      <PeriodSelector
        analisisLastDays={analisisLastDays}
        onAnalisisLastDaysChange={onAnalisisLastDaysChange}
        reportStats={reportStats}
        fadeState={fadeState}
      />

      <div className="loteo-activity-block">
        <span className="report-block-label">Actividad por loteo</span>

        <LoteoSelector
          loteos={loteos}
          selectedLoteo={selectedLoteo}
          onSelect={setSelectedLoteo}
        />

        <div className="loteo-activity-inner">
          <div className="analisis-left-col">
            <div className="analisis-summary">
              <div className="analisis-stat analisis-stat--primary">
                <span className="analisis-stat-value">{isLoadingClicks ? '—' : totalClicks}</span>
                <span className="analisis-stat-label">Clics totales {isLoadingClicks && '(cargando...)'}</span>
              </div>
              <div className="analisis-stat">
                <span className="analisis-stat-value">{isLoadingClicks ? '—' : clicksData.length}</span>
                <span className="analisis-stat-label">Lotes con actividad</span>
              </div>
            </div>

            <TopLotsPanel
              topLots={topLots}
              maxClicks={maxClicks}
              topLotsFocusedIdx={topLotsFocusedIdx}
              onFocusChange={setTopLotsFocusedIdx}
              isLoading={isLoadingClicks}
            />
          </div>

          <HeatmapCard
            selectedLoteo={selectedLoteo}
            visorData={visorData}
            clicksData={clicksData}
            shouldShowBlueprint={shouldShowBlueprint}
            annotationsWithCoords={annotationsWithCoords}
            missingCoordinatesCount={missingCoordinatesCount}
            heatmapFocusedIdx={heatmapFocusedIdx}
            onFocusChange={setHeatmapFocusedIdx}
            isLoading={isLoadingVisorData || isLoadingClicks}
          />
        </div>
      </div>
    </div>
  );
}