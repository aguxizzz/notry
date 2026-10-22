import { useEffect, useState, useSyncExternalStore } from 'react';
import * as api from './api.js';
import { createBuildingStore } from './buildingStore.js';

// Un store por montaje: BuildingEditor va con `key={buildingId}`.
export function useBuildingStore(buildingId) {
  const [store] = useState(() => createBuildingStore(buildingId, { api }));
  const state = useSyncExternalStore(store.subscribe, store.getState);
  useEffect(() => {
    store.load();
  }, [store]);
  return [state, store];
}
