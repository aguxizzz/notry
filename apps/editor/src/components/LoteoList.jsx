import { useState, useEffect } from 'react';
import { LayoutGrid, Loader2, Map as MapIcon, ChevronRight, Layers } from 'lucide-react';
import { API_BASE } from '../api/config';

// Agrupa loteos: general + etapas (por orden) juntos; standalones sueltos.
function buildLoteoGroups(loteos) {
  const map = new Map();
  const order = [];
  for (const loteo of loteos) {
    if (!loteo.grupo_id) {
      order.push({ kind: 'standalone', loteo });
    } else {
      if (!map.has(loteo.grupo_id)) {
        const entry = { kind: 'group', grupoId: loteo.grupo_id, general: null, etapas: [] };
        map.set(loteo.grupo_id, entry);
        order.push(entry);
      }
      const g = map.get(loteo.grupo_id);
      if (loteo.tipo === 'general') g.general = loteo;
      else g.etapas.push(loteo);
    }
  }
  for (const g of map.values()) g.etapas.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  return order;
}

const roleBadgeStyle = (role) => ({
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '2px 7px',
  borderRadius: '999px',
  background: role === 'general' ? 'rgba(197,160,89,0.18)' : 'rgba(255,255,255,0.08)',
  color: role === 'general' ? 'var(--accent)' : 'var(--text-muted)',
});

function renderLoteoCard(loteo, onSelect, role) {
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
          {role && <span style={roleBadgeStyle(role)}>{role === 'general' ? 'General' : 'Etapa'}</span>}
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

export default function LoteoList({ token, onSelect, onAuthError }) {
  const [loteos, setLoteos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Creation form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLoteos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/loteos`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.status === 401) { onAuthError?.(); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setLoteos(data.items || []);
    } catch (err) {
      console.error('Error fetching loteos:', err);
      setError('No se pudieron cargar los loteos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoteos();
  }, [token]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName) return;
    
    setIsSubmitting(true);
    try {
      const payload = {
        name: newName,
        slug: newSlug || undefined,
        image_url: newImageUrl || undefined,
        text_annotations: []
      };

      const res = await fetch(`${API_BASE}/loteos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Error ${res.status}`);
      }

      // Success
      setNewName('');
      setNewSlug('');
      setNewImageUrl('');
      setIsCreating(false);
      await fetchLoteos();
    } catch (err) {
      alert(`Error al crear loteo: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loteo-center">
        <Loader2 className="animate-spin" size={48} color="var(--accent)" />
        <p style={{ color: 'var(--text-muted)' }}>Cargando proyectos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loteo-center">
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary" style={{ width: 'auto' }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="loteo-container">
      <header className="loteo-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LayoutGrid size={28} color="var(--accent)" />
            <h1 className="loteo-title">Mis Proyectos</h1>
          </div>
          <p className="loteo-subtitle">Selecciona un loteo para empezar a editar sus anotaciones</p>
        </div>
        <button 
          className="btn-primary" 
          style={{ width: 'auto', padding: '10px 20px' }}
          onClick={() => setIsCreating(!isCreating)}
        >
          {isCreating ? 'Cancelar' : 'Nuevo Loteo'}
        </button>
      </header>

      {isCreating && (
        <form onSubmit={handleCreate} style={{ background: 'var(--panel-bg)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--accent)', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: 'var(--text-3xl)' }}>Crear Nuevo Loteo</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Nombre *</label>
              <input
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej: Terrazas del Sol"
                style={{ background: 'var(--panel-deep)', border: '1px solid var(--border)', color: '#eee', padding: '10px', borderRadius: '6px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>Slug (Opcional)</label>
              <input
                value={newSlug}
                onChange={e => setNewSlug(e.target.value)}
                placeholder="Ej: terrazas-del-sol"
                style={{ background: 'var(--panel-deep)', border: '1px solid var(--border)', color: '#eee', padding: '10px', borderRadius: '6px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)' }}>URL de Imagen de Fondo *</label>
            <input
              required
              value={newImageUrl}
              onChange={e => setNewImageUrl(e.target.value)}
              placeholder="https://ejemplo.com/panorama.jpg"
              style={{ background: 'var(--panel-deep)', border: '1px solid var(--border)', color: '#eee', padding: '10px', borderRadius: '6px' }}
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isSubmitting}
            style={{ marginTop: '10px', background: isSubmitting ? 'var(--border)' : 'var(--accent)' }}
          >
            {isSubmitting ? 'Creando...' : 'Guardar Loteo'}
          </button>
        </form>
      )}

      <div className="loteo-grid">
        {buildLoteoGroups(loteos).map(item => (
          item.kind === 'standalone'
            ? renderLoteoCard(item.loteo, onSelect)
            : (
              <div
                key={item.grupoId}
                className="loteo-group-block"
                style={{ gridColumn: '1 / -1', border: '1px solid var(--accent)', borderRadius: '12px', padding: '16px', background: 'rgba(197,160,89,0.04)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Layers size={16} color="var(--accent)" />
                  <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 'var(--text-md)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {item.general ? item.general.name : 'Grupo de etapas'}
                  </span>
                </div>
                <div className="loteo-grid">
                  {item.general && renderLoteoCard(item.general, onSelect, 'general')}
                  {item.etapas.map(e => renderLoteoCard(e, onSelect, 'etapa'))}
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
