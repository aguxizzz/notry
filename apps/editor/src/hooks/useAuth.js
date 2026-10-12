import { useState, useEffect } from 'react';
import { API_BASE, setActiveOrgId as setAmbientActiveOrgId } from '../api/config';

const ORG_STORAGE_KEY = 'notry_editor_active_org_id';

export function useAuth() {
  const [token, setToken] = useState(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (urlToken) {
      localStorage.setItem('notry_token', urlToken);
      const params = new URLSearchParams(window.location.search);
      params.delete('token');
      const cleaned = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', cleaned);
      return urlToken;
    }
    return localStorage.getItem('notry_token');
  });

  // undefined = todavía no se resolvió /auth/me; null = sin sesión.
  const [user, setUser] = useState(() => (token ? undefined : null));

  const [activeOrgId, setActiveOrgIdState] = useState(() => {
    // plataforma-web (y el propio editor al abrir un loteo desde la lista)
    // pasan ?orgId= junto con ?data= cuando ya se sabe con qué org operar.
    // A diferencia de ?token=, no se saca de la URL: así un refresh de la
    // misma pestaña conserva el par (data, orgId) consistente.
    const params = new URLSearchParams(window.location.search);
    const urlOrgId = params.get('orgId');
    if (urlOrgId) return urlOrgId;
    // Sin ?orgId= pero CON ?data=: es un link directo a un loteo puntual sin
    // org conocida (link viejo, o la misma pestaña reusada tras cambiar de
    // cuenta). No hay que asumir la org de una sesión de lista anterior acá
    // — mezclar el loteo del link con una org ajena abría el loteo
    // equivocado sin avisar (bug reportado 2026-09-04). Dejarla sin resolver
    // fuerza a caer en la lista (con selector) en vez de arriesgar.
    if (params.has('data')) return null;
    // Sin ?data=: entrada "normal" al editor (login directo) — la lista de
    // loteos puede arrancar con la última org que se eligió ahí mismo.
    return localStorage.getItem(ORG_STORAGE_KEY);
  });

  useEffect(() => {
    setAmbientActiveOrgId(activeOrgId);
    if (activeOrgId) localStorage.setItem(ORG_STORAGE_KEY, activeOrgId);
    else localStorage.removeItem(ORG_STORAGE_KEY);
  }, [activeOrgId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => { if (!cancelled) setUser(data); })
      .catch(() => { if (!cancelled) setUser(null); });
    return () => { cancelled = true; };
  }, [token]);

  const handleLogin = (newToken) => {
    localStorage.setItem('notry_token', newToken);
    // user quedaba en null (su valor previo a loguearse) hasta que /auth/me
    // resolvía — en esa ventana `user === undefined` (la señal de "cargando"
    // que usa App.jsx) era falsa, así que LoteoList llegaba a renderizar y
    // pedir /loteos con isSuperAdmin todavía en false, sin X-Active-Org-Id,
    // y el backend respondía 400 para una cuenta que sí era super_admin.
    setUser(undefined);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('notry_token');
    localStorage.removeItem(ORG_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setActiveOrgIdState(null);
    // Sin esto, el ?data=/&orgId= de un loteo/etapa quedaba en la barra de
    // direcciones tras cerrar sesión: loguearse con otra cuenta en la misma
    // pestaña reintentaba abrir ese loteo ajeno en vez de caer al listado
    // (bug reportado 2026-09-05).
    const params = new URLSearchParams(window.location.search);
    params.delete('data');
    params.delete('orgId');
    params.delete('from');
    const cleaned = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
    window.history.replaceState({}, '', cleaned);
  };

  return { token, user, handleLogin, handleLogout, activeOrgId, setActiveOrgId: setActiveOrgIdState };
}
