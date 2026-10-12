import { alignmentOf, DEFAULT_ALIGNMENT, STATUSES } from '../geometry.js';

const FLOOR_KINDS = { units: 'Unidades', pb: 'Planta baja', amenities: 'Amenities', roof: 'Terraza' };

function NumberField({ label, value, onCommit, step = 1, nullable = false }) {
  return (
    <label>
      {label}
      <input
        key={value ?? ''}
        type="number"
        step={step}
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const raw = e.target.value;
          const next = raw === '' ? (nullable ? null : value) : Number(raw);
          if (next !== value && next !== undefined) onCommit(next);
        }}
      />
    </label>
  );
}

function TextField({ label, value, onCommit, nullable = false }) {
  return (
    <label>
      {label}
      <input
        key={value ?? ''}
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (!raw && !nullable) return;
          const next = raw || null;
          if (next !== (value ?? null)) onCommit(next);
        }}
      />
    </label>
  );
}

function FileButton({ label, onFile }) {
  return (
    <label className="file-button">
      {label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

export default function Inspector({
  floor,
  unit,
  onSelectUnit,
  onSaveFloor,
  onDeleteFloor,
  onUploadImage,
  onAddUnit,
  onSaveUnit,
  onDeleteUnit,
  onDrawUnit,
}) {
  const align = alignmentOf(floor);
  const setAlign = (patch) => onSaveFloor({ alignment: { ...align, ...patch } }, { debounce: true });

  return (
    <aside className="side right">
      <h3>Piso {floor.code}</h3>
      <div className="stack">
        <TextField label="Nombre" value={floor.name} onCommit={(name) => onSaveFloor({ name })} />
        <div className="grid2">
          <label>
            Tipo
            <select value={floor.kind} onChange={(e) => onSaveFloor({ kind: e.target.value })}>
              {Object.entries(FLOOR_KINDS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <NumberField label="Nivel (orden)" value={floor.level} onCommit={(level) => onSaveFloor({ level })} />
        </div>
        <NumberField label="Alto en fachada" value={floor.facade_height} nullable onCommit={(v) => onSaveFloor({ facade_height: v })} />
        <TextField label="Resumen (pisos sin unidades)" value={floor.summary} nullable onCommit={(summary) => onSaveFloor({ summary })} />
      </div>

      <h4>Imágenes</h4>
      <div className="stack">
        <div className="inline">
          <FileButton label={floor.plan_image_url ? 'Reemplazar imagen del piso' : 'Subir imagen del piso'} onFile={(f) => onUploadImage(f, 'plans')} />
        </div>
        {floor.plan_image_url && (
          <p className="muted">
            {floor.plan_width}×{floor.plan_height}px. Los polígonos están en esta resolución: si la reemplazás por otra de distinto tamaño, hay que redibujarlos.
          </p>
        )}
        <div className="inline">
          <FileButton label={floor.source_plan_url ? 'Reemplazar plano original' : 'Subir plano original (overlay)'} onFile={(f) => onUploadImage(f, 'source-plans')} />
          {floor.source_plan_url && <button onClick={() => onSaveFloor({ source_plan_url: null })}>Quitar</button>}
        </div>
      </div>

      <h4>Alineación de la imagen</h4>
      <div className="stack">
        <label>
          Opacidad del plano original ({Math.round(align.opacity * 100)}%)
          <input type="range" min="0" max="1" step="0.05" value={align.opacity} onChange={(e) => setAlign({ opacity: Number(e.target.value) })} />
        </label>
        <label>
          Escala ({align.scale.toFixed(3)})
          <input type="range" min="0.2" max="3" step="0.005" value={align.scale} onChange={(e) => setAlign({ scale: Number(e.target.value) })} />
        </label>
        <label>
          Rotación ({align.rotation.toFixed(1)}°)
          <input type="range" min="-180" max="180" step="0.1" value={align.rotation} onChange={(e) => setAlign({ rotation: Number(e.target.value) })} />
        </label>
        <div className="grid2">
          <NumberField label="Offset X" value={align.x} step={1} onCommit={(x) => setAlign({ x })} />
          <NumberField label="Offset Y" value={align.y} step={1} onCommit={(y) => setAlign({ y })} />
        </div>
        <button onClick={() => onSaveFloor({ alignment: { ...DEFAULT_ALIGNMENT, opacity: align.opacity } }, { debounce: true })}>
          Resetear alineación
        </button>
      </div>

      <h4>Unidades</h4>
      <ul className="list compact">
        {floor.units.map((u) => (
          <li key={u.id}>
            <button className={`row ${u.id === unit?.id ? 'active' : ''}`} onClick={() => onSelectUnit(u.id)}>
              <span className="dot" style={{ background: STATUSES[u.status]?.color }} />
              <strong>{u.code}</strong>
              <span className="muted">{u.polygon ? 'dibujada' : 'sin polígono'}</span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={onAddUnit}>+ Nueva unidad</button>

      {unit && (
        <div className="stack unit-form" key={unit.id}>
          <h4>Unidad {unit.code}</h4>
          <button className="primary" onClick={onDrawUnit}>
            {unit.polygon ? 'Redibujar polígono' : 'Dibujar polígono'}
          </button>
          <TextField label="Código" value={unit.code} onCommit={(code) => onSaveUnit({ code })} />
          <label>
            Estado
            <select value={unit.status} onChange={(e) => onSaveUnit({ status: e.target.value })}>
              {Object.entries(STATUSES).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid3">
            <NumberField label="Ambientes" value={unit.ambientes} nullable onCommit={(v) => onSaveUnit({ ambientes: v })} />
            <NumberField label="Dormit." value={unit.dormitorios} nullable onCommit={(v) => onSaveUnit({ dormitorios: v })} />
            <NumberField label="Baños" value={unit.banos} nullable onCommit={(v) => onSaveUnit({ banos: v })} />
          </div>
          <div className="grid3">
            <NumberField label="m² total" value={unit.total_m2 == null ? null : Number(unit.total_m2)} step={0.01} nullable onCommit={(v) => onSaveUnit({ total_m2: v })} />
            <NumberField label="m² cubiertos" value={unit.covered_m2 == null ? null : Number(unit.covered_m2)} step={0.01} nullable onCommit={(v) => onSaveUnit({ covered_m2: v })} />
            <NumberField label="m² semi" value={unit.semi_m2 == null ? null : Number(unit.semi_m2)} step={0.01} nullable onCommit={(v) => onSaveUnit({ semi_m2: v })} />
          </div>
          <button className="danger" onClick={onDeleteUnit}>
            Borrar unidad
          </button>
        </div>
      )}

      <hr />
      <button className="danger" onClick={onDeleteFloor}>
        Borrar piso
      </button>
    </aside>
  );
}
