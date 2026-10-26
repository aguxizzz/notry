import { useReducer, useMemo, useCallback, useEffect, useRef } from 'react';
import { trackEvent } from '../analytics.js';
import { stageReducer, initialStageState } from '../stageNavigation.js';

/**
 * Etapa visible, modo de vista y estado de carga (ver stageNavigation.js),
 * más lo que se deriva del grupo: etapas, nombres y modos disponibles.
 */
export function useStageNavigation(group) {
  const [state, dispatch] = useReducer(stageReducer, group, initialStageState);
  // Llegó (o cambió) el grupo: se arranca de nuevo en su etapa de entrada.
  if (state.group !== group) dispatch({ type: 'group', group });

  const stages = useMemo(() => group?.stages ?? [], [group]);
  const currentStage = useMemo(
    () => stages.find((s) => s.id === state.currentStageId) ?? stages[0] ?? null,
    [stages, state.currentStageId]
  );

  // Mapa id→nombre de etapa para resolver el destino de un POI de navegación.
  const stageNameById = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s.name])),
    [stages]
  );

  const visor = currentStage?.visor;
  const hasSatellite = visor?.latitude != null && visor?.longitude != null;
  const availableViewModes = useMemo(() => {
    const modes = [];
    if (visor?.panoramaUrl) modes.push('panorama');
    if (visor?.blueprintUrl) modes.push('blueprint');
    if (hasSatellite) modes.push('satellite');
    return modes;
  }, [visor?.panoramaUrl, visor?.blueprintUrl, hasSatellite]);

  // Un solo evento de inicio de sesión por visita, con la etapa de entrada.
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (sessionStartedRef.current || !currentStage?.id) return;
    sessionStartedRef.current = true;
    trackEvent(currentStage.id, 'session_start');
  }, [currentStage?.id]);

  const goToStage = useCallback((stageId) => {
    if (!stages.some((s) => s.id === stageId)) return;
    dispatch({ type: 'goToStage', stageId });
    trackEvent(stageId, 'stage_change');
  }, [stages]);

  const selectViewMode = useCallback((mode) => dispatch({ type: 'viewMode', mode }), []);
  const retryStage = useCallback(() => dispatch({ type: 'retry' }), []);

  // Callbacks de useViewer (la carga del panorama).
  const onStageReady = useCallback(({ stageId, markersOk }) => {
    dispatch({ type: 'ready', stageId });
    if (!markersOk) console.warn(`La etapa ${stageId} cargó con anotaciones inválidas omitidas.`);
  }, []);
  const onStageError = useCallback(({ stageId, message }) => dispatch({ type: 'error', stageId, message }), []);
  const onStageProgress = useCallback(({ stageId, progress }) => dispatch({ type: 'progress', stageId, progress }), []);

  return {
    stages,
    currentStage,
    stageNameById,
    availableViewModes,
    viewMode: state.viewMode,
    committedStageId: state.committedStageId,
    stagePending: state.pending,
    stageProgress: state.progress,
    stageError: state.error,
    retryNonce: state.retryNonce,
    goToStage,
    selectViewMode,
    retryStage,
    onStageReady,
    onStageError,
    onStageProgress,
  };
}
