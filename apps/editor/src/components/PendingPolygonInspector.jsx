import { useMemo, useState } from 'react';
import { Link2, Plus, Search, Trash2 } from 'lucide-react';
import { Field, InspectorShell, LotShape, NumberInput, Section, StatusPicker } from './inspector/InspectorUI';
import { LOT_STATUS_OPTIONS } from './inspector/inspectorUtils';

// Siguiente nombre libre a partir del lote con el número más alto
// ("Lote 07" → "Lote 08"), respetando prefijo y ceros a la izquierda.
function suggestNextName(annotations) {
  let best = null;
  for (const annotation of annotations) {
    if (annotation.type !== 'polygon' || annotation.pending) continue;
    const match = /^(.*?)(\d+)\s*$/.exec(annotation.tooltip || '');
    if (!match) continue;
    const number = Number(match[2]);
    if (!best || number > best.number) best = { prefix: match[1], number, width: match[2].length };
  }
  if (!best) return 'Lote 1';
  return `${best.prefix}${String(best.number + 1).padStart(best.width, '0')}`;
}

export default function PendingPolygonInspector({
  pendingMode,
  onPendingModeChange,
  selectedMarker,
  onUpdateSelected,
  isCreatingLote,
  onCreateLote,
  lotsWithEmptyCoords,
  assignTargetId,
  onAssignTargetChange,
  isAssigning,
  onAssign,
  onDiscard,
  onClose,
  annotations,
  editorMode,
}) {
  const name     = selectedMarker.tooltip || '';
  const status   = selectedMarker.status || 'available';
  const price    = selectedMarker.price != null ? String(selectedMarker.price) : '';
  const area     = selectedMarker.area_m2 != null ? String(selectedMarker.area_m2) : '';
  const comments = selectedMarker.comments || '';
  const [query, setQuery] = useState('');

  const onPanorama = editorMode !== 'blueprint';
  const viewLabel = onPanorama ? 'panorama' : 'plano';
  const ownCoords = onPanorama ? selectedMarker.panorama_coordinates : selectedMarker.blueprint_coordinates;
  const suggestedName = useMemo(() => suggestNextName(annotations), [annotations]);

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return lotsWithEmptyCoords.filter(lot => !normalized
      || (lot.tooltip || lot.uuid || '').toLocaleLowerCase('es').includes(normalized));
  }, [lotsWithEmptyCoords, query]);
  const target = lotsWithEmptyCoords.find(lot => String(lot.id) === String(assignTargetId));

  const creating = pendingMode === 'create';
  const busy = creating ? isCreatingLote : isAssigning;
  const canSubmit = creating ? name.trim().length > 0 : !!target;
  const submit = () => {
    if (!canSubmit || busy) return;
    if (creating) onCreateLote();
    else onAssign();
  };
  const handleKeyDown = event => {
    if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
      event.preventDefault();
      submit();
    }
  };

  const submitLabel = creating
    ? (isCreatingLote ? 'Creando…' : `Crear ${name.trim() || 'lote'}`)
    : (isAssigning ? 'Asignando…' : target ? `Asignar a ${target.tooltip || 'lote'}` : 'Elegí un lote');

  return (
    <InspectorShell
      media={<LotShape coords={ownCoords} size={44} color="var(--color-warning)" dashed />}
      title={<div className="ins-head__title">Polígono nuevo <span className="ins-pill is-warn">Sin guardar</span></div>}
      subtitle={`${onPanorama ? 'Panorama' : 'Plano'} · ${ownCoords?.length ?? 0} vértices`}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      footer={(
        <>
          <button type="button" className="editor-btn editor-btn--ghost" onClick={onDiscard} title="Borra el dibujo (Supr)">
            <Trash2 size={15} /> Descartar
          </button>
          <button
            type="button"
            className="editor-btn editor-btn--primary ins-foot__block"
            onClick={submit}
            disabled={!canSubmit || busy}
          >
            {submitLabel} {!busy && canSubmit && <kbd>↵</kbd>}
          </button>
        </>
      )}
    >
      <Section label="¿Qué es este dibujo?">
        <div className="ins-choice" role="radiogroup" aria-label="Qué hacer con el polígono">
          <button
            type="button"
            role="radio"
            aria-checked={creating}
            className={`ins-choice__card${creating ? ' is-active' : ''}`}
            onClick={() => onPendingModeChange('create')}
          >
            <span className="ins-choice__icon"><Plus size={15} /></span>
            <strong>Un lote nuevo</strong>
            <small>Se crea en la base con este dibujo</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={!creating}
            className={`ins-choice__card${!creating ? ' is-active' : ''}`}
            onClick={() => onPendingModeChange('assign')}
            disabled={lotsWithEmptyCoords.length === 0}
          >
            <span className="ins-choice__icon"><Link2 size={15} /></span>
            <strong>Uno que ya existe</strong>
            <small>
              {lotsWithEmptyCoords.length === 0
                ? `Todos los lotes ya están en el ${viewLabel}`
                : `${lotsWithEmptyCoords.length} sin ubicación en el ${viewLabel}`}
            </small>
          </button>
        </div>
      </Section>

      {creating ? (
        <Section label="Datos">
          <Field label="Nombre" htmlFor="pending-name">
            <input
              id="pending-name"
              value={name}
              onChange={e => onUpdateSelected('tooltip', e.target.value)}
              placeholder={`Ej: ${suggestedName}`}
              autoFocus
            />
          </Field>
          {name.trim() !== suggestedName && (
            <div className="ins-chips">
              <button type="button" className="ins-chip" onClick={() => onUpdateSelected('tooltip', suggestedName)}>
                Usar «{suggestedName}», el siguiente libre
              </button>
            </div>
          )}
          <StatusPicker
            value={status}
            onChange={value => onUpdateSelected('status', value)}
            options={LOT_STATUS_OPTIONS.slice(0, 3)}
          />
          <div className="ins-grid2">
            <Field label="Precio" htmlFor="pending-price" prefix="USD">
              <NumberInput
                id="pending-price"
                value={price}
                onChange={value => onUpdateSelected('price', value)}
                onBlur={() => { if (price === '') onUpdateSelected('price', 0); }}
                placeholder="Opcional"
              />
            </Field>
            <Field label="Superficie" htmlFor="pending-area" suffix="m²">
              <NumberInput
                id="pending-area"
                value={area}
                onChange={value => onUpdateSelected('area_m2', value)}
                onBlur={() => { if (area === '') onUpdateSelected('area_m2', 0); }}
                placeholder="Opcional"
              />
            </Field>
          </div>
          <Field label="Observaciones" htmlFor="pending-comments">
            <textarea
              id="pending-comments"
              rows={2}
              value={comments}
              onChange={e => onUpdateSelected('comments', e.target.value)}
              placeholder="Opcional"
            />
          </Field>
          <p className="ins-help">Las fotos se cargan después de crearlo.</p>
        </Section>
      ) : (
        <Section label="Elegí el lote" aside={`Sin ubicación en el ${viewLabel}`}>
          {lotsWithEmptyCoords.length > 4 && (
            <Field label="Buscar" htmlFor="pending-search" prefix={<Search size={14} />}>
              <input id="pending-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre del lote" />
            </Field>
          )}
          <div className="ins-list" role="radiogroup" aria-label="Lotes existentes">
            {candidates.length === 0 && <p className="ins-help">Ningún lote coincide con «{query}».</p>}
            {candidates.map(lot => {
              const active = String(lot.id) === String(assignTargetId);
              const otherCoords = onPanorama ? lot.blueprint_coordinates : lot.panorama_coordinates;
              return (
                <button
                  key={lot.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`ins-list__row${active ? ' is-active' : ''}`}
                  onClick={() => onAssignTargetChange(String(lot.id))}
                >
                  <LotShape coords={otherCoords} size={36} color={active ? 'var(--accent)' : 'var(--text-subtle)'} />
                  <span>
                    <strong>{lot.tooltip || lot.uuid}</strong>
                    <small>
                      {lot.area_m2 ? `${Number(lot.area_m2).toLocaleString('es-AR')} m² · ` : ''}
                      {otherCoords?.length >= 3 ? `ubicado en el ${onPanorama ? 'plano' : 'panorama'}` : 'sin ubicar'}
                    </small>
                  </span>
                  <span className="ins-radio" />
                </button>
              );
            })}
          </div>
          {target && (
            <p className="ins-help">
              Lo que dibujaste pasa a ser la ubicación de <strong>{target.tooltip || 'este lote'}</strong> en el {viewLabel}. Sus datos no cambian.
            </p>
          )}
        </Section>
      )}
    </InspectorShell>
  );
}
