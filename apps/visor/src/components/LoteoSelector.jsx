import { useState, useEffect } from 'react';
import { API_BASE } from '../api/config';

function buildGroups(loteos) {
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

function LoteoCard({ loteo, onSelect }) {
  return (
    <div
      onClick={() => onSelect(loteo.id)}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(loteo.id); }}
      style={s.card}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#c5a059'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#383840'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={s.cardName}>{loteo.name || 'Sin nombre'}</span>
      </div>
      <span style={s.cardSub}>{loteo.lotes?.length || 0} lotes mapeados</span>
      <span style={s.cardAction}>Previsualizar →</span>
    </div>
  );
}

export default function LoteoSelector({ token, onSelect, onLogout }) {
  const [loteos, setLoteos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/loteos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (res.status === 401) { onLogout?.(); return null; }
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => { if (data) setLoteos(data.items || []); })
      .catch(() => setError('No se pudieron cargar los proyectos.'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={s.overlay}>
      <div style={s.container}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Proyectos</h1>
            <p style={s.subtitle}>Elegí un proyecto para previsualizar en el visor</p>
          </div>
          <button onClick={onLogout} style={s.logoutBtn}>Cerrar sesión</button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Cargando...</div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#ef4444' }}>{error}</div>
        )}

        {!loading && !error && (
          <div style={s.grid}>
            {buildGroups(loteos).map(item =>
              item.kind === 'standalone'
                ? <LoteoCard key={item.loteo.id} loteo={item.loteo} onSelect={onSelect} />
                : (
                  <div key={item.projectId} style={s.group}>
                    <div style={s.groupLabel}>
                      {item.etapas[0]?.name ?? 'Proyecto'}
                    </div>
                    <div style={s.groupGrid}>
                      {item.etapas.map(e => <LoteoCard key={e.id} loteo={e} onSelect={onSelect} />)}
                    </div>
                  </div>
                )
            )}
            {loteos.length === 0 && (
              <p style={{ color: '#888', gridColumn: '1/-1' }}>No hay proyectos disponibles.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  overlay: {
    width: '100vw',
    height: '100vh',
    background: '#1e1e24',
    overflowY: 'auto',
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '3rem 2rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2rem',
  },
  title: {
    margin: '0 0 4px 0',
    fontSize: '2rem',
    fontWeight: 700,
    color: '#fff',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.9rem',
    color: '#888',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #383840',
    color: '#888',
    borderRadius: '6px',
    padding: '8px 14px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '14px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    background: '#2a2a30',
    border: '1px solid #383840',
    borderRadius: '10px',
    padding: '1.2rem',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  cardName: {
    color: '#fff',
    fontWeight: 600,
    fontSize: '1rem',
  },
  cardSub: {
    color: '#888',
    fontSize: '0.8rem',
  },
  cardAction: {
    marginTop: '8px',
    color: '#c5a059',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  group: {
    gridColumn: '1 / -1',
    border: '1px solid rgba(197,160,89,0.3)',
    borderRadius: '10px',
    padding: '1rem',
    background: 'rgba(197,160,89,0.04)',
  },
  groupLabel: {
    color: '#c5a059',
    fontWeight: 600,
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '10px',
  },
  groupGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '10px',
  },
};
