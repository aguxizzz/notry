// Estado de un edificio en edición y su sincronización con el servidor, sin React.
//
// Todas las acciones son optimistas: el estado local cambia al instante y el servidor se
// actualiza de fondo. Lo creado arranca con un id provisorio (`tmp-N`); cualquier llamada
// posterior sobre ese id espera al real con `realIdOf`. Si algo falla, al terminar todo lo
// pendiente se recarga el edificio desde el servidor.
//
// Cada acción pública queda en el historial (deshacer/rehacer). Por dentro, cada cambio es
// una operación que devuelve `{ undo, saved }`: el paso inverso para el historial y la
// promesa del guardado. Deshacer un borrado vuelve a crear la entidad con otro id; el id
// viejo queda como alias del nuevo, así la selección y los pasos anteriores la siguen.

import { createHistory } from './history.js';

export const isTemp = (id) => typeof id === 'string' && id.startsWith('tmp-');

// Una acción sobre algo cuya creación falló: se descarta sin mostrar otro error, porque
// la recarga posterior al fallo ya lo saca del estado.
class Orphaned extends Error {}

const NOTHING = { undo: null, saved: Promise.resolve(null) };

const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
// Lo que había en `obj` para las claves de `patch`; lo ausente como null, para que el PATCH
// de deshacer también lo vacíe en el servidor.
const valuesBefore = (obj, patch) => Object.fromEntries(Object.keys(patch).map((k) => [k, obj[k] ?? null]));

// Datos para volver a crear algo borrado (sin ids ni lo que asigna el servidor).
const floorData = (f) => omit(f, ['id', 'building_id', 'localKey', 'units']);
const unitData = (u) => omit(u, ['id', 'floor_id', 'building_id']);

export function createBuildingStore(buildingId, { api, debounceMs = 600 }) {
  let state = { building: null, status: '', error: null, canUndo: false, canRedo: false };
  const listeners = new Set();
  const pending = {}; // floorId -> { patch, timer }
  const pendingIds = new Map(); // id provisorio -> Promise<id real | null>
  const realIds = new Map(); // id provisorio -> id real, una vez creado
  const aliases = new Map(); // id de algo borrado -> id provisorio de su re-creación
  const lanes = new Map(); // id -> última llamada al servidor sobre esa entidad
  let inflight = 0;
  let reloadAfter = false;
  let tempSeq = 0;

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
  };
  const commit = (fn) => set({ building: fn(state.building) });

  const history = createHistory({
    onChange: () => set({ canUndo: history.canUndo(), canRedo: history.canRedo() }),
  });

  // Id actual de una entidad: sigue re-creaciones (alias) y adopciones del id real.
  const canon = (id) => {
    let current = id;
    for (;;) {
      const next = aliases.get(current) ?? realIds.get(current);
      if (next == null) return current;
      current = next;
    }
  };
  // Id real a partir del id local de una entidad (provisorio o real) tal como estaba al
  // momento de la acción. No sigue alias a propósito: algo encolado antes de un borrado no
  // tiene que saltar a la re-creación, que justamente espera a ese borrado.
  const realIdOf = async (localId) => {
    const real = await (pendingIds.get(localId) ?? localId);
    if (real == null) throw new Orphaned();
    return real;
  };

  // Las llamadas sobre una misma entidad van en fila: un PATCH no adelanta al anterior y la
  // re-creación de algo borrado espera a que el borrado haya terminado.
  function inLane(key, fn) {
    const next = (lanes.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
    lanes.set(key, next);
    return next;
  }

  // Guardado de fondo de una llamada sobre la entidad `localId`.
  const callOn = (localId, fn) => run(() => inLane(localId, async () => fn(await realIdOf(localId))));

  const findFloor = (id) => state.building.floors.find((f) => f.id === canon(id)) || null;
  const findUnit = (id) => state.building.floors.flatMap((f) => f.units).find((u) => u.id === canon(id)) || null;

  const mapFloorIn = (b, id, fn) => ({ ...b, floors: b.floors.map((f) => (f.id === canon(id) ? fn(f) : f)) });
  const mapUnitIn = (b, id, fn) => ({
    ...b,
    floors: b.floors.map((f) => ({ ...f, units: f.units.map((u) => (u.id === canon(id) ? fn(u) : u)) })),
  });

  async function load() {
    try {
      set({ building: await api.getBuilding(buildingId) });
      history.clear(); // los pasos guardados apuntan al estado anterior a la recarga
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
  // `adopt` le pone el id real a la copia local. `replaces` es el id de lo borrado que se
  // está re-creando (deshacer).
  function insert(addLocal, create, adopt, replaces) {
    const tempId = `tmp-${++tempSeq}`;
    const previous = replaces && lanes.get(replaces); // el borrado de lo que se re-crea
    if (replaces) aliases.set(canon(replaces), tempId);
    commit((b) => addLocal(b, tempId));
    const idPromise = run(async () => {
      await previous?.catch(() => {});
      const created = await create();
      commit((b) => adopt(b, tempId, created));
      realIds.set(tempId, created.id);
      return created.id;
    });
    pendingIds.set(tempId, idPromise);
    return { id: tempId, saved: idPromise };
  }

  // ── Operaciones (aplican el cambio y devuelven su inverso) ──
  function patchBuilding(patch) {
    const before = valuesBefore(state.building, patch);
    commit((b) => ({ ...b, ...patch }));
    return {
      undo: () => patchBuilding(before).undo,
      saved: run(() => inLane(buildingId, () => api.updateBuilding(buildingId, patch))),
    };
  }

  // El debounce se indexa por una clave que no cambia cuando el piso adopta su id real.
  const pendingKey = (floor) => floor.localKey ?? floor.id;

  // Lo que estaba esperando el debounce de ese piso, sacado de la espera.
  function takePending(key) {
    const entry = pending[key];
    if (!entry) return {};
    clearTimeout(entry.timer);
    delete pending[key];
    return entry.patch;
  }

  const sendFloor = (localId, body) => callOn(localId, (id) => api.updateFloor(id, body));

  // Cambios continuos (sliders, números) se agrupan antes de pegarle al servidor. Un cambio
  // sin debounce se lleva también lo que estaba esperando, así no lo pisa después.
  function patchFloor(id, patch, { debounce = false, before } = {}) {
    const floor = findFloor(id);
    if (!floor) return NOTHING;
    const undoTo = valuesBefore(before ?? floor, patch);
    commit((b) => mapFloorIn(b, id, (f) => ({ ...f, ...patch })));
    const undo = () => patchFloor(id, undoTo).undo;
    const key = pendingKey(floor);
    const body = { ...takePending(key), ...patch };
    if (!debounce) return { undo, saved: sendFloor(floor.id, body) };

    set({ status: 'Cambios sin guardar…' });
    const timer = setTimeout(() => sendFloor(floor.id, takePending(key)), debounceMs);
    pending[key] = { patch: body, timer };
    return { undo, saved: null };
  }

  function createFloor(data, units = [], replaces) {
    const { id, saved } = insert(
      (b, tempId) => ({ ...b, floors: [...b.floors, { ...data, id: tempId, localKey: tempId, units: [] }] }),
      () => api.createFloor(buildingId, data),
      (b, tempId, created) => mapFloorIn(b, tempId, (f) => ({ ...f, id: created.id, building_id: created.building_id })),
      replaces
    );
    // Las unidades viajan con el piso: deshacer el alta (o el borrado) es un solo paso.
    for (const u of units) createUnit(id, unitData(u), u.id);
    return { id, undo: () => deleteFloor(id).undo, saved };
  }

  function deleteFloor(id) {
    const floor = findFloor(id);
    if (!floor) return NOTHING;
    takePending(pendingKey(floor)); // lo que esperaba ya está en `floor`, para deshacer
    commit((b) => ({ ...b, floors: b.floors.filter((f) => f.id !== floor.id) }));
    return {
      undo: () => createFloor(floorData(floor), floor.units, floor.id).undo,
      saved: callOn(floor.id, api.deleteFloor),
    };
  }

  function createUnit(floorId, data, replaces) {
    const floorLocalId = canon(floorId);
    const { id, saved } = insert(
      (b, tempId) => mapFloorIn(b, floorId, (f) => ({ ...f, units: [...f.units, { ...data, id: tempId, floor_id: f.id }] })),
      async () => api.createUnit(await realIdOf(floorLocalId), data),
      (b, tempId, created) =>
        mapUnitIn(b, tempId, (u) => ({ ...u, id: created.id, floor_id: created.floor_id, building_id: created.building_id })),
      replaces
    );
    return { id, undo: () => deleteUnit(id).undo, saved };
  }

  function patchUnit(id, patch) {
    const unit = findUnit(id);
    if (!unit) return NOTHING;
    const before = valuesBefore(unit, patch);
    commit((b) => mapUnitIn(b, id, (u) => ({ ...u, ...patch })));
    return {
      undo: () => patchUnit(id, before).undo,
      saved: callOn(unit.id, (realId) => api.updateUnit(realId, patch)),
    };
  }

  function deleteUnit(id) {
    const unit = findUnit(id);
    if (!unit) return NOTHING;
    const floorId = state.building.floors.find((f) => f.units.includes(unit)).id;
    commit((b) => ({ ...b, floors: b.floors.map((f) => ({ ...f, units: f.units.filter((u) => u.id !== unit.id) })) }));
    return {
      undo: () => createUnit(floorId, unitData(unit), unit.id).undo,
      saved: callOn(unit.id, api.deleteUnit),
    };
  }

  // Aplica una operación y la deja en el historial. Devuelve la promesa del guardado.
  const recorded = ({ undo, saved }, mergeKey) => {
    history.record(undo, mergeKey);
    return saved;
  };

  // ── Edificio ────────────────────────────────────────────────
  const saveBuilding = (patch) => recorded(patchBuilding(patch));

  // No es optimista ni se puede deshacer: devuelve true si se borró.
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
  // `units`: unidades a crear junto con el piso (duplicar piso).
  function insertFloor(data, units = []) {
    const op = createFloor(data, units);
    recorded(op);
    return op.id;
  }

  // `before`: valores a restaurar al deshacer, cuando el estado local ya no los tiene (la
  // vista previa de una imagen los pisó antes de guardar).
  const saveFloor = (id, patch, opts = {}) =>
    recorded(patchFloor(id, patch, opts), opts.debounce && `floor:${canon(id)}:${Object.keys(patch).sort()}`);

  // Solo local, sin guardar ni historial: p. ej. la vista previa de una imagen mientras se sube.
  const previewFloor = (id, patch) => commit((b) => mapFloorIn(b, id, (f) => ({ ...f, ...patch })));

  const removeFloor = (id) => recorded(deleteFloor(id));

  // Devuelve `{ url }` o null si falló.
  const uploadImage = (file, purpose) => run(() => api.uploadImage(buildingId, file, purpose));

  // ── Unidades ────────────────────────────────────────────────
  function insertUnit(floorId, data) {
    const op = createUnit(floorId, data);
    recorded(op);
    return op.id;
  }

  const saveUnit = (id, patch) => recorded(patchUnit(id, patch));
  const removeUnit = (id) => recorded(deleteUnit(id));

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
    undo: history.undo,
    redo: history.redo,
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
