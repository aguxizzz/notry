import { useState } from 'react';
import { API_BASE } from '../config';
import { fetchCurrentUser } from '../api/auth';

/**
 * useAuth — encapsulates authentication state and login/logout actions.
 *
 * Usage:
 *   const { token, user, handleLogin, logout } = useAuth();
 */
export function useAuth() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  /**
   * @param {string} email
   * @param {string} password
   * @param {Object} opts - { setLoading, setStatus, setView, fetchLots }
   */
  async function handleLogin(email, password, { setLoading, setStatus, setView, fetchLots }) {
    setLoading(true);
    setStatus(null);

    try {
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        let message;
        if (loginRes.status === 401) {
          message = 'Credenciales inválidas. Verificá tu email y contraseña.';
        } else if (loginRes.status === 400 && loginData.detail?.toLowerCase().includes('inactive')) {
          message = 'Tu cuenta está inactiva. Contactá al administrador para habilitarla.';
        } else {
          message = loginData.detail || 'Error al iniciar sesión. Intentá de nuevo.';
        }
        throw new Error(message);
      }

      const accessToken = loginData.access_token;
      setToken(accessToken);

      const meData = await fetchCurrentUser(accessToken);
      setUser(meData);

      if (meData.role === 'super_admin' || meData.role === 'admin') {
        setView('super_admin');
        setTimeout(() => fetchLots(), 0);
      } else if (meData.role === 'lote_owner') {
        setView('lote_owner');
      } else {
        setStatus({ type: 'error', message: `Rol no reconocido: ${meData.role}` });
      }

      return meData;
    } catch (error) {
      setStatus({ type: 'error', message: error.message });
      console.error(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }

  /**
   * @param {Object} setters - app state setters to reset on logout (auth state is reset internally)
   */
  function logout(setters) {
    const {
      setView, setLots, setLoteos, setSelectedLot,
      setAdminSubView, setInventoryLots, setInventoryLotsHasMore, setInventorySearch,
      setInventoryStatusFilter, setInventoryTab, setInventoryLoteos, setProspectosList,
      setProspectosHasMore, setAllProspectosList, setProspectosCategoryFilter,
      setProspectosWithoutAdvisor, setToasts, setClicksCache, setVisorDataCache,
      setReportsCache, setDashboardSummary,
    } = setters;

    // Auth state is reset via the hook's own setters (closure)
    setToken(null);
    setUser(null);
    setView('login');
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
  }

  return { token, user, handleLogin, logout };
}
