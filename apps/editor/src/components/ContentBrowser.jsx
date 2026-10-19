import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Eye, EyeOff, Layers3, MapPin, Search, Type } from 'lucide-react';
import { statusColor } from './inspector/inspectorUtils';

const LAYERS = [
  { type: 'polygon', label: 'Lotes' },
  { type: 'poi', label: 'Lugares' },
  { type: 'text', label: 'Textos' },
];

const labelOf = annotation => (
  annotation.tooltip || annotation.title || annotation.slug || annotation.uuid || 'Sin nombre'
);

const byLabel = (a, b) => labelOf(a).localeCompare(labelOf(b), 'es', { numeric: true });

const lotStatus = lot => lot.status || lot.estado || 'available';

const inBlueprint = lot => lot.blueprint_coordinates?.length >= 3;
const inPanorama = lot => lot.panorama_coordinates?.length >= 3;

const shortPrice = value => {
  const price = Number(value);
  if (!(price > 0)) return null;
  if (price >= 1e6) return `${(price / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`;
  if (price >= 1e3) return `${Math.round(price / 1e3)}k`;
  return String(price);
};

// La fila seleccionada (desde la vista o desde la lista) queda a la vista.
const scrollIntoView = node => node?.scrollIntoView({ block: 'nearest' });

function LayerHeader({ label, count, hidden, collapsed, onToggleVisible, onToggleCollapsed }) {
  return (
    <div className="layer-head">
      <button
        type="button"
        className={`layer-eye${hidden ? ' is-off' : ''}`}
        onClick={onToggleVisible}
        aria-label={`${hidden ? 'Mostrar' : 'Ocultar'} ${label.toLowerCase()}`}
        title={`${hidden ? 'Mostrar' : 'Ocultar'} ${label.toLowerCase()} en la vista`}
      >
        {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <button type="button" className="layer-head__toggle" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
        {label} <span className="layer-head__count">{count}</span>
        <ChevronDown className="layer-head__chevron" size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function LayerRow({ annotation, selected, onSelect, onHover, children }) {
  return (
    <button
      type="button"
      ref={selected ? scrollIntoView : undefined}
      className={`layer-row${selected ? ' is-selected' : ''}`}
      onClick={() => onSelect(annotation.id)}
      onMouseEnter={() => onHover(annotation.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(annotation.id)}
      onBlur={() => onHover(null)}
    >
      {children}
    </button>
  );
}

/**
 * Pestaña Contenido del panel izquierdo: capas (lotes, lugares, textos) que se
 * pueden ocultar en la vista, y filas que al pasar el mouse resaltan su
 * elemento en el panorama o el plano.
 */
export default function ContentBrowser({
  annotations,
  mode,
  selectedId,
  onSelect,
  onHover,
  hiddenLayers,
  onToggleLayer,
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const onBlueprint = mode === 'blueprint';

  // Las filas se desmontan sin mouseleave al cambiar de pestaña o cerrar el panel.
  useEffect(() => () => onHover(null), [onHover]);

  const byType = useMemo(() => {
    const groups = { polygon: [], poi: [], text: [] };
    annotations.forEach(annotation => groups[annotation.type]?.push(annotation));
    Object.values(groups).forEach(list => list.sort(byLabel));
    return groups;
  }, [annotations]);

  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const matches = annotation => !normalizedQuery || labelOf(annotation).toLocaleLowerCase('es').includes(normalizedQuery);
  const visible = {
    polygon: byType.polygon.filter(matches),
    poi: byType.poi.filter(matches),
    text: byType.text.filter(matches),
  };

  // En el plano solo se dibujan lotes.
  const layers = onBlueprint ? LAYERS.filter(layer => layer.type === 'polygon') : LAYERS;
  const isEmpty = layers.every(layer => byType[layer.type].length === 0);
  const toggleCollapsed = type => setCollapsed(prev => ({ ...prev, [type]: !prev[type] }));

  const renderRows = type => {
    if (type === 'polygon') {
      return visible.polygon.map(lot => (
        <LayerRow key={lot.id} annotation={lot} selected={lot.id === selectedId} onSelect={onSelect} onHover={onHover}>
          <span className="layer-row__dot" style={{ '--dot': statusColor(lotStatus(lot)) }} />
          <span className="layer-row__name">{labelOf(lot)}</span>
          {lot.pending ? (
            <span className="layer-row__tag is-warning">Pendiente</span>
          ) : (
            <>
              <span className="layer-row__meta">{shortPrice(lot.price ?? lot.precio) ?? '—'}</span>
              <span className="layer-row__presence">
                <span className={inBlueprint(lot) ? '' : 'is-missing'} title={inBlueprint(lot) ? 'Dibujado en el plano' : 'Falta dibujarlo en el plano'}>PL</span>
                <span className={inPanorama(lot) ? '' : 'is-missing'} title={inPanorama(lot) ? 'Ubicado en el panorama' : 'Falta ubicarlo en el panorama'}>360</span>
              </span>
            </>
          )}
        </LayerRow>
      ));
    }
    if (type === 'poi') {
      return visible.poi.map(poi => (
        <LayerRow key={poi.id} annotation={poi} selected={poi.id === selectedId} onSelect={onSelect} onHover={onHover}>
          <MapPin className="layer-row__icon" size={15} style={{ color: poi.color ?? 'var(--color-poi)' }} aria-hidden="true" />
          <span className="layer-row__name">{labelOf(poi)}</span>
          <span className="layer-row__meta">{poi.category || ''}</span>
        </LayerRow>
      ));
    }
    return visible.text.map(text => (
      <LayerRow key={text.id} annotation={text} selected={text.id === selectedId} onSelect={onSelect} onHover={onHover}>
        <Type className="layer-row__icon" size={15} aria-hidden="true" />
        <span className="layer-row__name">{labelOf(text)}</span>
      </LayerRow>
    ));
  };

  return (
    <div className="content-browser">
      <label className="content-search">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Buscar contenido</span>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={onBlueprint ? 'Buscar lote' : 'Buscar lote, lugar o texto'}
        />
      </label>

      {isEmpty ? (
        <div className="panel-empty-state">
          <Layers3 size={22} />
          <strong>Todavía no hay contenido</strong>
          <span>{onBlueprint
            ? 'Dibujá un lote desde la barra de herramientas.'
            : 'Dibujá un lote, lugar o texto desde la barra de herramientas.'}</span>
        </div>
      ) : layers.map(({ type, label }) => {
        const hidden = !!hiddenLayers[type];
        const isCollapsed = !!collapsed[type];
        return (
          <section key={type} className={`layer${hidden ? ' is-hidden' : ''}${isCollapsed ? ' is-collapsed' : ''}`}>
            <LayerHeader
              label={label}
              count={byType[type].length}
              hidden={hidden}
              collapsed={isCollapsed}
              onToggleVisible={() => onToggleLayer(type)}
              onToggleCollapsed={() => toggleCollapsed(type)}
            />
            {!isCollapsed && (
              <div className="layer__body">
                {visible[type].length > 0 ? renderRows(type) : (
                  <p className="layer__empty">
                    {byType[type].length === 0 ? `Sin ${label.toLowerCase()} todavía.` : 'Ninguno coincide con la búsqueda.'}
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
