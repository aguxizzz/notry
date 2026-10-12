import { useEffect, useState } from 'react';
import * as api from '../api.js';

export default function BuildingList({ onOpen }) {
  const [buildings, setBuildings] = useState(null);
  const [name, setName] = useState('');
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
    try {
      const created = await api.createBuilding({ name: name.trim() });
      onOpen(created.id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <main className="page">
      <h2>Edificios</h2>
      {error && <p className="error">{error}</p>}
      {buildings === null && !error && <p className="muted">Cargando…</p>}
      {buildings?.length === 0 && <p className="muted">Todavía no hay edificios.</p>}
      <ul className="list">
        {buildings?.map((b) => (
          <li key={b.id}>
            <button className="row" onClick={() => onOpen(b.id)}>
              <strong>{b.name}</strong>
              <span className="muted">{b.address || 'Sin dirección'}</span>
            </button>
          </li>
        ))}
      </ul>
      <form className="inline" onSubmit={create}>
        <input placeholder="Nombre del nuevo edificio" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" disabled={!name.trim()}>
          Crear edificio
        </button>
      </form>
    </main>
  );
}
