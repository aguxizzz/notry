import { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { PoiPanel } from './PoiPanel.jsx';
import { Compass } from './Compass.jsx';
import { LotPanel } from './LotPanel.jsx';
import { LotFloat } from './LotFloat.jsx';
import { MapControls, CompassTape } from './MapControls.jsx';
import { LoadingScreen } from './LoadingScreen.jsx';
import { OnboardingOverlay } from './OnboardingOverlay.jsx';
import { StageStatus } from './StageStatus.jsx';
import BlueprintViewer from './BlueprintViewer.jsx';
import { useViewer, useViewerHandles } from '../hooks/useViewer.js';
import { useViewerGroup, useProjectTheme, useLingering } from '../hooks/useViewerGroup.js';
import { useStageNavigation } from '../hooks/useStageNavigation.js';
import { useStageMarkers } from '../hooks/useStageMarkers.js';
import { useLotSelection, useDeepLinkLot } from '../hooks/useLotSelection.js';
import { useCameraControls } from '../hooks/useCameraControls.js';
import { usePanelLayout, getLotPanelInsets } from '../hooks/usePanelLayout.js';
import { useRecommendedLots } from '../hooks/useRecommendedLots.js';
import { useOnboarding } from '../hooks/useOnboarding.js';
import { useCompass } from '../hooks/useCompass.js';
import { detectOrigin } from '../analytics.js';
import { IS_SHOWCASE, DEV_LOADING_GALLERY } from '../urlParams.js';
import './ViewerExperience.css';

const VISIT_ORIGIN = detectOrigin();

// @arcgis/core pesa varios MB — se separa en su propio chunk y solo se baja
// si el usuario efectivamente activa el modo satelital.
const SatelliteViewer = lazy(() => import('./SatelliteViewer.jsx'));

// Cuánto queda montada la pantalla de carga después de terminar, para que
// se disuelva sobre el visor (coincide con la transición de .is-done).
const LOADING_FADE_MS = 1000;

/**
 * Experiencia del visor: arma los hooks (datos, etapa, markers, selección,
 * cámara, layout) y decide qué vista y qué paneles se montan.
 */
export default function ViewerExperience() {
  const { group, loading, loadError, retry, earlyLogoUrl, earlyGallery } = useViewerGroup();
  const project = group?.project ?? null;
  useProjectTheme(project);

  const nav = useStageNavigation(group);
  const { currentStage, viewMode } = nav;
  const visor = currentStage?.visor ?? null;

  const layout = usePanelLayout();
  const { recommendedIds, focusMode, toggleFocusMode } = useRecommendedLots();
  const [lotFilter, setLotFilter] = useState(null);
  const stage = useStageMarkers(visor, project, { recommendedIds, focusMode, lotFilter });

  const handles = useViewerHandles();
  const { containerRef, viewerRef } = handles;
  const selection = useLotSelection(handles, {
    annotationsById: stage.annotationsById,
    stageId: currentStage?.id,
    stageNameById: nav.stageNameById,
    viewMode,
  });
  const { closePanel, selectLotById, hoverLot } = selection;

  const homePosition = useMemo(
    () => (visor?.homeYaw != null ? { yaw: visor.homeYaw, pitch: visor.homePitch ?? 0 } : null),
    [visor]
  );
  const northOffset = visor?.northOffset ?? null;
  const camera = useCameraControls(handles, { homePosition, northOffset });
  const { heading, onPositionChange } = useCompass();

  // Candidatas para una única precarga conservadora. useViewer descarta las
  // pesadas, las tiles y las conexiones con ahorro de datos.
  const preloadCandidates = useMemo(
    () => nav.stages.map((s) => ({
      url: s.visor?.panoramaUrl,
      byteSize: s.visor?.panorama?.byteSize ?? s.visor?.panoramaByteSize ?? null,
    })).filter((item) => item.url),
    [nav.stages]
  );

  const viewerData = useMemo(
    () => (viewMode !== 'panorama' || !visor
      ? null
      : {
          // La etapa es la identidad del contenido. La URL puede repetirse
          // entre etapas y no alcanza para decidir si hay que reemplazar
          // markers, posición o metadata.
          stageId: currentStage?.id ?? null,
          panoramaUrl: visor.panoramaUrl,
          markers: stage.markers,
          orbitLots: stage.orbitLots,
          orbitFocus: stage.orbitFocus,
          orbitSurfaces: stage.orbitSurfaces,
          orbitPins: stage.orbitPins,
          requestNonce: nav.retryNonce,
        }),
    [viewMode, currentStage?.id, visor, stage.markers, stage.orbitLots, stage.orbitFocus, stage.orbitSurfaces, stage.orbitPins, nav.retryNonce]
  );

  useViewer(handles, viewerData, {
    preloadCandidates,
    homePosition,
    onMarkerSelect: selection.handleMarkerSelect,
    onMarkerUnselect: closePanel,
    onPositionChange,
    onStageReady: nav.onStageReady,
    onStageError: nav.onStageError,
    onStageProgress: nav.onStageProgress,
    onLotPick: selection.handleOrbitPick,
    getOrbitInsets: getLotPanelInsets,
  });

  const { goToStage: showStage } = nav;
  const goToStage = useCallback((stageId) => {
    closePanel();
    showStage(stageId);
  }, [closePanel, showStage]);

  // Desde la lista (o el link directo) la ficha tiene que quedar a la vista.
  const { expand } = layout;
  const openLotFromList = useCallback((id) => {
    expand();
    selectLotById(id);
  }, [expand, selectLotById]);
  const openLotFromPanel = useCallback((id) => {
    hoverLot(null);
    openLotFromList(id);
  }, [hoverLot, openLotFromList]);

  const entryReady = nav.committedStageId !== null && nav.committedStageId === currentStage?.id;
  useDeepLinkLot({ ready: entryReady, annotations: stage.annotations, openLot: openLotFromList });
  const onboarding = useOnboarding({ ready: nav.committedStageId !== null, projectId: group?.projectId });

  const loadingActive = loading || !group || !visor || (nav.committedStageId === null && !nav.stageError);
  const showLoading = useLingering(loadingActive, LOADING_FADE_MS);
  const loadingGallery = DEV_LOADING_GALLERY ?? (group?.loadingGallery?.length ? group.loadingGallery : earlyGallery);

  // Misma key en las dos ramas de abajo: al pasar de "cargando datos" a
  // "cargando panorama" la galería sigue donde estaba en vez de reiniciarse.
  const loadingScreen = showLoading && (
    <LoadingScreen
      key="loading-screen"
      logoUrl={project?.logo_primary ?? earlyLogoUrl}
      progress={nav.stageProgress}
      gallery={loadingGallery}
      done={!loadingActive}
    />
  );

  if (loadError) {
    return (
      <div className="viewer-load-error" role="alert">
        <p>{loadError}</p>
        <button type="button" onClick={retry}>Reintentar</button>
      </div>
    );
  }

  if (loading || !group || !visor) {
    return <>{loadingScreen}</>;
  }

  const { panel } = selection;
  const hasRecommended = recommendedIds.size > 0;
  // Lo mismo para el panel lateral (escritorio) y el flotante (celular).
  const lotUiProps = {
    project,
    stageName: currentStage?.name || null,
    stages: nav.stages,
    currentStageId: currentStage?.id,
    stageBusy: nav.stagePending,
    onSelectStage: goToStage,
    viewModes: nav.availableViewModes,
    viewMode,
    onSelectViewMode: nav.selectViewMode,
    annotations: stage.annotations,
    labels: stage.loteLabels,
    services: visor.services ?? null,
    selectedId: selection.selectedLotId,
    onCloseLot: closePanel,
    onPoiSelect: selection.flyToPoi,
    onFilterChange: setLotFilter,
    whatsappPhone: group.whatsappPhone,
    hideContactForm: group.hideContactForm,
    origin: VISIT_ORIGIN,
    loteoId: currentStage?.id,
    showcase: IS_SHOWCASE,
  };

  return (
    <>
      {loadingScreen}

      <OnboardingOverlay
        visible={onboarding.visible}
        onDismiss={onboarding.dismiss}
        containerRef={containerRef}
        psvRef={viewerRef}
        sway={viewMode === 'panorama'}
        silenceWhen={panel.isOpen}
        pulseSelector={layout.usePanel ? (layout.collapsed ? '.lp-reopen' : '.lp-tabs button') : '.lf-bar'}
      />

      <Compass
        heading={heading}
        northOffset={northOffset}
        visible={viewMode === 'panorama'}
        logoUrl={project?.logo_primary ?? null}
      />

      {hasRecommended && (
        <button
          type="button"
          className={`recommended-filter-toggle${nav.stages.length > 1 ? ' recommended-filter-toggle--above-switcher' : ''}`}
          onClick={toggleFocusMode}
          aria-pressed={focusMode}
          title={focusMode ? 'Mostrar todos los lotes' : 'Mostrar solo los recomendados'}
        >
          <span className="recommended-filter-toggle__dot" />
          {focusMode ? 'Ver todos los lotes' : 'Ver solo recomendados'}
        </button>
      )}

      {viewMode === 'blueprint' ? (
        <BlueprintViewer
          blueprintUrl={visor.blueprintUrl || null}
          annotations={stage.blueprintAnnotations}
          selectedId={panel.markerId}
          onMarkerSelect={selection.handleBlueprintSelect}
          onMarkerHover={() => {}}
          hasStageSwitcher={!layout.usePanel}
          recommendedIds={recommendedIds}
          focusMode={focusMode}
          loteLabels={stage.loteLabels}
          badgeStyle={stage.blueprintBadgeStyle}
          badgeColors={stage.badgeColors}
        />
      ) : viewMode === 'satellite' ? (
        <Suspense fallback={null}>
          <SatelliteViewer
            latitude={visor.latitude}
            longitude={visor.longitude}
            annotations={stage.blueprintAnnotations}
            onMarkerSelect={selection.handleBlueprintSelect}
          />
        </Suspense>
      ) : (
        <div id="viewer-container" ref={containerRef} />
      )}

      <StageStatus
        loading={nav.stagePending || currentStage?.id !== nav.committedStageId}
        progress={nav.stageProgress}
        error={nav.stageError}
        onRetry={nav.retryStage}
        raised={hasRecommended}
      />

      {layout.usePanel ? (
        <>
          <LotPanel
            {...lotUiProps}
            onSelectLot={openLotFromPanel}
            onHoverLot={hoverLot}
            collapsed={layout.collapsed}
            onToggleCollapsed={layout.toggleCollapsed}
          />
          {viewMode === 'panorama' && (
            <MapControls
              onZoomIn={camera.zoomIn}
              onZoomOut={camera.zoomOut}
              onReset={camera.resetView}
              hidden={panel.isOpen && panel.docked}
            />
          )}
        </>
      ) : (
        <LotFloat
          {...lotUiProps}
          onSelectLot={openLotFromList}
          compass={viewMode === 'panorama' && (
            <CompassTape heading={heading} northOffset={northOffset} onNorth={camera.faceNorth} />
          )}
        />
      )}

      <PoiPanel poi={panel.poi} onClose={closePanel} onGoToStage={goToStage} />
    </>
  );
}
