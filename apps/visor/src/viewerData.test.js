import { describe, it, expect, afterEach, vi } from 'vitest';
import { getViewerDataUrl, getBrandingSlugsFromPath, normalizeLoadingGallery, normalizeToGroup } from './viewerData.js';
import { API_BASE } from './api/config.js';

function atUrl(pathname, search = '') {
  vi.stubGlobal('window', { location: { pathname, search } });
}

afterEach(() => vi.unstubAllGlobals());

describe('getViewerDataUrl', () => {
  it('?data= tiene prioridad sobre el slug del path', () => {
    atUrl('/paseoberlin', '?data=%20https://x.test/visor.json%20');
    expect(getViewerDataUrl()).toBe('https://x.test/visor.json');
  });

  it('un slug pide el grupo del proyecto', () => {
    atUrl('/paseoberlin/');
    expect(getViewerDataUrl()).toBe(`${API_BASE}/public/projects/by-slug/paseoberlin/group_visor_data`);
  });

  it('proyecto + loteo pide el loteo puntual', () => {
    atUrl('/paseoberlin/mitte');
    expect(getViewerDataUrl()).toBe(`${API_BASE}/public/projects/by-slug/paseoberlin/loteos/by-slug/mitte/group_visor_data`);
  });

  it('sin slug ni ?data= no hay visor (flujo de login)', () => {
    atUrl('/', '?data=%20%20');
    expect(getViewerDataUrl()).toBeNull();
  });
});

describe('getBrandingSlugsFromPath', () => {
  it('devuelve null en lo que falta', () => {
    atUrl('/paseoberlin');
    expect(getBrandingSlugsFromPath()).toEqual({ projectSlug: 'paseoberlin', loteoSlug: null });
  });
});

describe('normalizeLoadingGallery', () => {
  it('acepta strings sueltos, descarta entradas sin url y recorta a 6', () => {
    const raw = ['a.jpg', { url: 'b.jpg', caption: '  Club  ' }, { caption: 'sin url' }, null, 'c', 'd', 'e', 'f', 'g'];
    expect(normalizeLoadingGallery(raw)).toEqual([
      { url: 'a.jpg', caption: '' },
      { url: 'b.jpg', caption: 'Club' },
      { url: 'c', caption: '' },
      { url: 'd', caption: '' },
      { url: 'e', caption: '' },
      { url: 'f', caption: '' },
    ]);
  });

  it('cualquier cosa que no sea array da lista vacía', () => {
    expect(normalizeLoadingGallery(undefined)).toEqual([]);
    expect(normalizeLoadingGallery({ url: 'x' })).toEqual([]);
  });
});

describe('normalizeToGroup', () => {
  it('group_visor_data: respeta entry_stage_id y mapea los campos', () => {
    const group = normalizeToGroup({
      project_id: 7,
      entry_stage_id: 'b',
      stages: [{ id: 'a' }, { id: 'b' }],
      project: { name: 'P' },
      whatsapp_phone: '+54911',
      hide_contact_form: true,
      loading_gallery: ['x.jpg'],
    });
    expect(group).toMatchObject({
      projectId: 7,
      entryStageId: 'b',
      project: { name: 'P' },
      whatsappPhone: '+54911',
      hideContactForm: true,
      loadingGallery: [{ url: 'x.jpg', caption: '' }],
    });
    expect(group.stages).toHaveLength(2);
  });

  it('sin entry_stage_id arranca en la primera etapa', () => {
    expect(normalizeToGroup({ stages: [{ id: 'a' }, { id: 'b' }] }).entryStageId).toBe('a');
  });

  it('visor_data plano (forma vieja) se envuelve en una etapa única', () => {
    const visor = { panoramaUrl: 'p.jpg', annotations: [] };
    const group = normalizeToGroup(visor);
    expect(group.entryStageId).toBe('single');
    expect(group.stages).toEqual([{ id: 'single', name: '', orden: 0, visor }]);
    expect(group.hideContactForm).toBe(false);
  });
});
