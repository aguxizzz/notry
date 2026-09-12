import { useCallback, useEffect, useState } from 'react';
import { LayoutGrid, Loader2, Map as MapIcon, ChevronRight, Layers, Building2 } from 'lucide-react';
import { API_BASE } from '../api/config';

// Agrupa loteos por proyecto (etapas del stage switcher, por orden); standalones sueltos.
function buildLoteoGroups(loteos) {
  const map = new Map();
  const order = [];
  for (const loteo of loteos) {
    if (!loteo.project_id) {
      order.push({ kind: 'standalone', loteo });
    } else {
      if (!map.has(loteo.project_id)) {
        const entry = { kind: 'group', projectId: loteo.project_id, etapas: [] };
        map.set(loteo.project_id, entry);
        order.push(entry);
      }
      map.get(loteo.project_id).etapas.push(loteo);
    }
  }
  for (const g of map.values()) g.etapas.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return order;
}

function renderLoteoCard(loteo, onSelect) {
  return (
    <div
      key={loteo.id}
      className="loteo-card"
      onClick={() => onSelect(loteo)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(loteo); }}
    >
      <div className="loteo-card-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <MapIcon size={20} color="var(--accent)" />
          <h3 className="loteo-card-title" style={{ margin: 0 }}>{loteo.name || 'Sin nombre'}</h3>
        </div>
        <p className="loteo-card-info">{loteo.lotes?.length || 0} lotes mapeados</p>
        <div className="loteo-card-footer">
          <span className="loteo-edit-btn">
            Abrir Editor <ChevronRight size={16} />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function LoteoList({ token, onSelect, onAuthError, user, activeOrgId, onOrgChange }) {
  const isSuperAdmin = user?.role === 'super_admin';
  const [loteos, setLoteos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [orgs, setOrgs] = useState(null);
  const [orgsError, setOrgsError] = useState(null);

  // super_admin no tiene org propia (ver resolve_active_organization_id en el
  // backend) — necesita elegir con cuál trabajar antes de listar sus loteos.
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    fetch(`${API_BASE}/organizations`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(data => { if (!cancelled) setOrgs(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setOrgsError('No se pudieron cargar las organizaciones.'); });
    return () => { cancelled = true; };
  }, [isSuperAdmin, token]);

  const fetchLoteos = useCallback(async () => {
    // Construye el header a partir del prop directamente (no del helper
    // ambiental de config.js): al cambiar de org en el switcher de acá abajo,
    // este efecto puede disparar en el mismo commit en que cambia activeOrgId,
    // antes de que useAuth alcance a sincronizar el valor ambiental — usar el
    // prop evita mandar el header de la org anterior por una carrera de efectos.
    const headers = { Authorization: `Bearer ${token}` };
    if (activeOrgId) headers['X-Active-Org-Id'] = activeOrgId;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/loteos`, { headers });
      if (res.status === 401) { onAuthError?.(); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setLoteos(data.items || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching loteos:', err);
      setError('No se pudieron cargar los loteos.');
    } finally {
      setLoading(false);
    }
  }, [onAuthError, token, activeOrgId]);

  useEffect(() => {
    // super_admin sin org elegida todavía: no hay nada que listar (y pegarle
    // a /loteos sin X-Active-Org-Id devolvería 400).
    if (isSuperAdmin && !activeOrgId) { setLoteos([]); setLoading(false); return; }
    fetchLoteos();
  }, [fetchLoteos, isSuperAdmin, activeOrgId]);

  const orgSwitcher = isSuperAdmin ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
      <Building2 size={16} color="var(--accent)" />
      {orgsError ? (
        <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>{orgsError}</span>
      ) : (
        <select
          aria-label="Organización activa"
          value={activeOrgId || ''}
          onChange={(e) => onOrgChange?.(e.target.value || null)}
          disabled={!orgs}
          style={{
            background: 'var(--panel-bg)',
            color: '#fff',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: 'var(--text-base)',
            minWidth: '240px',
          }}
        >
          <option value="" disabled>{orgs ? 'Elegí una organización...' : 'Cargando organizaciones...'}</option>
          {orgs?.map(org => (
            <option key={org.org_id} value={org.org_id}>{org.org_name}</option>
          ))}
        </select>
      )}
    </div>
  ) : null;

  if (isSuperAdmin && !activeOrgId) {
    return (
      <div className="loteo-container">
        <header className="loteo-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <LayoutGrid size={28} color="var(--accent)" />
              <h1 className="loteo-title">Mis Proyectos</h1>
            </div>
            <p className="loteo-subtitle">Elegí con qué organización cliente vas a trabajar</p>
            {orgSwitcher}
          </div>
        </header>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loteo-container">
        <header className="loteo-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <LayoutGrid size={28} color="var(--accent)" />
              <h1 className="loteo-title">Mis Proyectos</h1>
            </div>
            {orgSwitcher}
          </div>
        </header>
        <div className="loteo-center">
          <Loader2 className="animate-spin" size={48} color="var(--accent)" />
          <p style={{ color: 'var(--text-muted)' }}>Cargando proyectos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loteo-container">
        <header className="loteo-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <LayoutGrid size={28} color="var(--accent)" />
              <h1 className="loteo-title">Mis Proyectos</h1>
            </div>
            {orgSwitcher}
          </div>
        </header>
        <div className="loteo-center">
          <p style={{ color: 'var(--color-danger)' }}>{error}</p>
          <button onClick={fetchLoteos} className="btn-primary" style={{ width: 'auto' }}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="loteo-container">
      <header className="loteo-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LayoutGrid size={28} color="var(--accent)" />
            <h1 className="loteo-title">Mis Proyectos</h1>
          </div>
          <p className="loteo-subtitle">Selecciona un loteo para empezar a editar sus anotaciones</p>
          {orgSwitcher}
        </div>
      </header>

      <div className="loteo-grid">
        {buildLoteoGroups(loteos).map(item => (
          item.kind === 'standalone'
            ? renderLoteoCard(item.loteo, onSelect)
            : (
              <div
                key={item.projectId}
                className="loteo-group-block"
                style={{ gridColumn: '1 / -1', border: '1px solid var(--accent)', borderRadius: '12px', padding: '16px', background: 'rgba(197,160,89,0.04)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Layers size={16} color="var(--accent)" />
                  <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 'var(--text-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {item.etapas[0]?.name ?? 'Proyecto'}
                  </span>
                </div>
                <div className="loteo-grid">
                  {item.etapas.map(e => renderLoteoCard(e, onSelect))}
                </div>
              </div>
            )
        ))}
      </div>

      {loteos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ color: 'var(--text-muted)' }}>No se encontraron loteos disponibles.</p>
        </div>
      )}
    </div>
  );
}
