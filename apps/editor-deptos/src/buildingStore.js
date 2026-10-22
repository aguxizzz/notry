// Estado de un edificio en edición y su sincronización con el servidor, sin React.
//
// Todas las acciones son optimistas: el estado local cambia al instante y el servidor se
// actualiza de fondo. Lo creado arranca con un id provisorio (`tmp-N`); cualquier llamada
// posterior sobre ese id espera al real con `resolveId`. Si algo falla, al terminar todo lo
// pendiente se recarga el edificio desde el servidor.

export const isTemp = (id) => typeof id === 'string' && id.startsWith('tmp-');

// Una acción sobre algo cuya creación falló: se descarta sin mostrar otro error, porque
// la recarga posterior al fallo ya lo saca del estado.
class Orphaned extends Error {}

export function createBuildingStore(buildingId, { api, debounceMs = 600 }) {
  let state = { building: null, status: '', error: null };
  const listeners = new Set();
  const pending = {}; // floorId -> { patch, timer }
  const pendingIds = new Map(); // id provisorio -> Promise<id real | null>
  const realIds = new Map(); // id provisorio -> id real, una vez creado
  let inflight = 0;
  let reloadAfter = false;
  let tempSeq = 0;

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const commit = (fn) => set({ building: fn(state.building) });

  const canon = (id) => realIds.get(id) ?? id;
  const resolveId = async (id) => {
    const real = await (pendingIds.get(id) ?? id);
    if (real == null) throw new Orphaned();
    return real;
  };

  const mapFloorIn = (b, id, fn) => ({ ...b, floors: b.floors.map((f) => (f.id === canon(id) ? fn(f) : f)) });
  const mapUnitIn = (b, id, fn) => ({
    ...b,
    floors: b.floors.map((f) => ({ ...f, units: f.units.map((u) => (u.id === canon(id) ? fn(u) : u)) })),
  });

  async function load() {
    try {
      set({ building: await api.getBuilding(buildingId) });
    } catch (err) {
      set({ error: err.message });
    }
  }

  async function run(fn) {
    inflight++;
    set({ status: 'Guardando…' });
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof Orphaned)) {
        set({ error: err.message });
        reloadAfter = true;
      }
      return null;
    } finally {
      inflight--;
      // El estado refleja la tanda completa: el error queda visible hasta que una tanda
      // posterior se guarde entera sin fallos.
      if (!inflight) {
        if (reloadAfter) {
          reloadAfter = false;
          set({ status: 'No se pudo guardar; se recargó desde el servidor' });
          load(); // re-sincroniza con el servidor tras un fallo optimista
        } else {
          set({ status: 'Guardado', error: null });
        }
      }
    }
  }

  // Alta optimista: `addLocal` agrega con el id provisorio, `create` devuelve lo creado y
  // `adopt` le pone el id real a la copia local.
  function insert(addLocal, create, adopt) {
    const tempId = `tmp-${++tempSeq}`;
    commit((b) => addLocal(b, tempId));
    const idPromise = run(async () => {
      const created = await create();
      commit((b) => adopt(b, tempId, created));
      realIds.set(tempId, created.id);
      return created.id;
    });
    pendingIds.set(tempId, idPromise);
    return tempId;
  }

  // ── Edificio ────────────────────────────────────────────────
  function saveBuilding(patch) {
    commit((b) => ({ ...b, ...patch }));
    return run(() => api.updateBuilding(buildingId, patch));
  }

  // No es optimista: devuelve true si se borró.
  async function removeBuilding() {
    try {
      await api.deleteBuilding(buildingId);
      return true;
    } catch (err) {
      set({ error: err.message });
      return false;
    }
  }

  // ── Pisos ───────────────────────────────────────────────────
  const insertFloor = (data) =>
    insert(
      (b, tempId) => ({ ...b, floors: [...b.floors, { ...data, id: tempId, localKey: tempId, units: [] }] }),
      () => api.createFloor(buildingId, data),
      (b, tempId, created) => mapFloorIn(b, tempId, (f) => ({ ...f, id: created.id, building_id: created.building_id }))
    );

  // Cambios continuos (sliders, números) se agrupan antes de pegarle al servidor.
  function saveFloor(id, patch, { debounce = false } = {}) {
    commit((b) => mapFloorIn(b, id, (f) => ({ ...f, ...patch })));
    if (!debounce) return run(async () => api.updateFloor(await resolveId(id), patch));
    const entry = pending[id] || { patch: {} };
    clearTimeout(entry.timer);
    entry.patch = { ...entry.patch, ...patch };
    set({ status: 'Cambios sin guardar…' });
    entry.timer = setTimeout(() => {
      const body = entry.patch;
      delete pending[id];
      run(async () => api.updateFloor(await resolveId(id), body));
    }, debounceMs);
    pending[id] = entry;
    return null;
  }

  // Solo local, sin guardar: p. ej. la vista previa de una imagen mientras se sube.
  const previewFloor = (id, patch) => commit((b) => mapFloorIn(b, id, (f) => ({ ...f, ...patch })));

  function removeFloor(id) {
    commit((b) => ({ ...b, floors: b.floors.filter((f) => f.id !== canon(id)) }));
    return run(async () => api.deleteFloor(await resolveId(id)));
  }

  // Devuelve `{ url }` o null si falló.
  const uploadImage = (file, purpose) => run(() => api.uploadImage(buildingId, file, purpose));

  // ── Unidades ────────────────────────────────────────────────
  const insertUnit = (floorId, data) =>
    insert(
      (b, tempId) => mapFloorIn(b, floorId, (f) => ({ ...f, units: [...f.units, { ...data, id: tempId, floor_id: f.id }] })),
      async () => api.createUnit(await resolveId(floorId), data),
      (b, tempId, created) =>
        mapUnitIn(b, tempId, (u) => ({ ...u, id: created.id, floor_id: created.floor_id, building_id: created.building_id }))
    );

  function saveUnit(id, patch) {
    commit((b) => mapUnitIn(b, id, (u) => ({ ...u, ...patch })));
    return run(async () => api.updateUnit(await resolveId(id), patch));
  }

  function removeUnit(id) {
    commit((b) => ({ ...b, floors: b.floors.map((f) => ({ ...f, units: f.units.filter((u) => u.id !== canon(id)) })) }));
    return run(async () => api.deleteUnit(await resolveId(id)));
  }

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    canon,
    load,
    setStatus: (status) => set({ status }),
    setError: (error) => set({ error }),
    saveBuilding,
    removeBuilding,
    insertFloor,
    saveFloor,
    previewFloor,
    removeFloor,
    uploadImage,
    insertUnit,
    saveUnit,
    removeUnit,
  };
}
