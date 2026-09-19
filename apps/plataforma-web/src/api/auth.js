import { API_BASE } from '../config';

/**
 * Fetches the current user profile using the access token.
 * Uses raw fetch (not apiFetch) since we have the token directly here.
 *
 * @param {string} accessToken - Fresh access token from login
 * @param {number} [timeoutMs] - Abort the request after this many ms (Render free
 *   tier can take a while to wake up from a cold start; without a timeout the
 *   caller can be left waiting indefinitely)
 * @returns {Promise<Object>} User object
 */
export async function fetchCurrentUser(accessToken, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error('Error al obtener perfil');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resets all app state on logout. This function should be called
 * by App.jsx during the logout action. It does NOT make any API calls.
 */
export async function updateUser({ apiFetch, full_name }) {
  return apiFetch(`${API_BASE}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name }),
  });
}

export async function changePassword({ apiFetch, current_password, new_password }) {
  return apiFetch(`${API_BASE}/auth/me/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  });
}

export function buildLogoutHandler({
  setView, setToken, setUser, setLots, setLoteos, setSelectedLot,
  setAdminSubView, setInventoryLots, setInventoryLoteos,
  setInventoryLotsHasMore, setInventorySearch, setInventoryStatusFilter,
  setInventoryTab, setAllProspectosList,
  setProspectosCategoryFilter,
  setClicksCache, setVisorDataCache, setReportsCache, setDashboardSummary,
}) {
  return function logout() {
    setView('login');
    setToken(null);
    setUser(null);
    setLots(null);
    setLoteos(null);
    setSelectedLot(null);
    setAdminSubView('lotes');
    setInventoryLots([]);
    setInventoryLotsHasMore(false);
    setInventorySearch('');
    setInventoryStatusFilter('');
    setInventoryTab('lotes');
    setInventoryLoteos([]);
    setAllProspectosList([]);
    setProspectosCategoryFilter('');
    setClicksCache({});
    setVisorDataCache({});
    setReportsCache({});
    setDashboardSummary(null);
  };
}
