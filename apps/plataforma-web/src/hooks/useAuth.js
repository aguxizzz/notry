import { useState, useEffect } from 'react';
import { API_BASE } from '../config';
import { fetchCurrentUser } from '../api/auth';

/**
 * useAuth — encapsulates authentication state and login/logout actions.
 *
 * Usage:
 *   const { token, user, isInitializing, handleLogin, logout } = useAuth();
 */
export function useAuth() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    if (!savedToken) {
      setIsInitializing(false);
      return;
    }
    setToken(savedToken);
    fetchCurrentUser(savedToken)
      .then(meData => setUser(meData))
      .catch(() => localStorage.removeItem('auth_token'))
      .finally(() => setIsInitializing(false));
  }, []);

  /**
   * @param {string} email
   * @param {string} password
   * @param {Object} opts - { setLoading, setStatus, setView }
   */
  async function handleLogin(email, password, { setLoading, setStatus, setView }) {
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
        } else if (loginRes.status === 400 && loginData.detail?.toLowerCase().includes('inactivo')) {
          message = 'Tu cuenta está inactiva. Contactá al administrador para habilitarla.';
        } else {
          message = loginData.detail || 'Error al iniciar sesión. Intentá de nuevo.';
        }
        throw new Error(message);
      }

      const accessToken = loginData.access_token;
      localStorage.setItem('auth_token', accessToken);
      setToken(accessToken);

      const meData = await fetchCurrentUser(accessToken);
      setUser(meData);

      // super_admin opera la misma UI que lote_owner, eligiendo la org activa
      // con el selector del Sidebar (no tiene membership propia).
      if (['super_admin', 'admin', 'lote_owner'].includes(meData.role)) {
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
      setView,
      setInventoryLots, setInventoryLotsHasMore, setInventorySearch,
      setInventoryStatusFilter, setInventoryTab, setInventoryLoteos,
      setAllProspectosList, setProspectosCategoryFilter,
      setProspectosWithoutAdvisor, setToasts, setClicksCache, setVisorDataCache,
      setReportsCache, setDashboardSummary,
      setOrg, setProjects, setActiveOrgId,
    } = setters;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('owner_sub_view');
    localStorage.removeItem('notry_active_org_id');
    // Auth state is reset via the hook's own setters (closure)
    setToken(null);
    setUser(null);
    setView('login');
    setActiveOrgId?.(null);
    setInventoryLots([]);
    setInventoryLotsHasMore(false);
    setInventorySearch('');
    setInventoryStatusFilter?.('');
    setInventoryTab('lotes');
    setInventoryLoteos([]);
    setAllProspectosList([]);
    setProspectosCategoryFilter('');
    setProspectosWithoutAdvisor?.(false);
    setToasts?.([]);
    setClicksCache?.({});
    setVisorDataCache({});
    setReportsCache({});
    setDashboardSummary(null);
    setOrg?.(null);
    setProjects?.([]);
  }

  return { token, user, setUser, isInitializing, handleLogin, logout };
}
