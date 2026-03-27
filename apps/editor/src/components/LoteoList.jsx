import { useState, useEffect } from 'react';
import { LayoutGrid, Loader2, Map as MapIcon, ChevronRight } from 'lucide-react';

const API_BASE = 'https://notry-back.onrender.com/api/v1';

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
        <Loader2 className="animate-spin" size={48} color="#1a73e8" />
        <p style={{ color: '#aaa' }}>Cargando proyectos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loteo-center">
        <p style={{ color: '#f66' }}>{error}</p>
        <button onClick={() => window.location.reload()} className="btn-primary" style={{ width: 'auto' }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="loteo-container">
      <header className="loteo-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <LayoutGrid size={28} color="#1a73e8" />
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
        <form onSubmit={handleCreate} style={{ background: '#2a2a30', padding: '2rem', borderRadius: '12px', border: '1px solid #1a73e8', marginBottom: '2rem', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>Crear Nuevo Loteo</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Nombre *</label>
              <input 
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Ej: Terrazas del Sol"
                style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '10px', borderRadius: '6px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '0.85rem', color: '#aaa' }}>Slug (Opcional)</label>
              <input 
                value={newSlug}
                onChange={e => setNewSlug(e.target.value)}
                placeholder="Ej: terrazas-del-sol"
                style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '10px', borderRadius: '6px' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.85rem', color: '#aaa' }}>URL de Imagen de Fondo *</label>
            <input 
              required
              value={newImageUrl}
              onChange={e => setNewImageUrl(e.target.value)}
              placeholder="https://ejemplo.com/panorama.jpg"
              style={{ background: '#1e1e24', border: '1px solid #444', color: '#eee', padding: '10px', borderRadius: '6px' }}
            />
          </div>

          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isSubmitting}
            style={{ marginTop: '10px', background: isSubmitting ? '#444' : '#1a73e8' }}
          >
            {isSubmitting ? 'Creando...' : 'Guardar Loteo'}
          </button>
        </form>
      )}

      <div className="loteo-grid">
        {loteos.map(loteo => (
          <div 
            key={loteo.id} 
            className="loteo-card"
            onClick={() => onSelect(loteo)}
          >
            <div className="loteo-card-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <MapIcon size={20} color="#1a73e8" />
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
        ))}
      </div>

      {loteos.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem 0' }}>
          <p style={{ color: '#aaa' }}>No se encontraron loteos disponibles.</p>
        </div>
      )}
    </div>
  );
}
