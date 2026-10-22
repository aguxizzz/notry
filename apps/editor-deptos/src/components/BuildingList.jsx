import { useEffect, useState } from 'react';
import * as api from '../api.js';

// Fachada esquemática: solo decora la card, no refleja los pisos reales.
const BuildingGlyph = () => (
  <svg className="building-glyph" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M10 42V12l14-6 14 6v30" />
    <path d="M6 42h36" />
    <path d="M17 17h4M27 17h4M17 24h4M27 24h4M17 31h4M27 31h4" />
    <path d="M21 42v-5h6v5" />
  </svg>
);

export default function BuildingList({ onOpen }) {
  const [buildings, setBuildings] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listBuildings()
      .then((data) => !cancelled && setBuildings(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await api.createBuilding({ name: name.trim() });
      onOpen(created.id);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  const count = buildings?.length ?? 0;

  return (
    <main className="buildings-page">
      <header className="buildings-header">
        <div>
          <h1>Edificios</h1>
          <p className="muted">
            {buildings === null
              ? 'Cargando edificios…'
              : count === 0
                ? 'Todavía no cargaste ningún edificio.'
                : `${count} ${count === 1 ? 'edificio' : 'edificios'} en esta organización`}
          </p>
        </div>
      </header>

      {error && (
        <p className="banner-error" role="alert">
          {error}
        </p>
      )}

      <ul className="buildings-grid">
        <li>
          <form className="building-card building-card--new" onSubmit={create}>
            <span className="building-card-icon building-card-icon--new" aria-hidden="true">
              +
            </span>
            <label className="building-new-label" htmlFor="new-building">
              Nuevo edificio
            </label>
            <input
              id="new-building"
              placeholder="Nombre, ej. Torre Belgrano"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={buildings?.length === 0}
            />
            <button className="primary" disabled={!name.trim() || creating}>
              {creating ? 'Creando…' : 'Crear y abrir'}
            </button>
          </form>
        </li>

        {buildings === null &&
          !error &&
          [0, 1, 2].map((i) => (
            <li key={i}>
              <div className="building-card building-card--skeleton" aria-hidden="true" />
            </li>
          ))}

        {buildings?.map((b) => (
          <li key={b.id}>
            <button className="building-card" onClick={() => onOpen(b.id)}>
              <span className="building-card-icon">
                <BuildingGlyph />
              </span>
              <span className="building-card-body">
                <strong>{b.name}</strong>
                <span className={b.address ? 'building-card-address' : 'building-card-address is-empty'}>
                  {b.address || 'Sin dirección'}
                </span>
              </span>
              <span className="building-card-foot">
                {b.slug ? <code>/{b.slug}</code> : <span className="muted">Sin slug</span>}
                <span className="building-card-open">Abrir →</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
