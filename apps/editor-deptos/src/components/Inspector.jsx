import { useState } from 'react';
import { alignmentOf, DEFAULT_ALIGNMENT } from '../geometry.js';
import { FLOOR_KINDS, STATUSES } from '../model.js';
import { NumberField, TextField } from './fields.jsx';

// Valor de alineación que se aplica en vivo: slider opcional (rango cómodo para el ajuste
// grueso) + input numérico (sin límites, para el valor exacto). El guardado ya va con debounce.
// Con `stepper`, botones −/+ en vez de slider: de a `step`, con Shift de a 10 pasos.
function AlignField({ label, value, onChange, min, max, step, slider = true, stepper = false, suffix }) {
  const nudge = (e, dir) => onChange(value + dir * step * (e.shiftKey ? 10 : 1));
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  // Si el valor cambia desde afuera (slider, arrastre, flechas), refleja; si no, respeta lo tipeado ("1.", "-").
  if (value !== shown) {
    setShown(value);
    if (Number(text) !== value) setText(String(value));
  }

  return (
    <label className="align-field">
      <span>{label}</span>
      <div className="align-field-row">
        {slider && !stepper && (
          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        )}
        {stepper && (
          <button type="button" className="step-btn" title="Restar (Shift: ×10)" onClick={(e) => nudge(e, -1)}>
            −
          </button>
        )}
        <input
          type="number"
          step={step}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
          }}
        />
        {stepper && (
          <button type="button" className="step-btn" title="Sumar (Shift: ×10)" onClick={(e) => nudge(e, 1)}>
            +
          </button>
        )}
        {suffix && <span className="muted">{suffix}</span>}
      </div>
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
        <AlignField label="Escala" value={align.scale} min={0.5} max={2} step={0.001} suffix="×" onChange={(scale) => setAlign({ scale })} />
        <AlignField label="Rotación" value={align.rotation} min={-20} max={20} step={0.05} suffix="°" onChange={(rotation) => setAlign({ rotation })} />
        <AlignField label="Offset X" value={align.x} step={1} stepper suffix="px" onChange={(x) => setAlign({ x })} />
        <AlignField label="Offset Y" value={align.y} step={1} stepper suffix="px" onChange={(y) => setAlign({ y })} />
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
    </aside>
  );
}
