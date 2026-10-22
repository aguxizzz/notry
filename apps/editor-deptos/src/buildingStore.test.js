import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBuildingStore, isTemp } from './buildingStore.js';

// Promesa que el test resuelve o rechaza a mano, para controlar el orden de las respuestas.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

const BUILDING = {
  id: 'b1',
  name: 'Torre',
  floors: [{ id: 'f1', code: 'PB', level: 0, units: [{ id: 'u1', code: 'PBA', status: 'available' }] }],
};

function fakeApi(overrides = {}) {
  return {
    getBuilding: vi.fn(async () => structuredClone(BUILDING)),
    updateBuilding: vi.fn(async () => ({})),
    deleteBuilding: vi.fn(async () => null),
    createFloor: vi.fn(async (_b, data) => ({ ...data, id: 'f-real', building_id: 'b1' })),
    updateFloor: vi.fn(async () => ({})),
    deleteFloor: vi.fn(async () => null),
    createUnit: vi.fn(async (floorId, data) => ({ ...data, id: 'u-real', floor_id: floorId, building_id: 'b1' })),
    updateUnit: vi.fn(async () => ({})),
    deleteUnit: vi.fn(async () => null),
    uploadImage: vi.fn(async () => ({ url: 'https://cdn/x.png' })),
    ...overrides,
  };
}

async function loadedStore(api, opts) {
  const store = createBuildingStore('b1', { api, ...opts });
  await store.load();
  return store;
}

const floorsOf = (store) => store.getState().building.floors;

afterEach(() => vi.useRealTimers());

describe('altas optimistas', () => {
  it('el piso aparece al instante con id provisorio y después adopta el real', async () => {
    const created = deferred();
    const api = fakeApi({ createFloor: vi.fn(() => created.promise) });
    const store = await loadedStore(api);

    const tempId = store.insertFloor({ code: '1', level: 1 });
    expect(isTemp(tempId)).toBe(true);
    expect(floorsOf(store).map((f) => f.id)).toEqual(['f1', tempId]);

    created.resolve({ id: 'f-real', building_id: 'b1' });
    await settle();
    expect(floorsOf(store).map((f) => f.id)).toEqual(['f1', 'f-real']);
    expect(store.canon(tempId)).toBe('f-real');
    expect(floorsOf(store)[1].localKey).toBe(tempId); // FloorCanvas no re-encuadra
  });

  it('una unidad en un piso que se está creando espera el id real del piso', async () => {
    const created = deferred();
    const api = fakeApi({ createFloor: vi.fn(() => created.promise) });
    const store = await loadedStore(api);

    const floorTemp = store.insertFloor({ code: '1', level: 1 });
    store.insertUnit(floorTemp, { code: '1A' });
    await settle();
    expect(api.createUnit).not.toHaveBeenCalled();

    created.resolve({ id: 'f-real', building_id: 'b1' });
    await settle();
    expect(api.createUnit).toHaveBeenCalledWith('f-real', { code: '1A' });
    expect(floorsOf(store)[1].units.map((u) => u.id)).toEqual(['u-real']);
  });

  it('borrar algo que todavía se está creando espera el id real', async () => {
    const created = deferred();
    const api = fakeApi({ createFloor: vi.fn(() => created.promise) });
    const store = await loadedStore(api);

    const tempId = store.insertFloor({ code: '1', level: 1 });
    store.removeFloor(tempId);
    expect(floorsOf(store).map((f) => f.id)).toEqual(['f1']);

    created.resolve({ id: 'f-real', building_id: 'b1' });
    await settle();
    expect(api.deleteFloor).toHaveBeenCalledWith('f-real');
    expect(floorsOf(store).map((f) => f.id)).toEqual(['f1']); // no reaparece al adoptar
  });
});

describe('fallos', () => {
  it('si falla crear un piso, lo que dependía de él se descarta sin otro error y se recarga una vez', async () => {
    const api = fakeApi({ createFloor: vi.fn(async () => Promise.reject(new Error('Sin conexión'))) });
    const store = await loadedStore(api);
    api.getBuilding.mockClear();

    const floorTemp = store.insertFloor({ code: '1', level: 1 });
    store.insertUnit(floorTemp, { code: '1A' });
    store.insertUnit(floorTemp, { code: '1B' });
    store.saveFloor(floorTemp, { name: 'Piso 1' });
    await settle();
    await settle();

    expect(api.createUnit).not.toHaveBeenCalled();
    expect(api.updateFloor).not.toHaveBeenCalled();
    expect(store.getState().error).toBe('Sin conexión');
    expect(store.getState().status).toMatch(/No se pudo guardar/);
    expect(api.getBuilding).toHaveBeenCalledTimes(1);
    expect(floorsOf(store).map((f) => f.id)).toEqual(['f1']); // la recarga lo sacó
  });

  it('el error queda hasta que una tanda posterior se guarda entera', async () => {
    const api = fakeApi({ updateUnit: vi.fn().mockRejectedValueOnce(new Error('409')) });
    const store = await loadedStore(api);

    await store.saveUnit('u1', { code: 'X' });
    await settle();
    expect(store.getState().error).toBe('409');

    await store.saveUnit('u1', { code: 'PBA' });
    expect(store.getState().error).toBeNull();
    expect(store.getState().status).toBe('Guardado');
  });

  it('un error no se borra mientras otra acción de la misma tanda sigue en curso', async () => {
    const slow = deferred();
    const api = fakeApi({
      updateUnit: vi.fn().mockRejectedValueOnce(new Error('409')),
      updateFloor: vi.fn(() => slow.promise),
    });
    const store = await loadedStore(api);

    store.saveFloor('f1', { name: 'x' });
    await store.saveUnit('u1', { code: 'X' });
    expect(store.getState().error).toBe('409');
    expect(store.getState().status).toBe('Guardando…');

    slow.resolve({});
    await settle();
    expect(store.getState().error).toBe('409');
    expect(store.getState().status).toMatch(/No se pudo guardar/);
  });
});

describe('debounce de pisos', () => {
  it('cambios seguidos se mandan juntos en un solo PATCH', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const store = await loadedStore(api, { debounceMs: 600 });

    store.saveFloor('f1', { alignment: { x: 1 } }, { debounce: true });
    store.saveFloor('f1', { alignment: { x: 2 } }, { debounce: true });
    store.saveFloor('f1', { name: 'PB' }, { debounce: true });
    expect(floorsOf(store)[0].alignment).toEqual({ x: 2 }); // local al instante
    expect(store.getState().status).toBe('Cambios sin guardar…');
    expect(api.updateFloor).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(api.updateFloor).toHaveBeenCalledTimes(1);
    expect(api.updateFloor).toHaveBeenCalledWith('f1', { alignment: { x: 2 }, name: 'PB' });
  });
});

describe('suscripción', () => {
  it('avisa en cada cambio y deja de avisar al desuscribirse', async () => {
    const store = await loadedStore(fakeApi());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.previewFloor('f1', { plan_image_url: 'blob:x' });
    expect(listener).toHaveBeenCalled();
    expect(floorsOf(store)[0].plan_image_url).toBe('blob:x');

    unsubscribe();
    listener.mockClear();
    store.setStatus('hola');
    expect(listener).not.toHaveBeenCalled();
  });
});
