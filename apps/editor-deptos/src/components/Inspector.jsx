import { useState } from 'react';
import { alignmentOf, DEFAULT_ALIGNMENT } from '../geometry.js';
import { enterToNextField } from '../keyboard.js';
import { FLOOR_KINDS, STATUSES } from '../model.js';
import { NumberField, TextField } from './fields.jsx';
import Icon from './icons.jsx';

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
      <Icon name="image" size={16} /> {label}
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

// Imagen del piso o plano original: miniatura + subir/reemplazar (+ quitar si se puede).
function ImageSlot({ title, hint, url, onFile, onRemove }) {
  return (
    <div className="image-slot">
      <div className={`image-thumb ${url ? '' : 'is-empty'}`}>{url ? <img src={url} alt="" /> : <Icon name="image" size={20} />}</div>
      <div className="image-slot-body">
        <strong>{title}</strong>
        <span className="muted">{hint}</span>
        <div className="inline">
          <FileButton label={url ? 'Reemplazar' : 'Subir'} onFile={onFile} />
          {url && onRemove && (
            <button className="ghost" onClick={onRemove}>
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const m2 = (v) => (v == null ? null : `${Number(v).toLocaleString('es-AR', { maximumFractionDigits: 2 })} m²`);

export default function Inspector({
  floor,
  unit,
  tool,
  onSelectUnit,
  onSaveFloor,
  onUploadImage,
  onAddUnit,
  onSaveUnit,
  onDeleteUnit,
  onToolChange,
}) {
  const align = alignmentOf(floor);
  const setAlign = (patch) => onSaveFloor({ alignment: { ...align, ...patch } }, { debounce: true });

  // La pestaña sigue a lo que se está haciendo: elegir una unidad (en el lienzo o la lista)
  // o dibujar lleva a Unidades; alinear, a Piso. Después se puede cambiar a mano.
  const [tab, setTab] = useState(unit ? 'units' : 'floor');
  const [followed, setFollowed] = useState({ unitId: unit?.id, tool });
  if (followed.unitId !== unit?.id || followed.tool !== tool) {
    setFollowed({ unitId: unit?.id, tool });
    if (tool === 'align') setTab('floor');
    else if ((unit && unit.id !== followed.unitId) || tool === 'draw') setTab('units');
  }
  // El ajuste a mano vive en la sección de alineación: salir de Piso lo apaga.
  const selectTab = (id) => {
    setTab(id);
    if (id !== 'floor' && tool === 'align') onToolChange('select');
  };
  const aligning = tool === 'align';
  const canAlign = Boolean(floor.plan_image_url && floor.source_plan_url);

  return (
    <aside className="side right">
      <div className="tabs">
        <div className="tabs-track" role="tablist" style={{ '--tab-index': tab === 'floor' ? 0 : 1 }}>
          {[
            ['floor', 'layers', `Piso ${floor.code}`],
            ['units', 'select', `Unidades · ${floor.units.length}`],
          ].map(([id, icon, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => selectTab(id)}>
              <Icon name={icon} size={16} /> {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'floor' ? (
        // En el orden en que se arma un piso: imágenes, alineación y, al final, los datos
        // (se cargan una vez y casi no se tocan).
        <div key="floor" className="inspector-body side-view--back">
          <section className="panel-section">
            <h4>Imágenes</h4>
            <div className="stack">
              <ImageSlot
                title="Imagen del piso"
                hint={floor.plan_image_url ? `${floor.plan_width}×${floor.plan_height}px` : 'La que ve el comprador'}
                url={floor.plan_image_url}
                onFile={(f) => onUploadImage(f, 'plans')}
              />
              {floor.plan_image_url && (
                <p className="note">Los polígonos están en esta resolución: si la reemplazás por otra de distinto tamaño, hay que redibujarlos.</p>
              )}
              <ImageSlot
                title="Plano original"
                hint="Overlay para alinear y dibujar"
                url={floor.source_plan_url}
                onFile={(f) => onUploadImage(f, 'source-plans')}
                onRemove={() => {
                  if (aligning) onToolChange('select');
                  onSaveFloor({ source_plan_url: null });
                }}
              />
            </div>
          </section>

          <section className="panel-section" onKeyDown={enterToNextField}>
            <h4>Alineación de la imagen</h4>
            {/* Alinear es mover la imagen del piso sobre el plano original: sin las dos no hay nada que ajustar. */}
            {!canAlign ? (
              <p className="note">
                {floor.plan_image_url
                  ? 'Subí el plano original para alinear la imagen del piso encima.'
                  : 'Subí la imagen del piso y el plano original para alinearlos.'}
              </p>
            ) : (
            <div className="stack">
              <button className={aligning ? 'primary' : 'secondary'} aria-pressed={aligning} onClick={() => onToolChange(aligning ? 'select' : 'align')}>
                <Icon name="align" size={16} /> {aligning ? 'Listo' : 'Mover a mano sobre el plano'}
              </button>
              <label>
                Opacidad del plano original ({Math.round(align.opacity * 100)}%)
                <input type="range" min="0" max="1" step="0.05" value={align.opacity} onChange={(e) => setAlign({ opacity: Number(e.target.value) })} />
              </label>
              <AlignField label="Escala" value={align.scale} min={0.5} max={2} step={0.001} suffix="×" onChange={(scale) => setAlign({ scale })} />
              <AlignField label="Rotación" value={align.rotation} min={-20} max={20} step={0.05} suffix="°" onChange={(rotation) => setAlign({ rotation })} />
              <AlignField label="Offset X" value={align.x} step={1} stepper suffix="px" onChange={(x) => setAlign({ x })} />
              <AlignField label="Offset Y" value={align.y} step={1} stepper suffix="px" onChange={(y) => setAlign({ y })} />
              <button className="secondary" onClick={() => onSaveFloor({ alignment: { ...DEFAULT_ALIGNMENT, opacity: align.opacity } }, { debounce: true })}>
                Resetear alineación
              </button>
            </div>
            )}
          </section>

          <section className="panel-section" onKeyDown={enterToNextField}>
            <h4>Datos del piso</h4>
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
                <NumberField label="Posición en la torre" value={floor.level} onCommit={(level) => onSaveFloor({ level })} />
              </div>
              <NumberField label="Alto en fachada" value={floor.facade_height} nullable onCommit={(v) => onSaveFloor({ facade_height: v })} />
              {/* El resumen reemplaza a la lista de unidades en el visor: solo tiene sentido en PB, amenities y terraza. */}
              {floor.kind !== 'units' && (
                <TextField label="Resumen" value={floor.summary} nullable onCommit={(summary) => onSaveFloor({ summary })} />
              )}
            </div>
          </section>
        </div>
      ) : (
        <div key="units" className="inspector-body">
          <section className="panel-section">
            <ul className="unit-list">
              {floor.units.map((u) => (
                <li key={u.id}>
                  <button className={`unit-row ${u.id === unit?.id ? 'is-active' : ''}`} onClick={() => onSelectUnit(u.id)}>
                    <span className="dot" style={{ background: STATUSES[u.status]?.color }} />
                    <strong>{u.code}</strong>
                    <span className="unit-row-meta">{m2(u.total_m2) || STATUSES[u.status]?.label}</span>
                    {!u.polygon && <span className="tag">sin polígono</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button className="add-btn" onClick={onAddUnit}>
              <Icon name="plus" size={16} /> Nueva unidad
            </button>
          </section>

          {unit ? (
            <section className="panel-section unit-form" key={unit.id} onKeyDown={enterToNextField}>
              <div className="unit-form-head">
                <div>
                  <p className="eyebrow">Unidad</p>
                  <h3>{unit.code}</h3>
                </div>
                <span className="status-chip" style={{ '--status': STATUSES[unit.status]?.color }}>
                  {STATUSES[unit.status]?.label}
                </span>
              </div>
              <div className="stack">
                <button className="primary" onClick={() => onToolChange('draw')}>
                  <Icon name="draw" size={16} /> {unit.polygon ? 'Redibujar polígono' : 'Dibujar polígono'}
                </button>
                <div className="grid2">
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
                </div>
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
                <button className="ghost danger" onClick={onDeleteUnit}>
                  <Icon name="trash" size={16} /> Borrar unidad
                </button>
              </div>
            </section>
          ) : (
            floor.units.length > 0 && <p className="note">Elegí una unidad en el plano o en la lista para editar sus datos.</p>
          )}
        </div>
      )}
    </aside>
  );
}
