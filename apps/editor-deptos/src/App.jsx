import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import Login from './components/Login.jsx';
import BuildingList from './components/BuildingList.jsx';
import BuildingEditor from './components/BuildingEditor.jsx';

export default function App() {
  const [token, setTokenState] = useState(() => api.loadSession().token);
  // undefined = resolviendo /auth/me; null = sin sesión.
  const [user, setUser] = useState(token ? undefined : null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgIdState] = useState(() => api.loadSession().orgId);
  const [buildingId, setBuildingId] = useState(null);

  const logout = useCallback(() => {
    api.setToken(null);
    api.setOrgId(null);
    setTokenState(null);
    setUser(null);
    setOrgIdState(null);
    setBuildingId(null);
  }, []);

  useEffect(() => {
    api.onUnauthorized(logout);
  }, [logout]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .me()
      .then(async (data) => {
        if (cancelled) return;
        if (data.role === 'super_admin') setOrgs(await api.listOrganizations());
        if (!cancelled) setUser(data);
      })
      .catch(() => {
        if (!cancelled) logout();
      });
    return () => {
      cancelled = true;
    };
  }, [token, logout]);

  const handleLogin = (newToken) => {
    api.setToken(newToken);
    setUser(undefined);
    setTokenState(newToken);
  };

  const pickOrg = (id) => {
    api.setOrgId(id);
    setOrgIdState(id || null);
    setBuildingId(null);
  };

  if (!token || user === null) return <Login onLogin={handleLogin} />;
  if (user === undefined) return <div className="splash">Cargando…</div>;

  const isSuperAdmin = user.role === 'super_admin';
  const needsOrg = isSuperAdmin && !orgId;

  return (
    <div className="app">
      <header className="topbar">
        <strong>Editor de edificios</strong>
        {isSuperAdmin && (
          <select value={orgId || ''} onChange={(e) => pickOrg(e.target.value)}>
            <option value="">Elegí una organización…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <span className="muted">{user.email}</span>
        <button onClick={logout}>Salir</button>
      </header>
      {needsOrg ? (
        <div className="splash">Elegí una organización para ver sus edificios.</div>
      ) : buildingId ? (
        <BuildingEditor key={buildingId} buildingId={buildingId} onBack={() => setBuildingId(null)} />
      ) : (
        <BuildingList onOpen={setBuildingId} />
      )}
    </div>
  );
}
