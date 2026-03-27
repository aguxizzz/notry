import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';

const API_BASE = 'https://notry-back.onrender.com/api/v1';

export default function LoteoSelectionScreen({ authToken, onSelect }) {
  const [loteos, setLoteos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/loteos`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(data => setLoteos(data.items || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [authToken]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Notry Editor</h1>
        <p style={styles.subtitle}>Selecciona un loteo para editar</p>
      </div>

      {loading && <p style={styles.status}>Cargando loteos...</p>}
      {error && <p style={{ ...styles.status, color: '#f66' }}>Error al cargar loteos: {error}</p>}
      {!loading && !error && loteos.length === 0 && (
        <p style={styles.status}>No hay loteos disponibles.</p>
      )}

      <div style={styles.grid}>
        {loteos.map(loteo => (
          <button key={loteo.id} style={styles.card} onClick={() => onSelect(loteo)}>
            <div style={styles.imageWrap}>
              {loteo.image_url ? (
                <img src={loteo.image_url} alt={loteo.name} style={styles.image} />
              ) : (
                <div style={styles.imagePlaceholder}>
                  <MapPin size={32} style={{ opacity: 0.4 }} />
                </div>
              )}
            </div>
            <div style={styles.cardBody}>
              <p style={styles.cardName}>{loteo.name || 'Sin nombre'}</p>
              <p style={styles.cardMeta}>{(loteo.lotes || []).length} lote(s)</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: {
    width: '100vw',
    height: '100vh',
    background: '#1a1a20',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflowY: 'auto',
    padding: '3rem 2rem',
    boxSizing: 'border-box',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2.5rem',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '2rem',
    fontWeight: 700,
    color: '#fff',
  },
  subtitle: {
    margin: 0,
    color: '#aaa',
    fontSize: '1rem',
  },
  status: {
    color: '#aaa',
    fontSize: '1rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '1.5rem',
    width: '100%',
    maxWidth: '900px',
  },
  card: {
    background: '#2a2a30',
    border: '1px solid #444',
    borderRadius: '10px',
    cursor: 'pointer',
    overflow: 'hidden',
    textAlign: 'left',
    padding: 0,
    transition: 'border-color 0.15s, transform 0.15s',
  },
  imageWrap: {
    width: '100%',
    height: '160px',
    overflow: 'hidden',
    background: '#1e1e24',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#aaa',
  },
  cardBody: {
    padding: '1rem',
  },
  cardName: {
    margin: '0 0 4px 0',
    fontWeight: 600,
    fontSize: '1rem',
    color: '#fff',
  },
  cardMeta: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#aaa',
  },
};
