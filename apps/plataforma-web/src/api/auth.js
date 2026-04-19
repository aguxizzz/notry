import { API_BASE } from '../config';

/**
 * Fetches the current user profile using the access token.
 * Uses raw fetch (not apiFetch) since we have the token directly here.
 *
 * @param {string} accessToken - Fresh access token from login
 * @returns {Promise<Object>} User object
 */
export async function fetchCurrentUser(accessToken) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Error al obtener perfil');
  return data;
}

/**
 * Resets all app state on logout. This function should be called
 * by App.jsx during the logout action. It does NOT make any API calls.
 *
 * @param {Function} setView
 * @param {Function} setToken
 * @param {Function} setUser
 * @param {Function} setLots
 * @param {Function} setLoteos
 * @param {Function} setSelectedLot
 * @param {Function} setStatus
 * @param {Function} setAdminSubView
 * @param {Function} setInventoryLots
 * @param {Function} setInventoryLoteos
 * @param {Function} setProspectosList
 * @param {Function} setAllProspectosList
 * @param {Function} setProspectosHasMore
 * @param {Function} setToasts
 * @param {Function} setClicksCache
 * @param {Function} setVisorDataCache
 * @param {Function} setReportsCache
 * @param {Function} setDashboardSummary
 */
export function buildLogoutHandler({
  setView, setToken, setUser, setLots, setLoteos, setSelectedLot,
  setStatus, setAdminSubView, setInventoryLots, setInventoryLoteos,
  setProspectosList, setAllProspectosList, setProspectosHasMore,
  setToasts, setClicksCache, setVisorDataCache, setReportsCache, setDashboardSummary,
}) {
  return function logout() {
    setView('login');
    setToken(null);
    setUser(null);
    setLots(null);
    setLoteos(null);
    setSelectedLot(null);
    setStatus(null);
    setAdminSubView('lotes');
    setInventoryLots([]);
    setInventoryLotsHasMore(false);
    setInventorySearch('');
    setInventoryStatusFilter('');
    setInventoryTab('lotes');
    setInventoryLoteos([]);
    setProspectosList([]);
    setProspectosHasMore(false);
    setAllProspectosList([]);
    setProspectosCategoryFilter('');
    setProspectosWithoutAdvisor(false);
    setToasts([]);
    setClicksCache({});
    setVisorDataCache({});
    setReportsCache({});
    setDashboardSummary(null);
  };
}
