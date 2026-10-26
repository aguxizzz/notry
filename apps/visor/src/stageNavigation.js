// Qué etapa del loteo se ve, en qué modo (panorama/plano/satelital) y en qué
// punto de la carga está. El reducer es puro (stageNavigation.test.js).
//
//   currentStageId   — la etapa elegida
//   committedStageId — la última que terminó de cargar (la que se ve)
//   pending/progress — carga del panorama en curso
//   error            — { stageId, message } si la carga falló
//   retryNonce       — sube con cada reintento para forzar la recarga

// Panorama es la vista por defecto salvo que la etapa no tenga panorama y sí
// blueprint (etapa blueprint-only) — caso real: el editor permite guardar
// una etapa con solo el plano cargado.
export function defaultViewModeForVisor(visor) {
  if (visor?.panoramaUrl) return 'panorama';
  if (visor?.blueprintUrl) return 'blueprint';
  return 'panorama';
}

// Plano y satelital no esperan a ningún panorama: quedan listos al entrar.
function showStage(state, stage, viewMode) {
  const next = { ...state, currentStageId: stage?.id ?? null, viewMode, error: null };
  if (viewMode === 'panorama') return { ...next, pending: true, progress: 0 };
  return { ...next, committedStageId: stage?.id ?? null, pending: false, progress: 100 };
}

export function initialStageState(group) {
  const stages = group?.stages ?? [];
  const entry = stages.find((s) => s.id === group?.entryStageId) ?? stages[0] ?? null;
  const empty = {
    group, currentStageId: null, committedStageId: null, viewMode: 'panorama',
    pending: true, progress: 0, error: null, retryNonce: 0,
  };
  return entry ? showStage(empty, entry, defaultViewModeForVisor(entry.visor)) : empty;
}

export function stageReducer(state, action) {
  switch (action.type) {
    case 'group':
      return initialStageState(action.group);

    case 'goToStage': {
      const stage = state.group?.stages?.find((s) => s.id === action.stageId);
      return stage ? showStage(state, stage, defaultViewModeForVisor(stage.visor)) : state;
    }

    case 'viewMode': {
      if (action.mode === state.viewMode) return state;
      const stage = state.group?.stages?.find((s) => s.id === state.currentStageId) ?? null;
      return showStage(state, stage, action.mode);
    }

    case 'ready':
      return { ...state, committedStageId: action.stageId, pending: false, progress: 100, error: null };

    case 'error':
      return { ...state, error: { stageId: action.stageId, message: action.message }, pending: false };

    case 'progress':
      return action.stageId === state.currentStageId ? { ...state, progress: action.progress ?? 0 } : state;

    case 'retry':
      if (!state.error) return state;
      return {
        ...state,
        currentStageId: state.error.stageId,
        error: null,
        pending: true,
        progress: 0,
        retryNonce: state.retryNonce + 1,
      };

    default:
      return state;
  }
}
