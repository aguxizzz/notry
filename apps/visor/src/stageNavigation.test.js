import { describe, it, expect } from 'vitest';
import { initialStageState, stageReducer, defaultViewModeForVisor } from './stageNavigation.js';

const pano = (id) => ({ id, name: id, visor: { panoramaUrl: `/${id}.jpg`, blueprintUrl: `/${id}.png` } });
const planOnly = (id) => ({ id, name: id, visor: { blueprintUrl: `/${id}.png` } });
const group = (stages, entryStageId = stages[0]?.id) => ({ stages, entryStageId });

describe('defaultViewModeForVisor', () => {
  it('panorama si hay, si no plano', () => {
    expect(defaultViewModeForVisor({ panoramaUrl: 'a', blueprintUrl: 'b' })).toBe('panorama');
    expect(defaultViewModeForVisor({ blueprintUrl: 'b' })).toBe('blueprint');
    expect(defaultViewModeForVisor(null)).toBe('panorama');
  });
});

describe('initialStageState', () => {
  it('sin grupo queda cargando', () => {
    expect(initialStageState(null)).toMatchObject({ currentStageId: null, committedStageId: null, pending: true });
  });

  it('arranca en la etapa de entrada, esperando el panorama', () => {
    const state = initialStageState(group([pano('a'), pano('b')], 'b'));
    expect(state).toMatchObject({ currentStageId: 'b', committedStageId: null, viewMode: 'panorama', pending: true, progress: 0 });
  });

  it('una etapa de entrada inexistente cae en la primera', () => {
    expect(initialStageState(group([pano('a')], 'zz')).currentStageId).toBe('a');
  });

  it('una etapa solo-plano queda lista sin esperar panorama', () => {
    const state = initialStageState(group([planOnly('a')]));
    expect(state).toMatchObject({ viewMode: 'blueprint', committedStageId: 'a', pending: false, progress: 100 });
  });
});

describe('stageReducer', () => {
  const start = initialStageState(group([pano('a'), pano('b'), planOnly('c')]));

  it('ready confirma la etapa que cargó', () => {
    const state = stageReducer(start, { type: 'ready', stageId: 'a' });
    expect(state).toMatchObject({ committedStageId: 'a', pending: false, progress: 100, error: null });
  });

  it('goToStage cambia de etapa sin perder la que se ve hasta que cargue', () => {
    const ready = stageReducer(start, { type: 'ready', stageId: 'a' });
    const state = stageReducer(ready, { type: 'goToStage', stageId: 'b' });
    expect(state).toMatchObject({ currentStageId: 'b', committedStageId: 'a', pending: true, progress: 0 });
  });

  it('goToStage a una etapa solo-plano pasa a plano y queda lista', () => {
    const state = stageReducer(start, { type: 'goToStage', stageId: 'c' });
    expect(state).toMatchObject({ currentStageId: 'c', viewMode: 'blueprint', committedStageId: 'c', pending: false });
  });

  it('goToStage a una etapa desconocida no hace nada', () => {
    expect(stageReducer(start, { type: 'goToStage', stageId: 'zz' })).toBe(start);
  });

  it('el progreso de otra etapa se ignora', () => {
    expect(stageReducer(start, { type: 'progress', stageId: 'b', progress: 50 })).toBe(start);
    expect(stageReducer(start, { type: 'progress', stageId: 'a', progress: 50 }).progress).toBe(50);
  });

  it('error y retry vuelven a pedir la etapa que falló', () => {
    const failed = stageReducer(start, { type: 'error', stageId: 'a', message: 'falló' });
    expect(failed).toMatchObject({ error: { stageId: 'a', message: 'falló' }, pending: false });
    const retried = stageReducer(failed, { type: 'retry' });
    expect(retried).toMatchObject({ currentStageId: 'a', error: null, pending: true, retryNonce: 1 });
    expect(stageReducer(start, { type: 'retry' })).toBe(start);
  });

  it('pasar a plano confirma la etapa; volver a panorama espera de nuevo', () => {
    const plan = stageReducer(start, { type: 'viewMode', mode: 'blueprint' });
    expect(plan).toMatchObject({ viewMode: 'blueprint', committedStageId: 'a', pending: false });
    const back = stageReducer(plan, { type: 'viewMode', mode: 'panorama' });
    expect(back).toMatchObject({ viewMode: 'panorama', committedStageId: 'a', pending: true, progress: 0 });
    expect(stageReducer(back, { type: 'viewMode', mode: 'panorama' })).toBe(back);
  });
});
