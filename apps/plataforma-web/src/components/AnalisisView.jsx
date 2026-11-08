import { useState, useEffect, useMemo } from 'react';
import { API_BASE } from '../config';
import {
  Button,
  FeedbackState,
  PageLayout,
  Panel,
  SectionHeader,
} from '../ui/components';
import ShellLayout from './ShellLayout';
import AnalisisContextBar from './analisis/AnalisisContextBar';
import AnalisisOverview from './analisis/AnalisisOverview';
import TopLotsPanel from './analisis/TopLotsPanel';
import HeatmapCard from './analisis/HeatmapCard';
import FunnelCard from './analisis/FunnelCard';
import EngagementCard from './analisis/EngagementCard';
import { selectFunnel, selectEngagement, describePeriod } from './analisis/analytics';
import { formatNumber } from '../utils/formatters';
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
  analisisLastDays,
  onAnalisisLastDaysChange,
  onRequestClicks,
  onRequestVisorData,
  cachedAnalytics = {},
  analyticsLoadingIds = new Set(),
  onRequestAnalytics,
  orgPhone = null,
}) {
  const [loteos, setLoteos] = useState(prefetchedLoteos);
  const [loteosLoading, setLoteosLoading] = useState(prefetchedLoteos.length === 0);
  const [loteosError, setLoteosError] = useState(null);
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [topLotsFocusedIdx, setTopLotsFocusedIdx] = useState(-1);
  const [heatmapFocusedIdx, setHeatmapFocusedIdx] = useState(-1);

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

  // Todo lo de un loteo (clics, plano, analítica diaria): se pide una vez y
  // queda en caché. Lo usan la selección y la precarga al pasar el mouse.
  const requestLoteoData = (id) => {
    if (!cachedClicks[id] && !clicksLoadingIds.has(id)) onRequestClicks?.(id);
    if (!cachedVisorData[id] && !visorDataLoadingIds.has(id)) onRequestVisorData?.(id);
    if (!cachedAnalytics[id] && !analyticsLoadingIds.has(id)) onRequestAnalytics?.(id);
  };

  useEffect(() => {
    if (!selectedLoteo) return;
    setSelectedChannel(null);
    requestLoteoData(selectedLoteo.id);
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

  // Período y canal se calculan en memoria sobre la analítica diaria: cambiarlos
  // es instantáneo y no dispara pedidos.
  const analytics = cachedAnalytics[selectedLoteo?.id] ?? null;
  const isLoadingAnalytics = !!(selectedLoteo && analyticsLoadingIds.has(selectedLoteo.id));
  // La lectura del período (frase, KPIs, señales) usa siempre el embudo sin
  // filtro de canal, independiente del canal elegido en el FunnelCard.
  const overviewFunnelStats = useMemo(() => selectFunnel(analytics, analisisLastDays), [analytics, analisisLastDays]);
  const funnelStats = useMemo(
    () => (selectedChannel ? selectFunnel(analytics, analisisLastDays, selectedChannel) : overviewFunnelStats),
    [analytics, analisisLastDays, selectedChannel, overviewFunnelStats],
  );
  const engagementStats = useMemo(() => selectEngagement(analytics, analisisLastDays), [analytics, analisisLastDays]);
  const clicksData = cachedClicks[selectedLoteo?.id] ?? [];
  const visorData = cachedVisorData[selectedLoteo?.id] ?? null;
  const isLoadingVisorData = selectedLoteo?.id && visorDataLoadingIds.has(selectedLoteo.id);

  // Mapa de calor y ranking: interés por lote DENTRO del período (sesiones que
  // abrieron cada lote, de la analítica diaria), con los nombres de /clicks.
  // Si la analítica falló, cae a los clics acumulados de /clicks.
  const lotInterest = useMemo(() => {
    const activity = engagementStats?.lot_activity;
    if (!activity) return clicksData;
    const sessionsById = Object.fromEntries(activity.map(a => [a.lote_id, a.sessions]));
    return clicksData.map(c => ({ ...c, clicks: sessionsById[c.lote_uuid] ?? 0 }));
  }, [clicksData, engagementStats]);
  const isLoadingLotInterest = !!(selectedLoteo?.id && clicksLoadingIds.has(selectedLoteo.id)) || (isLoadingAnalytics && !analytics);
  const maxClicks = lotInterest.reduce((m, d) => Math.max(m, d.clicks), 0);
  const totalClicks = lotInterest.reduce((s, d) => s + d.clicks, 0);
  const activeLots = lotInterest.filter(d => d.clicks > 0).length;

  const polygonAnnotations = visorData?.annotations?.filter(a => a.type === 'polygon') || [];
  const annotationsWithCoords = polygonAnnotations.filter(
    a => a.blueprint_coordinates && a.blueprint_coordinates.length > 0
  );
  const missingCoordinatesCount = polygonAnnotations.length - annotationsWithCoords.length;
  const shouldShowBlueprint = !!(visorData?.blueprintUrl && visorData?.annotations && annotationsWithCoords.length > 0);

  const topLots = lotInterest.filter(d => d.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, 10);

  return (
    <ShellLayout className="analisis-shell">
      <PageLayout className="analisis-page">
        <AnalisisContextBar
          loteos={loteos}
          selectedLoteo={selectedLoteo}
          onSelectLoteo={setSelectedLoteo}
          analisisLastDays={analisisLastDays}
          onAnalisisLastDaysChange={onAnalisisLastDaysChange}
          onLoteoIntent={(id) => requestLoteoData(id)}
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
            <AnalisisOverview
              selectedLoteo={selectedLoteo}
              analisisLastDays={analisisLastDays}
              funnelStats={overviewFunnelStats}
              engagementStats={engagementStats}
              clicksData={clicksData}
              visorData={visorData}
              hasWhatsapp={Boolean(orgPhone)}
            />

            <Panel as="section" className="loteo-activity-block" flush>
              <SectionHeader
                className="analisis-activity-header"
                eyebrow="Actividad por loteo"
                title="Interés en el visor 360"
                sub={`Visitantes que abrieron cada lote en el visor público — ${describePeriod(analisisLastDays)}`}
              />

              <div className="loteo-activity-inner">
                <div className="analisis-left-col">
                  <div className="analisis-summary" aria-live="polite">
                    <div className="analisis-stat analisis-stat--primary">
                      <span className="analisis-stat-value">{isLoadingLotInterest ? '—' : formatNumber(totalClicks)}</span>
                      <span className="analisis-stat-label">Clics en lotes</span>
                    </div>
                    <div className="analisis-stat">
                      <span className="analisis-stat-value">{isLoadingLotInterest ? '—' : formatNumber(activeLots)}</span>
                      <span className="analisis-stat-label">Lotes con actividad</span>
                    </div>
                  </div>

                  <TopLotsPanel
                    topLots={topLots}
                    maxClicks={maxClicks}
                    topLotsFocusedIdx={topLotsFocusedIdx}
                    onFocusChange={setTopLotsFocusedIdx}
                    isLoading={isLoadingLotInterest}
                  />
                </div>

                <HeatmapCard
                  selectedLoteo={selectedLoteo}
                  visorData={visorData}
                  clicksData={lotInterest}
                  shouldShowBlueprint={shouldShowBlueprint}
                  annotationsWithCoords={annotationsWithCoords}
                  missingCoordinatesCount={missingCoordinatesCount}
                  heatmapFocusedIdx={heatmapFocusedIdx}
                  onFocusChange={setHeatmapFocusedIdx}
                  isLoading={isLoadingVisorData || isLoadingLotInterest}
                />
              </div>
            </Panel>

            <FunnelCard
              selectedLoteo={selectedLoteo}
              funnelStats={funnelStats}
              analisisLastDays={analisisLastDays}
              isLoading={isLoadingAnalytics}
              hasWhatsapp={Boolean(orgPhone)}
              selectedChannel={selectedChannel}
              onChannelChange={setSelectedChannel}
            />

            <EngagementCard
              selectedLoteo={selectedLoteo}
              engagementStats={engagementStats}
              analisisLastDays={analisisLastDays}
              isLoading={isLoadingAnalytics}
            />
          </>
        )}
      </PageLayout>
    </ShellLayout>
  );
}
