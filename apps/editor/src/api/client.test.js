import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError, apiRequest, errorMessage } from './client.js';
import { API_BASE, setActiveOrgId } from './config.js';
import { assignLotCoordinates } from './lots.js';
import { listLoteos, patchLoteo } from './loteos.js';

const jsonResponse = (status, body) => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } },
);

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  setActiveOrgId(null);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1);
  return { url, init, headers: init.headers };
};

describe('apiRequest', () => {
  test('arma la URL contra API_BASE y devuelve el JSON', async () => {
    await expect(apiRequest('/loteos/1')).resolves.toEqual({ ok: true });
    expect(lastCall().url).toBe(`${API_BASE}/loteos/1`);
  });

  test('una URL absoluta se usa tal cual', async () => {
    await apiRequest('https://otro.host/visor_data');
    expect(lastCall().url).toBe('https://otro.host/visor_data');
  });

  test('sin token no manda Authorization', async () => {
    await apiRequest('/auth/login', { method: 'POST', body: { a: 1 } });
    expect(lastCall().headers).toEqual({ 'Content-Type': 'application/json' });
    expect(lastCall().init.body).toBe('{"a":1}');
  });

  test('con token manda Authorization y la org activa ambiental', async () => {
    setActiveOrgId('org-1');
    await apiRequest('/loteos', { token: 'tk' });
    expect(lastCall().headers).toEqual({ Authorization: 'Bearer tk', 'X-Active-Org-Id': 'org-1' });
  });

  test('orgId explícito pisa al ambiental (y null lo saca)', async () => {
    setActiveOrgId('org-1');
    await apiRequest('/loteos', { token: 'tk', orgId: 'org-2' });
    expect(lastCall().headers['X-Active-Org-Id']).toBe('org-2');
    await apiRequest('/loteos', { token: 'tk', orgId: null });
    expect(lastCall().headers).not.toHaveProperty('X-Active-Org-Id');
  });

  test('respuesta vacía (204) devuelve null', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiRequest('/lots/1', { method: 'DELETE', token: 'tk' })).resolves.toBeNull();
  });

  test('error HTTP: ApiError con status y el detail del backend', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { detail: 'Nombre duplicado' }));
    const error = await apiRequest('/lots', { method: 'POST', token: 'tk', body: {} }).catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, detail: 'Nombre duplicado', message: 'Nombre duplicado' });
  });

  test('422 de FastAPI: junta los mensajes de validación', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(422, { detail: [{ msg: 'campo requerido' }, { msg: 'muy largo' }] }));
    const error = await apiRequest('/lots').catch(e => e);
    expect(error.detail).toBe('campo requerido; muy largo');
  });

  test('error sin cuerpo JSON: mensaje con el status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal error', { status: 500 }));
    const error = await apiRequest('/lots').catch(e => e);
    expect(error).toMatchObject({ status: 500, detail: null, message: 'HTTP 500' });
  });

  test('401 se marca como isUnauthorized', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: 'Token vencido' }));
    const error = await apiRequest('/loteos', { token: 'tk' }).catch(e => e);
    expect(error.isUnauthorized).toBe(true);
  });

  test('falla de red: ApiError con network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const error = await apiRequest('/loteos').catch(e => e);
    expect(error).toMatchObject({ network: true, status: null });
  });

  test('timeout: aborta y devuelve ApiError con timeout', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = apiRequest('/loteos', { timeoutMs: 1000 }).catch(e => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ timeout: true });
  });
});

describe('errorMessage', () => {
  test('usa el detail del backend si hay', () => {
    expect(errorMessage(new ApiError('Nombre duplicado', { status: 400, detail: 'Nombre duplicado' }), 'fb')).toBe('Nombre duplicado');
  });

  test('HTTP sin detail cae al fallback', () => {
    expect(errorMessage(new ApiError('HTTP 500', { status: 500 }), 'No se pudo guardar.')).toBe('No se pudo guardar.');
  });

  test('timeout, red y errores comunes muestran su mensaje', () => {
    expect(errorMessage(new ApiError('El servidor tardó demasiado en responder.', { timeout: true }), 'fb'))
      .toBe('El servidor tardó demasiado en responder.');
    expect(errorMessage(new Error('El visor no está listo'), 'fb')).toBe('El visor no está listo');
    expect(errorMessage(null, 'fb')).toBe('fb');
  });
});

describe('endpoints', () => {
  test('patchLoteo manda PATCH con el body', async () => {
    await patchLoteo('tk', 'L1', { north_offset: null });
    expect(lastCall().url).toBe(`${API_BASE}/loteos/L1`);
    expect(lastCall().init.method).toBe('PATCH');
    expect(lastCall().init.body).toBe('{"north_offset":null}');
  });

  test('listLoteos agrega limit solo si se pide', async () => {
    await listLoteos('tk');
    expect(lastCall().url).toBe(`${API_BASE}/loteos`);
    await listLoteos('tk', { limit: 100 });
    expect(lastCall().url).toBe(`${API_BASE}/loteos?limit=100`);
  });

  test('assignLotCoordinates elige el endpoint según el espacio', async () => {
    await assignLotCoordinates('tk', { uuid: 'u', polygonPoints: [], space: 'blueprint' });
    expect(lastCall().url).toBe(`${API_BASE}/lots/update-blueprint-coordinates`);
    await assignLotCoordinates('tk', { uuid: 'u', polygonPoints: [], space: 'panorama' });
    expect(lastCall().url).toBe(`${API_BASE}/lots/update-coordinates`);
  });
});
