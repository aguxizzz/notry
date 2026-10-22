import { useEffect, useRef, useState } from 'react';
import { isTemp } from '../buildingStore.js';
import { centroid, round } from '../geometry.js';
import { FLOOR_KINDS, nextFloor, nextUnitCode, UNIT_DATA_FIELDS } from '../model.js';
import { useBuildingStore } from '../useBuildingStore.js';
import { useLatest } from '../useLatest.js';
import { isTypingOrModal } from '../keyboard.js';
import { useConfirm } from './useConfirm.jsx';
import { NumberField, TextField } from './fields.jsx';
import FloorCanvas from './FloorCanvas.jsx';
import Loader from './Loader.jsx';
import Inspector from './Inspector.jsx';

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

// Pantalla de edición: selección, herramientas y portapapeles. El estado del edificio y su
// guardado optimista viven en `buildingStore.js`.
export default function BuildingEditor({ buildingId, onBack }) {
  const [{ building, status, error }, store] = useBuildingStore(buildingId);
  const [floorId, setFloorId] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [tool, setTool] = useState('select');
  const [confirm, confirmDialog] = useConfirm();
  const { canon } = store;

  const floors = building ? [...building.floors].sort((a, b) => a.level - b.level) : [];
  // Sin selección, o si el piso elegido ya no existe (borrado, recarga), el de más abajo.
  const floor = floors.find((f) => f.id === canon(floorId)) || floors[0] || null;
  const unit = floor?.units.find((u) => u.id === canon(unitId)) || null;

  // Las acciones leen el estado más reciente del store, no el del último render: dos clics
  // rápidos (agregar piso, pegar unidad) tienen que ver lo que agregó el primero.
  const latestFloors = () => store.getState().building?.floors || [];
  const latestFloor = () => latestFloors().find((f) => f.id === canon(floor?.id)) || null;

  const selectFloor = (id) => {
    setFloorId(id);
    setUnitId(null);
    setTool('select');
  };

  // ── Edificio ────────────────────────────────────────────────
  const removeBuilding = async () => {
    const ok = await confirm({
      title: `¿Borrar el edificio "${building.name}"?`,
      message: 'Se borran también todos sus pisos y unidades. No se puede deshacer.',
      confirmLabel: 'Borrar edificio',
    });
    if (ok && (await store.removeBuilding())) onBack();
  };

  // ── Pisos ───────────────────────────────────────────────────
  const addFloor = () => selectFloor(store.insertFloor(nextFloor(latestFloors())));

  // Copia imagen, plano, alineación y unidades (con sus polígonos) a un piso nuevo arriba
  // de todo. Los códigos de unidad que empiezan con el código del piso se renumeran (1A → 2A).
  const duplicateFloor = (src) => {
    const { code, name, level } = nextFloor(latestFloors());
    const newFloor = store.insertFloor({
      code,
      name,
      level,
      ...pick(src, ['kind', 'summary', 'facade_height', 'plan_image_url', 'plan_width', 'plan_height', 'source_plan_url', 'alignment', 'zones']),
    });
    for (const u of src.units) {
      store.insertUnit(newFloor, {
        code: u.code.startsWith(src.code) ? code + u.code.slice(src.code.length) : u.code,
        status: 'available',
        ...pick(u, UNIT_DATA_FIELDS),
      });
    }
    selectFloor(newFloor);
  };

  const removeFloor = async (f) => {
    const ok = await confirm({
      title: `¿Borrar el piso ${f.code}?`,
      message: f.units.length ? `Se borran también sus ${f.units.length} unidades.` : null,
      confirmLabel: 'Borrar piso',
    });
    if (!ok) return;
    store.removeFloor(f.id);
    if (floor?.id === f.id) selectFloor(null);
  };

  // La imagen se ve al instante desde el archivo local; la URL definitiva llega con la subida.
  const uploadFloorImage = async (file, purpose) => {
    const target = floor.id;
    let width, height;
    try {
      ({ width, height } = await readImageSize(file));
    } catch (err) {
      store.setError(err.message);
      return;
    }
    const local = URL.createObjectURL(file);
    const field = purpose === 'plans' ? 'plan_image_url' : 'source_plan_url';
    const sizePatch = purpose === 'plans' ? { plan_width: width, plan_height: height } : {};
    store.previewFloor(target, { [field]: local, ...sizePatch });
    const up = await store.uploadImage(file, purpose);
    if (!up) {
      URL.revokeObjectURL(local); // el fallo recarga el edificio desde el servidor
      return;
    }
    // El blob local retiene el archivo entero en memoria: se suelta cuando la imagen
    // definitiva ya está en caché, así el plano no parpadea al cambiar de URL.
    const remote = new Image();
    remote.onload = remote.onerror = () => URL.revokeObjectURL(local);
    remote.src = up.url;
    store.saveFloor(target, { [field]: up.url, ...sizePatch });
  };

  // ── Unidades ────────────────────────────────────────────────
  const addUnit = () => {
    const f = latestFloor();
    if (!f) return;
    setUnitId(store.insertUnit(f.id, { code: nextUnitCode(f), status: 'available' }));
  };

  // Copiar/pegar unidad (Ctrl+C / Ctrl+V), también entre pisos. Se pega con el código libre
  // siguiente y estado disponible; en el mismo piso, corrida para que no tape a la original.
  const clipboard = useRef(null);

  const pasteUnit = () => {
    const src = clipboard.current;
    const f = latestFloor();
    if (!src || !f) return;
    const shift = canon(src.floor_id) === f.id && src.polygon ? Math.round((f.plan_width || 1000) * 0.02) : 0;
    const move = (pts) => pts && pts.map(([x, y]) => [x + shift, y + shift]);
    setUnitId(
      store.insertUnit(f.id, {
        ...pick(src, UNIT_DATA_FIELDS),
        code: nextUnitCode(f),
        status: 'available',
        polygon: move(src.polygon),
        pin: src.pin && move([src.pin])[0],
      })
    );
    setTool('select');
  };

  const pasteRef = useLatest(pasteUnit);
  const unitRef = useLatest(unit);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.repeat) return;
      if (isTypingOrModal()) return;
      const key = e.key.toLowerCase();
      if (key === 'c' && unitRef.current) {
        clipboard.current = { ...unitRef.current };
        store.setStatus(`Unidad ${unitRef.current.code} copiada`);
      } else if (key === 'v' && clipboard.current) {
        e.preventDefault();
        pasteRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, pasteRef, unitRef]);

  const saveUnitPolygon = (id, points) => store.saveUnit(id, { polygon: points, pin: centroid(points).map(round) });

  const removeUnit = async (u) => {
    if (!(await confirm({ title: `¿Borrar la unidad ${u.code}?`, confirmLabel: 'Borrar unidad' }))) return;
    store.removeUnit(u.id);
    if (unit?.id === u.id) setUnitId(null);
  };

  if (error && !building) {
    return (
      <div className="splash">
        <p className="splash-title">No se pudo abrir el edificio</p>
        <p className="error">{error}</p>
        <button onClick={onBack}>← Volver a la lista</button>
      </div>
    );
  }
  if (!building) return <Loader label="Abriendo edificio…" />;

  const upcoming = nextFloor(building.floors);

  return (
    <div className="editor">
      <aside className="side left">
        <button onClick={onBack}>← Edificios</button>
        <h3>{building.name}</h3>

        <h4>Pisos</h4>
        <ul className="list compact">
          {floors.map((f) => (
            <li key={f.localKey ?? f.id} className="row-with-action">
              <button className={`row ${f.id === floor?.id ? 'active' : ''}`} onClick={() => selectFloor(f.id)}>
                <strong>{f.code}</strong>
                <span className="muted">
                  {FLOOR_KINDS[f.kind]} · {f.units.length} un.{f.plan_image_url ? '' : ' · sin imagen'}
                  {(isTemp(f.id) || f.units.some((u) => isTemp(u.id))) && ' · guardando…'}
                </span>
              </button>
              <button className="row-action" title={`Borrar piso ${f.code}`} aria-label={`Borrar piso ${f.code}`} onClick={() => removeFloor(f)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="stack">
          <button onClick={addFloor}>+ Agregar piso {upcoming.code}</button>
          {floor && (
            <button onClick={() => duplicateFloor(floor)} title="Copia imagen, plano, alineación y unidades">
              Duplicar piso {floor.code} → {upcoming.code}
            </button>
          )}
        </div>

        <details>
          <summary>Datos del edificio</summary>
          <BuildingForm building={building} onSave={store.saveBuilding} onDelete={removeBuilding} />
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
            selectedUnitId={unit?.id ?? null}
            tool={tool}
            onSelectUnit={setUnitId}
            onUnitPolygon={saveUnitPolygon}
            onAlignment={(a) => store.saveFloor(floor.id, { alignment: a }, { debounce: true })}
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
          onSaveFloor={(patch, opts) => store.saveFloor(floor.id, patch, opts)}
          onUploadImage={uploadFloorImage}
          onAddUnit={addUnit}
          onSaveUnit={(patch) => store.saveUnit(unit.id, patch)}
          onDeleteUnit={() => removeUnit(unit)}
          onDrawUnit={() => setTool('draw')}
        />
      )}
      {confirmDialog}
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
  // Vacío borra la clave (no `null`): el visor completa lo que falta con sus valores por defecto.
  const saveFacade = (key, v) => onSave({ facade: { ...facade, [key]: v ?? undefined } });
  return (
    <div className="stack">
      <TextField label="Nombre" value={building.name} onCommit={(name) => onSave({ name })} />
      <TextField label="Dirección" value={building.address} nullable onCommit={(address) => onSave({ address })} />
      <TextField label="Slug (URL pública)" value={building.slug} nullable onCommit={(slug) => onSave({ slug })} />
      <p className="muted">Fachada (viewBox del visor)</p>
      <div className="grid2">
        {[
          ['width', 'Ancho'],
          ['height', 'Alto'],
          ['ground', 'Suelo (y)'],
          ['x', 'Torre x'],
          ['w', 'Torre ancho'],
        ].map(([key, label]) => (
          <NumberField key={key} label={label} value={facade[key] ?? null} nullable onCommit={(v) => saveFacade(key, v)} />
        ))}
      </div>
      <button className="danger" onClick={onDelete}>
        Borrar edificio
      </button>
    </div>
  );
}
