import { API_BASE, fetchWithTimeout } from '../api/config';

/**
 * Fetch all POIs for a given loteo.
 * @param {string} accessToken
 * @param {string} loteoId
 * @returns {Promise<Array>} POI array from the API
 */
export async function fetchPois(accessToken, loteoId) {
  const res = await fetchWithTimeout(
    `${API_BASE}/pois?loteo_id=${encodeURIComponent(loteoId)}&limit=100`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) throw new Error(`fetchPois failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * Create a new POI.
 * @param {string} accessToken
 * @param {object} payload - { loteo_id, title, coordinates_360, blueprint_coordinates, icon_type, description, link_url, color }
 */
export async function createPoi(accessToken, payload) {
  const res = await fetchWithTimeout(`${API_BASE}/pois`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`createPoi failed: ${res.status} ${msg}`);
  }
  return res.json();
}

/**
 * Update POI metadata (title, icon_type, description, link_url, color).
 * @param {string} accessToken
 * @param {string} poiId
 * @param {object} payload - partial POI fields
 */
export async function updatePoi(accessToken, poiId, payload) {
  const res = await fetchWithTimeout(`${API_BASE}/pois/${poiId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`updatePoi failed: ${res.status} ${msg}`);
  }
  return res.json();
}

/**
 * Delete a POI.
 * @param {string} accessToken
 * @param {string} poiId
 */
export async function deletePoi(accessToken, poiId) {
  const res = await fetchWithTimeout(`${API_BASE}/pois/${poiId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`deletePoi failed: ${res.status} ${msg}`);
  }
}

/**
 * Save 360 panorama coordinates for a POI.
 * @param {string} accessToken
 * @param {string} poiId
 * @param {Array<[number, number]>} polygonPoints
 */
export async function updatePoiCoordinates(accessToken, poiId, polygonPoints) {
  const res = await fetchWithTimeout(`${API_BASE}/pois/update-coordinates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ uuid: poiId, polygonPoints }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`updatePoiCoordinates failed: ${res.status} ${msg}`);
  }
  return res.json();
}

/**
 * Save blueprint coordinates for a POI.
 * @param {string} accessToken
 * @param {string} poiId
 * @param {Array<[number, number]>} polygonPoints
 */
export async function updatePoiBlueprintCoordinates(accessToken, poiId, polygonPoints) {
  const res = await fetchWithTimeout(`${API_BASE}/pois/update-blueprint-coordinates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ uuid: poiId, polygonPoints }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`updatePoiBlueprintCoordinates failed: ${res.status} ${msg}`);
  }
  return res.json();
}