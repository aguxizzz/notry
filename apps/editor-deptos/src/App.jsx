import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import Login from './components/Login.jsx';
import Loader from './components/Loader.jsx';
import BuildingList from './components/BuildingList.jsx';
import BuildingEditor from './components/BuildingEditor.jsx';

export default function App() {
  const [token, setTokenState] = useState(() => api.loadSession().token);
  // undefined = resolviendo /auth/me; null = sin sesión.
  const [user, setUser] = useState(token ? undefined : null);
  const [orgs, setOrgs] = useState([]);
  const [orgId, setOrgIdState] = useState(() => api.loadSession().orgId);
  const [buildingId, setBuildingId] = useState(null);
  const [topbarSlot, setTopbarSlot] = useState(null);

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
  if (user === undefined) return <Loader label="Preparando el editor…" />;

  const isSuperAdmin = user.role === 'super_admin';
  const needsOrg = isSuperAdmin && !orgId;

  return (
    <div className="app">
      <header className="topbar">
        <button className="topbar-brand" onClick={() => setBuildingId(null)} title="Ir a la lista de edificios">
          <span className="brand-mark" aria-hidden="true" />
          notry
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        {/* Con un edificio abierto, la ruta (Edificios › Torre › Piso) ocupa este lugar. */}
        {!buildingId && <span className="topbar-app">Editor de edificios</span>}
        {isSuperAdmin && (
          <select className="topbar-org" value={orgId || ''} onChange={(e) => pickOrg(e.target.value)}>
            <option value="">Elegí una organización…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        {/* Lo llena el editor de edificio con un portal; vacío hace de separador. */}
        <div className="topbar-slot" ref={setTopbarSlot} />
        <span className="topbar-user">
          <span className="avatar" aria-hidden="true">
            {user.email[0]}
          </span>
          <span className="topbar-email">{user.email}</span>
        </span>
        <button className="ghost" onClick={logout}>
          Salir
        </button>
      </header>
      {needsOrg ? (
        <div className="splash">
          <p className="eyebrow">Super admin</p>
          <p className="splash-title">Elegí una organización</p>
          <p>Usá el selector de arriba para ver sus edificios.</p>
        </div>
      ) : buildingId ? (
        <BuildingEditor key={buildingId} buildingId={buildingId} onBack={() => setBuildingId(null)} topbarSlot={topbarSlot} />
      ) : (
        <BuildingList onOpen={setBuildingId} />
      )}
    </div>
  );
}
