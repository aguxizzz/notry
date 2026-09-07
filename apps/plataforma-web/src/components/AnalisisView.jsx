import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../config';
import {
  Button,
  FeedbackState,
  PageHeader,
  PageLayout,
  Panel,
  SectionHeader,
} from '../ui/components';
import ShellLayout from './ShellLayout';
import PeriodSelector from './analisis/PeriodSelector';
import LoteoSelector from './analisis/LoteoSelector';
import TopLotsPanel from './analisis/TopLotsPanel';
import HeatmapCard from './analisis/HeatmapCard';
import FunnelCard from './analisis/FunnelCard';
import './views/AnalisisView.css';

export default function AnalisisView({
  apiFetch,
  token,
  hasUsableOrgContext = true,
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
  cachedFunnel = {},
  funnelLoadingIds = new Set(),
  onRequestFunnel,
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
    let inTimer;
    const outTimer = setTimeout(() => {
      setFadeState('fading-in');
      inTimer = setTimeout(() => setFadeState('visible'), 300);
    }, 200);
    return () => {
      clearTimeout(outTimer);
      clearTimeout(inTimer);
    };
  }, [analisisLastDays]);

  useEffect(() => {
    if (!token) return;
    if (prefetchedLoteos.length > 0) {
      setLoteos(prefetchedLoteos);
      setLoteosLoading(false);
      if (prefetchedLoteos.length > 0 && !selectedLoteo) setSelectedLoteo(prefetchedLoteos[0]);
    } else if (hasUsableOrgContext) {
      fetchLoteos();
    } else {
      setLoteosLoading(false);
    }
  }, [token, hasUsableOrgContext, prefetchedLoteos]);

  useEffect(() => {
    if (!selectedLoteo) return;
    if (!cachedClicks[selectedLoteo.id]) onRequestClicks?.(selectedLoteo.id);
    if (!cachedVisorData[selectedLoteo.id]) onRequestVisorData?.(selectedLoteo.id);
  }, [selectedLoteo?.id]);

  const funnelKey = selectedLoteo ? `${selectedLoteo.id}:${analisisLastDays}` : null;
  useEffect(() => {
    if (!selectedLoteo) return;
    if (!cachedFunnel[funnelKey]) onRequestFunnel?.(selectedLoteo.id, analisisLastDays);
  }, [funnelKey]);

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
  const funnelStats = cachedFunnel[funnelKey] ?? null;
  const isLoadingFunnel = !!(funnelKey && funnelLoadingIds.has(funnelKey));
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

  return (
    <ShellLayout className="analisis-shell">
      <PageLayout className="analisis-page">
        <PageHeader
          eyebrow="Inteligencia comercial"
          title="Análisis"
          description="Leé el rendimiento de tu operación y el interés que despierta cada loteo."
        />

        {loteosLoading ? (
          <FeedbackState
            className="analisis-feedback"
            busy
            title="Cargando análisis"
            description="Preparando el rendimiento comercial y la actividad del visor…"
          />
        ) : loteosError ? (
          <FeedbackState
            className="analisis-feedback"
            role="alert"
            tone="danger"
            title="No pudimos cargar los loteos"
            description={loteosError}
            action={<Button variant="outline" onClick={fetchLoteos}>Reintentar</Button>}
          />
        ) : (
          <>
            <PeriodSelector
              analisisLastDays={analisisLastDays}
              onAnalisisLastDaysChange={onAnalisisLastDaysChange}
              reportStats={reportStats}
              fadeState={fadeState}
            />

            <Panel as="section" className="loteo-activity-block" flush>
              <SectionHeader
                className="analisis-activity-header"
                eyebrow="Actividad por loteo"
                title="Interés en el visor 360"
                sub="Clics de visitantes sobre cada lote en el visor público"
              />

              <LoteoSelector
                loteos={loteos}
                selectedLoteo={selectedLoteo}
                onSelect={setSelectedLoteo}
              />

              <div className="loteo-activity-inner">
                <div className="analisis-left-col">
                  <div className="analisis-summary" aria-live="polite">
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
            </Panel>

            <FunnelCard
              selectedLoteo={selectedLoteo}
              funnelStats={funnelStats}
              analisisLastDays={analisisLastDays}
              isLoading={isLoadingFunnel}
            />
          </>
        )}
      </PageLayout>
    </ShellLayout>
  );
}
