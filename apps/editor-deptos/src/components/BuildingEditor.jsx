import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import { centroid, nextUnitCode } from '../geometry.js';
import FloorCanvas from './FloorCanvas.jsx';
import Inspector from './Inspector.jsx';

const FLOOR_KINDS = { units: 'Unidades', pb: 'Planta baja', amenities: 'Amenities', roof: 'Terraza' };

export default function BuildingEditor({ buildingId, onBack }) {
  const [building, setBuilding] = useState(null);
  const [floorId, setFloorId] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [tool, setTool] = useState('select');
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [newFloor, setNewFloor] = useState({ code: '', name: '', kind: 'units' });
  const pending = useRef({}); // floorId -> { patch, timer }

  const load = useCallback(async () => {
    try {
      const data = await api.getBuilding(buildingId);
      setBuilding(data);
      setFloorId((cur) => cur || data.floors[0]?.id || null);
    } catch (err) {
      setError(err.message);
    }
  }, [buildingId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (label, fn) => {
    setStatus(label);
    setError(null);
    try {
      const result = await fn();
      setStatus('Guardado');
      return result;
    } catch (err) {
      setError(err.message);
      setStatus('');
      load(); // re-sincroniza con el servidor tras un fallo optimista
      return null;
    }
  };

  const mapFloor = (id, fn) =>
    setBuilding((b) => ({ ...b, floors: b.floors.map((f) => (f.id === id ? fn(f) : f)) }));

  const floors = building ? [...building.floors].sort((a, b) => a.level - b.level) : [];
  const floor = floors.find((f) => f.id === floorId) || null;
  const unit = floor?.units.find((u) => u.id === unitId) || null;

  const selectFloor = (id) => {
    setFloorId(id);
    setUnitId(null);
    setTool('select');
  };

  // ── Edificio ────────────────────────────────────────────────
  const saveBuilding = (patch) => {
    setBuilding((b) => ({ ...b, ...patch }));
    return run('Guardando…', () => api.updateBuilding(buildingId, patch));
  };

  const removeBuilding = async () => {
    if (!window.confirm(`¿Borrar "${building.name}" con todos sus pisos y unidades?`)) return;
    try {
      await api.deleteBuilding(buildingId);
      onBack();
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Pisos ───────────────────────────────────────────────────
  const addFloor = async (e) => {
    e.preventDefault();
    const code = newFloor.code.trim();
    if (!code) return;
    const level = floors.length ? Math.max(...floors.map((f) => f.level)) + 1 : 0;
    const created = await run('Creando piso…', () =>
      api.createFloor(buildingId, { code, name: newFloor.name.trim() || `Piso ${code}`, kind: newFloor.kind, level })
    );
    if (!created) return;
    setBuilding((b) => ({ ...b, floors: [...b.floors, { ...created, units: [] }] }));
    setNewFloor({ code: '', name: '', kind: 'units' });
    selectFloor(created.id);
  };

  // Cambios continuos (sliders, números) se agrupan antes de pegarle al servidor.
  const saveFloor = (id, patch, { debounce = false } = {}) => {
    mapFloor(id, (f) => ({ ...f, ...patch }));
    if (!debounce) return run('Guardando…', () => api.updateFloor(id, patch));
    const entry = pending.current[id] || { patch: {} };
    clearTimeout(entry.timer);
    entry.patch = { ...entry.patch, ...patch };
    setStatus('Cambios sin guardar…');
    entry.timer = setTimeout(() => {
      const body = entry.patch;
      delete pending.current[id];
      run('Guardando…', () => api.updateFloor(id, body));
    }, 600);
    pending.current[id] = entry;
    return null;
  };

  const removeFloor = async (f) => {
    if (!window.confirm(`¿Borrar el piso "${f.name}" y sus unidades?`)) return;
    await run('Borrando…', () => api.deleteFloor(f.id));
    setBuilding((b) => ({ ...b, floors: b.floors.filter((x) => x.id !== f.id) }));
    if (floorId === f.id) selectFloor(floors.find((x) => x.id !== f.id)?.id || null);
  };

  const uploadFloorImage = async (file, purpose) => {
    const { width, height } = await readImageSize(file);
    const up = await run('Subiendo imagen…', () => api.uploadImage(buildingId, file, purpose));
    if (!up) return;
    if (purpose === 'plans') {
      // Si ya había polígonos dibujados en otra resolución, no se reescalan: aviso.
      saveFloor(floor.id, { plan_image_url: up.url, plan_width: width, plan_height: height });
    } else {
      saveFloor(floor.id, { source_plan_url: up.url });
    }
  };

  // ── Unidades ────────────────────────────────────────────────
  const addUnit = async () => {
    const created = await run('Creando unidad…', () =>
      api.createUnit(floor.id, { code: nextUnitCode(floor), status: 'available' })
    );
    if (!created) return;
    mapFloor(floor.id, (f) => ({ ...f, units: [...f.units, created] }));
    setUnitId(created.id);
  };

  const saveUnit = (id, patch) => {
    mapFloor(floor.id, (f) => ({ ...f, units: f.units.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
    return run('Guardando…', () => api.updateUnit(id, patch));
  };

  const saveUnitPolygon = (id, points) => saveUnit(id, { polygon: points, pin: centroid(points).map((n) => Math.round(n * 10) / 10) });

  const removeUnit = async (u) => {
    if (!window.confirm(`¿Borrar la unidad ${u.code}?`)) return;
    await run('Borrando…', () => api.deleteUnit(u.id));
    mapFloor(floor.id, (f) => ({ ...f, units: f.units.filter((x) => x.id !== u.id) }));
    if (unitId === u.id) setUnitId(null);
  };

  if (error && !building) {
    return (
      <div className="splash">
        <p className="error">{error}</p>
        <button onClick={onBack}>Volver</button>
      </div>
    );
  }
  if (!building) return <div className="splash">Cargando…</div>;

  return (
    <div className="editor">
      <aside className="side left">
        <button onClick={onBack}>← Edificios</button>
        <h3>{building.name}</h3>

        <h4>Pisos</h4>
        <ul className="list compact">
          {floors.map((f) => (
            <li key={f.id}>
              <button className={`row ${f.id === floorId ? 'active' : ''}`} onClick={() => selectFloor(f.id)}>
                <strong>{f.code}</strong>
                <span className="muted">
                  {FLOOR_KINDS[f.kind]} · {f.units.length} un.{f.plan_image_url ? '' : ' · sin imagen'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form className="stack" onSubmit={addFloor}>
          <div className="inline">
            <input placeholder="Código (PB, 1…)" value={newFloor.code} onChange={(e) => setNewFloor({ ...newFloor, code: e.target.value })} />
            <select value={newFloor.kind} onChange={(e) => setNewFloor({ ...newFloor, kind: e.target.value })}>
              {Object.entries(FLOOR_KINDS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <button disabled={!newFloor.code.trim()}>+ Agregar piso</button>
        </form>

        <details>
          <summary>Datos del edificio</summary>
          <BuildingForm building={building} onSave={saveBuilding} onDelete={removeBuilding} />
        </details>
      </aside>

      <section className="stage">
        <div className="toolbar">
          {[
            ['select', 'Seleccionar'],
            ['draw', 'Dibujar polígono'],
            ['align', 'Alinear imagen'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tool === id ? 'active' : ''}
              disabled={!floor || (id === 'draw' && !unit)}
              title={id === 'draw' && !unit ? 'Elegí o creá una unidad primero' : undefined}
              onClick={() => setTool(id)}
            >
              {label}
            </button>
          ))}
          <span className="spacer" />
          {error && <span className="error">{error}</span>}
          <span className="muted">{status}</span>
        </div>
        {floor ? (
          <FloorCanvas
            floor={floor}
            selectedUnitId={unitId}
            tool={tool}
            onSelectUnit={setUnitId}
            onUnitPolygon={saveUnitPolygon}
            onAlignment={(a) => saveFloor(floor.id, { alignment: a }, { debounce: true })}
            onToolChange={setTool}
          />
        ) : (
          <div className="splash">Agregá un piso para empezar.</div>
        )}
      </section>

      {floor && (
        <Inspector
          floor={floor}
          unit={unit}
          onSelectUnit={(id) => {
            setUnitId(id);
            setTool('select');
          }}
          onSaveFloor={(patch, opts) => saveFloor(floor.id, patch, opts)}
          onDeleteFloor={() => removeFloor(floor)}
          onUploadImage={uploadFloorImage}
          onAddUnit={addUnit}
          onSaveUnit={(patch) => saveUnit(unit.id, patch)}
          onDeleteUnit={() => removeUnit(unit)}
          onDrawUnit={() => setTool('draw')}
        />
      )}
    </div>
  );
}

function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

function BuildingForm({ building, onSave, onDelete }) {
  const facade = building.facade || {};
  const num = (key) => (e) => {
    const v = e.target.value === '' ? undefined : Number(e.target.value);
    onSave({ facade: { ...facade, [key]: v } });
  };
  return (
    <div className="stack">
      <label>
        Nombre
        <input defaultValue={building.name} onBlur={(e) => e.target.value.trim() && e.target.value !== building.name && onSave({ name: e.target.value.trim() })} />
      </label>
      <label>
        Dirección
        <input defaultValue={building.address || ''} onBlur={(e) => e.target.value !== (building.address || '') && onSave({ address: e.target.value || null })} />
      </label>
      <label>
        Slug (URL pública)
        <input defaultValue={building.slug || ''} onBlur={(e) => e.target.value !== (building.slug || '') && onSave({ slug: e.target.value || null })} />
      </label>
      <p className="muted">Fachada (viewBox del visor)</p>
      <div className="grid2">
        {[
          ['width', 'Ancho'],
          ['height', 'Alto'],
          ['ground', 'Suelo (y)'],
          ['x', 'Torre x'],
          ['w', 'Torre ancho'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input type="number" defaultValue={facade[key] ?? ''} onBlur={num(key)} />
          </label>
        ))}
      </div>
      <button className="danger" onClick={onDelete}>
        Borrar edificio
      </button>
    </div>
  );
}
