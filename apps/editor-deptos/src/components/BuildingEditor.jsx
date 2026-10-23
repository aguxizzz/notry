import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { centroid, round } from '../geometry.js';
import { FLOOR_KINDS, nextFloor, nextUnitCode, UNIT_DATA_FIELDS } from '../model.js';
import { useBuildingStore } from '../useBuildingStore.js';
import { useLatest } from '../useLatest.js';
import { enterToNextField, isTypingOrModal, shortcutOf } from '../keyboard.js';
import { useConfirm } from './useConfirm.jsx';
import { NumberField, TextField } from './fields.jsx';
import FloorCanvas from './FloorCanvas.jsx';
import Loader from './Loader.jsx';
import Inspector from './Inspector.jsx';
import Icon from './icons.jsx';

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

// Pantalla de edición: selección, herramientas y portapapeles. El estado del edificio y su
// guardado optimista viven en `buildingStore.js`.
export default function BuildingEditor({ buildingId, onBack, topbarSlot }) {
  const [{ building, status, error, canUndo, canRedo }, store] = useBuildingStore(buildingId);
  const [floorId, setFloorId] = useState(null);
  const [unitId, setUnitId] = useState(null);
  const [tool, setTool] = useState('select');
  const [showBuildingForm, setShowBuildingForm] = useState(false);
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
  // Un solo paso en el historial: deshacer saca el piso con sus unidades.
  const duplicateFloor = (src) => {
    const { code, name, level } = nextFloor(latestFloors());
    const units = src.units.map((u) => ({
      code: u.code.startsWith(src.code) ? code + u.code.slice(src.code.length) : u.code,
      status: 'available',
      ...pick(u, UNIT_DATA_FIELDS),
    }));
    const data = pick(src, ['kind', 'summary', 'facade_height', 'plan_image_url', 'plan_width', 'plan_height', 'source_plan_url', 'alignment', 'zones']);
    selectFloor(store.insertFloor({ code, name, level, ...data }, units));
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
    // Deshacer vuelve a la imagen de antes, no a la vista previa local.
    const before = pick(floor, [field, ...Object.keys(sizePatch)]);
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
    store.saveFloor(target, { [field]: up.url, ...sizePatch }, { before });
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
    if (!src || !f) return false;
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
    return true;
  };

  const copyUnit = () => {
    if (!unit) return false;
    clipboard.current = { ...unit };
    store.setStatus(`Unidad ${unit.code} copiada`);
    return true;
  };

  const saveUnitPolygon = (id, points) => store.saveUnit(id, { polygon: points, pin: centroid(points).map(round) });

  // Sin confirmación: se puede deshacer con Ctrl+Z.
  const removeUnit = (u) => {
    store.removeUnit(u.id);
    if (unit?.id === u.id) setUnitId(null);
  };

  const removeSelectedUnit = () => {
    if (!unit || tool === 'draw') return false;
    removeUnit(unit);
    return true;
  };

  // ── Atajos ──────────────────────────────────────────────────
  // Cada acción devuelve true si hizo algo (entonces se evita la acción del navegador).
  const shortcuts = {
    'mod+z': store.undo,
    'mod+shift+z': store.redo,
    'mod+y': store.redo,
    'mod+c': copyUnit,
    'mod+v': pasteUnit,
    delete: removeSelectedUnit,
  };

  const onKeyDown = useLatest((e) => {
    const action = shortcuts[shortcutOf(e)];
    if (!action || e.repeat || isTypingOrModal()) return;
    if (action()) e.preventDefault();
  });

  useEffect(() => {
    const down = (e) => onKeyDown.current(e);
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [onKeyDown]);

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
        {/* Los datos del edificio reemplazan al panel entero (no una caja adentro). */}
        {showBuildingForm ? (
          <BuildingForm building={building} onSave={store.saveBuilding} onDelete={removeBuilding} onClose={() => setShowBuildingForm(false)} />
        ) : (
        <div className="side-view side-view--back">
        <div className="side-head">
          <h2>{building.name}</h2>
          <button className="icon-btn" title="Datos del edificio" aria-label="Datos del edificio" onClick={() => setShowBuildingForm(true)}>
            <Icon name="settings" />
          </button>
        </div>

        <div className="side-body">
        <div className="section-head">
          <h4>Pisos</h4>
          <span className="count">{floors.length}</span>
        </div>
        {/* De arriba hacia abajo, como en la fachada: el piso nuevo aparece arriba de todo,
            justo debajo de los botones que lo crean. */}
        <div className="floor-actions">
          <button className="add-btn" onClick={addFloor}>
            <Icon name="plus" size={16} /> Agregar piso {upcoming.code}
          </button>
          {floor && (
            <button className="secondary" onClick={() => duplicateFloor(floor)} title="Copia imagen, plano, alineación y unidades">
              <Icon name="copy" size={16} /> Duplicar {floor.code} → {upcoming.code}
            </button>
          )}
        </div>
        <ul className="floor-list">
          {[...floors].reverse().map((f) => (
            <li key={f.localKey ?? f.id} className="row-with-action">
              <button className={`floor-row ${f.id === floor?.id ? 'is-active' : ''}`} onClick={() => selectFloor(f.id)}>
                <span className="floor-code">{f.code}</span>
                <span className="floor-info">
                  <span className="floor-name">{f.name || FLOOR_KINDS[f.kind]}</span>
                  <span className="floor-meta">
                    {f.kind === 'units'
                      ? `${f.units.length} ${f.units.length === 1 ? 'unidad' : 'unidades'}`
                      : f.name && f.name !== FLOOR_KINDS[f.kind] && FLOOR_KINDS[f.kind]}
                    {!f.plan_image_url && <span className="tag">sin imagen</span>}
                  </span>
                </span>
              </button>
              <button className="row-action" title={`Borrar piso ${f.code}`} aria-label={`Borrar piso ${f.code}`} onClick={() => removeFloor(f)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        </div>
        </div>
        )}
      </aside>

      {/* La ruta, deshacer/rehacer y el estado de guardado van en la barra de la app (una sola
          barra arriba): el lienzo queda de borde a borde. */}
      {topbarSlot &&
        createPortal(
          <>
            <nav className="crumbs" aria-label="Ubicación">
              <button className="crumb-link" onClick={onBack}>
                Edificios
              </button>
              <Icon name="chevron" size={14} />
              <span className="crumb">{building.name}</span>
              {floor && (
                <>
                  <Icon name="chevron" size={14} />
                  <span className={`crumb ${unit ? '' : 'is-current'}`}>{floor.name || `Piso ${floor.code}`}</span>
                </>
              )}
              {floor && unit && (
                <>
                  <Icon name="chevron" size={14} />
                  <span className="crumb is-current">Unidad {unit.code}</span>
                </>
              )}
            </nav>
            <span className="spacer" />
            <div className="topbar-history">
              <button className="icon-btn" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled={!canUndo} onClick={store.undo}>
                <Icon name="undo" />
              </button>
              <button className="icon-btn" title="Rehacer (Ctrl+Y)" aria-label="Rehacer" disabled={!canRedo} onClick={store.redo}>
                <Icon name="redo" />
              </button>
            </div>
            {error ? (
              <span className="save-pill is-error" title={error}>
                {error}
              </span>
            ) : (
              status && <span className={`save-pill ${status.endsWith('…') ? 'is-busy' : ''}`}>{status}</span>
            )}
            <span className="topbar-divider" aria-hidden="true" />
          </>,
          topbarSlot
        )}

      <section className="stage">
        {floor ? (
          <FloorCanvas
            floor={floor}
            selectedUnitId={unit?.id ?? null}
            selectedUnitCode={unit?.code}
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
          tool={tool}
          onSelectUnit={(id) => {
            setUnitId(id);
            setTool('select');
          }}
          onSaveFloor={(patch, opts) => store.saveFloor(floor.id, patch, opts)}
          onUploadImage={uploadFloorImage}
          onAddUnit={addUnit}
          onSaveUnit={(patch) => store.saveUnit(unit.id, patch)}
          onDeleteUnit={() => removeUnit(unit)}
          onToolChange={setTool}
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

function BuildingForm({ building, onSave, onDelete, onClose }) {
  const facade = building.facade || {};
  // Vacío borra la clave (no `null`): el visor completa lo que falta con sus valores por defecto.
  const saveFacade = (key, v) => onSave({ facade: { ...facade, [key]: v ?? undefined } });
  return (
    <div className="side-view building-form">
      <div className="side-head">
        <button className="icon-btn side-back" title="Volver a los pisos" aria-label="Volver a los pisos" onClick={onClose}>
          <Icon name="back" />
        </button>
        <h2>Datos del edificio</h2>
      </div>

      <div className="side-body">

      <section className="form-section" onKeyDown={enterToNextField}>
        <h4>General</h4>
        <TextField label="Nombre" value={building.name} onCommit={(name) => onSave({ name })} />
        <TextField label="Dirección" value={building.address} nullable onCommit={(address) => onSave({ address })} />
        <TextField label="Slug (URL pública)" value={building.slug} nullable onCommit={(slug) => onSave({ slug })} />
      </section>

      <section className="form-section" onKeyDown={enterToNextField}>
        <h4>Fachada</h4>
        <p className="note">Encuadre del dibujo de la fachada en el visor (viewBox). Vacío usa el valor por defecto.</p>
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
      </section>

      <section className="form-section">
        <button className="ghost danger" onClick={onDelete}>
          <Icon name="trash" size={16} /> Borrar edificio
        </button>
      </section>
      </div>
    </div>
  );
}
