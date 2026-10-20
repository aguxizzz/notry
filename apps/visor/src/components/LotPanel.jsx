import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconWhatsApp,
  SERVICE_DEFS,
  formatPrice,
  getSubmittedLotsSet,
  markLotAsSubmitted,
  PrecalificacionForm,
  PrecalificacionOverlay,
} from './InfoPanel.jsx';
import { formatPoiDistance } from '../annotations.js';
import { trackEvent } from '../analytics.js';
import './LotPanel.css';

// Panel lateral del visor en escritorio (prototipo design-lab/leyenda, versión
// "Panel"): lista de lotes con buscador y filtros, lugares cercanos, datos del
// proyecto y la ficha del lote, todo en la misma columna. En celular, LotFloat
// arma lo mismo como piezas flotantes sobre la foto.

const STATUSES = ['available', 'reserved', 'sold', 'unavailable'];
const STATUS_LABEL = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido', unavailable: 'No disponible' };
const STATUS_PLURAL = { available: 'Disponibles', reserved: 'Reservados', sold: 'Vendidos', unavailable: 'No disponibles' };
const SERVICE_STATE = { available: 'Listo', in_progress: 'En obra', unavailable: 'Pendiente' };
const VIEW_LABEL = { panorama: '360°', blueprint: 'Plano', satellite: 'Satélite' };

const Ico = ({ d, filled = false }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke={filled ? 'none' : 'currentColor'}
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: d }}
  />
);
const I = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  prev: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  share: '<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  home: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  panorama: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  blueprint: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/>',
  satellite: '<path d="M13 7 9 3 5 7l4 4"/><path d="M17 11l4 4-4 4-4-4"/><path d="m8 12 4 4"/><path d="m10.5 9.5 4 4"/><path d="M3 21c2-1 3-2 4-4"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/>',
};

const lotId = (ann) => ann.uuid ?? ann.id;
const areaOf = (ann) => {
  const n = parseFloat(ann.area_m2);
  return Number.isFinite(n) ? n : null;
};
const fmtArea = (n) => `${Number.isInteger(n) ? n : Math.round(n * 10) / 10} m²`;
const statusOf = (ann) => (STATUSES.includes(ann.status ?? ann.estado) ? (ann.status ?? ann.estado) : 'unavailable');
// Campos que el back todavía no manda: se muestran apenas existan.
const manzanaOf = (ann) => ann.manzana ?? ann.block ?? null;
const medidasOf = (ann) => (ann.frente && ann.fondo ? `${ann.frente} × ${ann.fondo} m` : null);

const roundTo = (n, step) => Math.max(step, Math.round(n / step) * step);

// Rangos de superficie por tercios de lo que hay en el loteo (no fijos: un
// loteo de quintas y uno urbano no comparten cortes).
function sizeBuckets(lots) {
  const areas = lots.map(areaOf).filter((n) => n != null).sort((a, b) => a - b);
  if (areas.length < 6) return null;
  const step = areas[areas.length - 1] > 2000 ? 100 : 10;
  const q1 = roundTo(areas[Math.floor(areas.length / 3)], step);
  const q2 = roundTo(areas[Math.floor((areas.length * 2) / 3)], step);
  if (q2 <= q1) return null;
  return [
    { id: 's', label: `Hasta ${q1} m²`, test: (a) => a <= q1 },
    { id: 'm', label: `${q1}–${q2} m²`, test: (a) => a > q1 && a <= q2 },
    { id: 'l', label: `Más de ${q2} m²`, test: (a) => a > q2 },
  ];
}

function waLink(phone, text) {
  return `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

function shareUrl(ann) {
  const url = new URL(window.location.href);
  url.searchParams.set('lote', ann.slug || lotId(ann));
  return url.toString();
}

function LotNum({ label, status, large = false }) {
  return <span className={`lp-num${large ? ' lp-num--lg' : ''} s-${status}`}>{label}</span>;
}

function LotRow({ ann, label, selected, onSelect, onHover }) {
  const status = statusOf(ann);
  const area = areaOf(ann);
  const manzana = manzanaOf(ann);
  const medidas = medidasOf(ann);
  const sub = [manzana && `Manzana ${manzana}`, medidas].filter(Boolean).join(' · ');
  // Si la fila desaparece con el mouse encima (filtro, ficha nueva) no llega
  // el mouseleave: se apaga el resaltado al desmontar.
  const hoverRef = useRef(false);
  const setHover = (on) => {
    if (!onHover || hoverRef.current === on) return;
    hoverRef.current = on;
    onHover(on ? lotId(ann) : null);
  };
  useEffect(() => () => { if (hoverRef.current) onHover?.(null); }, [onHover]);
  return (
    <button
      type="button"
      className={`lp-lot-row${selected ? ' is-sel' : ''}`}
      onClick={() => onSelect(lotId(ann))}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <LotNum label={label} status={status} />
      <span className="lp-lot-main">
        <b>{ann.tooltip || label}</b>
        {sub && <small>{sub}</small>}
      </span>
      <span className="lp-lot-side">
        {area != null && <b>{fmtArea(area)}</b>}
        <small className={`lp-st s-${status}`}>{STATUS_LABEL[status]}</small>
      </span>
    </button>
  );
}

function Legend({ counts }) {
  return (
    <div className="lp-legend" aria-label="Referencias de estado">
      {STATUSES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} className="lp-lg"><i className={`lp-dot s-${s}`} />{STATUS_PLURAL[s]} <b>{counts[s]}</b></span>
      ))}
    </div>
  );
}

function ServicesList({ services }) {
  const list = (services ?? []).filter((s) => SERVICE_DEFS[s?.tipo]);
  if (!list.length) return null;
  return (
    <ul className="lp-services">
      {list.map((s) => {
        const { label, Icon } = SERVICE_DEFS[s.tipo];
        return (
          <li key={s.tipo} className={`lp-sv lp-sv--${s.estado}`}>
            <span className="lp-sv-ico" aria-hidden="true"><Icon /></span>
            <span className="lp-sv-name">{label}</span>
            <small className="lp-sv-st"><i />{SERVICE_STATE[s.estado] ?? s.estado}</small>
          </li>
        );
      })}
    </ul>
  );
}

function Gallery({ images, title }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const i = Math.min(index, images.length - 1);
  return (
    <div className="lp-gallery">
      <img src={images[i]} alt={`${title} - imagen ${i + 1}`} draggable={false} />
      {images.length > 1 && (
        <div className="lp-gallery-dots">
          {images.map((_, k) => (
            <button key={k} type="button" aria-label={`Ver imagen ${k + 1}`} aria-current={k === i} onClick={() => setIndex(k)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Ficha({ ann, label, labels, visibleLots, allLots, services, whatsappPhone, hideContactForm, origin, loteoId, showcase, showPrice, onSelect, onHover, onBack, backLabel, onClose, setSubmitStatus, submitStatus, showForm, setShowForm }) {
  const [copied, setCopied] = useState(false);
  const [submittedLots, setSubmittedLots] = useState(getSubmittedLotsSet);
  const id = lotId(ann);
  const status = statusOf(ann);
  const area = areaOf(ann);
  const manzana = manzanaOf(ann);
  const medidas = medidasOf(ann);
  const images = Array.isArray(ann.image_urls) ? ann.image_urls : [];
  const title = ann.tooltip || label;
  const submittedKey = `${loteoId}:${id}`;
  const alreadySubmitted = submittedLots.has(submittedKey);

  useEffect(() => { setCopied(false); }, [id]);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(t);
  }, [copied]);

  const i = visibleLots.findIndex((l) => lotId(l) === id);
  const hasNav = i !== -1 && visibleLots.length > 1;
  const prev = hasNav ? visibleLots[(i - 1 + visibleLots.length) % visibleLots.length] : null;
  const next = hasNav ? visibleLots[(i + 1) % visibleLots.length] : null;

  const similar = useMemo(() => {
    if (status === 'available') return [];
    return allLots
      .filter((l) => statusOf(l) === 'available' && lotId(l) !== id)
      .sort((a, b) => Math.abs((areaOf(a) ?? 0) - (area ?? 0)) - Math.abs((areaOf(b) ?? 0) - (area ?? 0)))
      .slice(0, 3);
  }, [allLots, id, status, area]);

  const share = async () => {
    try { await navigator.clipboard.writeText(shareUrl(ann)); } catch (_) { /* sin permiso de portapapeles */ }
    setCopied(true);
  };

  const trackWa = () => trackEvent(loteoId, 'whatsapp_click', { type: 'lote', id });
  const specs = [
    area != null && ['Superficie', fmtArea(area)],
    medidas && ['Medidas', medidas],
    ann.orientation && ['Orientación', ann.orientation],
    ['Precio', showPrice && ann.price ? formatPrice(ann.price) : null],
  ].filter(Boolean);

  return (
    <article className="lp-ficha" aria-labelledby="lp-ficha-title">
      <button type="button" className="lp-ficha-back" onClick={onBack}><Ico d={I.prev} />{backLabel}</button>
      <header className="lp-ficha-head">
        <LotNum label={label} status={status} large />
        <div className="lp-ficha-title">
          {manzana && <small>Manzana {manzana}</small>}
          <h2 id="lp-ficha-title">{title}</h2>
        </div>
        <div className="lp-ficha-tools">
          <button type="button" className="lp-icon-btn" onClick={share} aria-label="Copiar link del lote" title="Copiar link del lote"><Ico d={I.share} /></button>
          {onClose && <button type="button" className="lp-icon-btn" onClick={onClose} aria-label="Cerrar ficha" title="Cerrar"><Ico d={I.close} /></button>}
        </div>
      </header>
      {copied && createPortal(
        <div className="lp-toast" role="status"><Ico d={I.check} />Link del lote copiado</div>,
        document.body,
      )}
      <span className={`lp-st-pill s-${status}`}><i className={`lp-dot s-${status}`} />{STATUS_LABEL[status]}</span>

      <Gallery key={id} images={images} title={title} />

      <dl className="lp-ficha-grid">
        {specs.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd className={v ? undefined : 'lp-muted'}>{v ?? 'A consultar'}</dd></div>
        ))}
      </dl>

      {ann.comments && (
        <div className="lp-comments">
          <span>Detalles del lote</span>
          <p>{ann.comments}</p>
        </div>
      )}

      {status === 'available' ? (
        <div className="lp-ficha-cta">
          {!hideContactForm && (alreadySubmitted ? (
            <p className="lp-note lp-note--ok">Ya enviaste una solicitud para este lote. Te vamos a contactar a la brevedad.</p>
          ) : showForm ? (
            <PrecalificacionForm
              key={id}
              lotDetail={{ title, markerId: id, estado: status }}
              origin={origin}
              loteoId={loteoId}
              onClose={() => { setShowForm(false); setSubmitStatus('idle'); }}
              submitStatus={submitStatus}
              setSubmitStatus={setSubmitStatus}
              onSubmitted={() => {
                markLotAsSubmitted(submittedKey);
                setSubmittedLots((prevSet) => new Set(prevSet).add(submittedKey));
              }}
              showcase={showcase}
            />
          ) : (
            <button type="button" className="lp-btn lp-btn--primary lp-btn--block" onClick={() => setShowForm(true)}>Quiero info de este lote</button>
          ))}
          {whatsappPhone && (
            <a
              className="lp-btn lp-btn--wa lp-btn--block"
              href={waLink(whatsappPhone, `Hola, me interesa el ${title}. ${shareUrl(ann)}`)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackWa}
            >
              <IconWhatsApp />Consultar por WhatsApp
            </a>
          )}
        </div>
      ) : (
        <div className="lp-ficha-alt">
          <p className="lp-alt-note">
            Este lote está <b>{STATUS_LABEL[status].toLowerCase()}</b>.
            {similar.length > 0 && ' Estos son parecidos y están disponibles:'}
          </p>
          {similar.length > 0 && (
            <div className="lp-lot-list lp-lot-list--compact">
              {similar.map((l) => (
                <LotRow key={lotId(l)} ann={l} label={labels.get(lotId(l)) ?? l.tooltip} selected={false} onSelect={onSelect} onHover={onHover} />
              ))}
            </div>
          )}
          {whatsappPhone && (
            <a
              className="lp-btn lp-btn--ghost lp-btn--block"
              href={waLink(whatsappPhone, `Hola, quiero que me avisen si se libera el ${title}. ${shareUrl(ann)}`)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackWa}
            >
              <Ico d={I.bell} />Avisame si se libera
            </a>
          )}
        </div>
      )}

      {(services ?? []).some((s) => SERVICE_DEFS[s?.tipo]) && (
        <section className="lp-ficha-more">
          <h3 className="lp-sub">Servicios del loteo</h3>
          <ServicesList services={services} />
        </section>
      )}

      {hasNav && (
        <nav className="lp-ficha-nav" aria-label="Otros lotes">
          <button type="button" onClick={() => onSelect(lotId(prev))}><Ico d={I.prev} />{prev.tooltip || labels.get(lotId(prev))}</button>
          <span>{i + 1} de {visibleLots.length}</span>
          <button type="button" onClick={() => onSelect(lotId(next))}>{next.tooltip || labels.get(lotId(next))}<Ico d={I.next} /></button>
        </nav>
      )}
    </article>
  );
}

// Lotes y lugares del loteo + buscador y filtros. Lo comparten el panel de
// escritorio y el flotante de celular.
function useLotBrowser({ annotations, labels, loteoId, onFilterChange }) {
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [size, setSize] = useState('all');
  const [query, setQuery] = useState('');

  const lots = useMemo(
    () => annotations
      .filter((a) => a.type === 'polygon')
      .sort((a, b) => String(a.tooltip ?? '').localeCompare(String(b.tooltip ?? ''), 'es', { numeric: true })),
    [annotations]
  );
  const pois = useMemo(
    () => annotations
      .filter((a) => a.type === 'poi' && !a.target_loteo_id)
      .sort((a, b) => (parseFloat(a.distance_value) || Infinity) - (parseFloat(b.distance_value) || Infinity)),
    [annotations]
  );
  const counts = useMemo(() => {
    const c = { available: 0, reserved: 0, sold: 0, unavailable: 0 };
    for (const l of lots) c[statusOf(l)] += 1;
    return c;
  }, [lots]);
  const buckets = useMemo(() => sizeBuckets(lots), [lots]);
  const labelOf = (ann) => labels.get(lotId(ann)) ?? ann.tooltip ?? '';

  // Al cambiar de etapa los filtros de tamaño dejan de tener sentido.
  useEffect(() => { setSize('all'); }, [loteoId]);

  const filtersActive = onlyAvailable || size !== 'all' || query.trim() !== '';
  const visibleLots = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/[^0-9]/g, '');
    const bucket = buckets?.find((b) => b.id === size);
    return lots.filter((l) => {
      if (onlyAvailable && statusOf(l) !== 'available') return false;
      if (bucket) {
        const a = areaOf(l);
        if (a == null || !bucket.test(a)) return false;
      }
      if (!q) return true;
      if (digits) {
        const own = [labels.get(lotId(l)), l.tooltip].map((s) => String(s ?? '').replace(/[^0-9]/g, ''));
        return own.some((n) => n && n.startsWith(digits));
      }
      return `${l.tooltip ?? ''} manzana ${manzanaOf(l) ?? ''}`.toLowerCase().includes(q);
    });
  }, [lots, labels, onlyAvailable, size, query, buckets]);

  useEffect(() => {
    onFilterChange?.(filtersActive ? new Set(visibleLots.map(lotId)) : null);
  }, [filtersActive, visibleLots, onFilterChange]);

  const clearFilters = () => { setOnlyAvailable(false); setSize('all'); setQuery(''); };

  return {
    lots, pois, counts, buckets, labelOf,
    onlyAvailable, setOnlyAvailable, size, setSize, query, setQuery,
    filtersActive, visibleLots, clearFilters,
  };
}

// Estado del formulario de la ficha + Esc para cerrarla.
function useFichaState(selected, onCloseLot) {
  const [submitStatus, setSubmitStatus] = useState('idle');
  const [showForm, setShowForm] = useState(false);
  const selectedId = selected ? lotId(selected) : null;

  useEffect(() => {
    setSubmitStatus('idle');
    setShowForm(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.target.matches?.('input, textarea')) return;
      onCloseLot();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, onCloseLot]);

  return { submitStatus, setSubmitStatus, showForm, setShowForm };
}

function BrandMark({ project, stageName }) {
  return project?.logo_primary
    ? <img className="lp-brand-logo" src={project.logo_primary} alt="" />
    : <span className="lp-brand-mark" aria-hidden="true">{(project?.name ?? stageName ?? 'L').trim().slice(0, 2).toUpperCase()}</span>;
}

function SearchField({ browser, onSelectLot, onFocus, className = '' }) {
  const inputRef = useRef(null);
  const { query, setQuery, visibleLots } = browser;
  return (
    <label className={`lp-search${query ? ' has-value' : ''} ${className}`}>
      <Ico d={I.search} />
      <input
        ref={inputRef}
        type="search"
        inputMode="numeric"
        placeholder="Buscar lote por número"
        aria-label="Buscar lote"
        value={query}
        onFocus={onFocus}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && visibleLots[0]) onSelectLot(lotId(visibleLots[0])); }}
      />
      <button type="button" className="lp-search-clear" aria-label="Borrar búsqueda" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><Ico d={I.close} /></button>
    </label>
  );
}

function LotesPane({ browser, selectedId, onSelectLot, onHoverLot }) {
  const { lots, counts, buckets, labelOf, onlyAvailable, setOnlyAvailable, size, setSize, filtersActive, visibleLots, clearFilters } = browser;
  return (
    <>
      {filtersActive ? (
        <p className="lp-counter"><b>{visibleLots.length}</b> {visibleLots.length === 1 ? 'lote' : 'lotes'} con estos filtros · <button type="button" className="lp-link" onClick={clearFilters}>Limpiar</button></p>
      ) : (
        <p className="lp-counter"><b>{counts.available}</b> disponibles de {lots.length} lotes</p>
      )}
      <Legend counts={counts} />
      <div className="lp-chips">
        <button type="button" className="lp-chip lp-chip--avail" aria-pressed={onlyAvailable} onClick={() => setOnlyAvailable((v) => !v)}><i className="lp-dot s-available" />Solo disponibles</button>
        {buckets && [{ id: 'all', label: 'Todas' }, ...buckets].map((b) => (
          <button key={b.id} type="button" className="lp-chip" aria-pressed={size === b.id} onClick={() => setSize(b.id)}>{b.label}</button>
        ))}
      </div>
      {visibleLots.length ? (
        <div className="lp-lot-list">
          {visibleLots.map((l) => (
            <LotRow key={lotId(l)} ann={l} label={labelOf(l)} selected={lotId(l) === selectedId} onSelect={onSelectLot} onHover={onHoverLot} />
          ))}
        </div>
      ) : (
        <div className="lp-empty">
          <p>Ningún lote coincide.</p>
          <button type="button" className="lp-btn lp-btn--ghost" onClick={clearFilters}>Limpiar filtros</button>
        </div>
      )}
    </>
  );
}

function CercaPane({ pois, onPoiSelect }) {
  return (
    <>
      <p className="lp-hint">Tocá un lugar para verlo en la foto.</p>
      <div className="lp-poi-list">
        {pois.map((p) => {
          const dist = formatPoiDistance(p.distance_value, p.distance_unit);
          return (
            <button key={lotId(p)} type="button" className="lp-poi-row" onClick={() => onPoiSelect(lotId(p))}>
              {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : <span className="lp-poi-ph"><Ico d={I.pin} /></span>}
              <span className="lp-poi-main"><b>{p.tooltip}</b>{p.category && <small>{p.category}</small>}</span>
              {dist && <span className="lp-poi-dist">{dist}{p.distance_unit === 'min' && <small>en auto</small>}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function LotPanel({
  project,
  stageName,
  stages,
  currentStageId,
  stageBusy,
  onSelectStage,
  viewModes,
  viewMode,
  onSelectViewMode,
  annotations,
  labels,
  services,
  selectedId,
  onSelectLot,
  onHoverLot,
  onCloseLot,
  onPoiSelect,
  onFilterChange,
  collapsed,
  onToggleCollapsed,
  whatsappPhone,
  hideContactForm,
  origin,
  loteoId,
  showcase = false,
}) {
  const [tab, setTab] = useState('lotes');
  const browser = useLotBrowser({ annotations, labels, loteoId, onFilterChange });
  const { lots, pois, counts, labelOf, visibleLots } = browser;
  const selected = selectedId ? lots.find((l) => lotId(l) === selectedId) ?? null : null;
  const { submitStatus, setSubmitStatus, showForm, setShowForm } = useFichaState(selected, onCloseLot);

  return (
    <>
      <aside id="lot-panel" className="lp" data-collapsed={collapsed ? '1' : '0'} data-selected={selected ? '1' : '0'} aria-label="Panel del loteo">
        <header className="lp-head">
          <div className="lp-brand">
            <BrandMark project={project} stageName={stageName} />
            <span className="lp-brand-txt">
              <b>{project?.name ?? stageName ?? 'Loteo'}</b>
              {project?.name && stageName && <small>{stageName}</small>}
            </span>
          </div>
          <button type="button" className="lp-icon-btn" onClick={onToggleCollapsed} aria-label="Ocultar panel" title="Ocultar panel"><Ico d={I.prev} /></button>
        </header>

        <div className="lp-nav">
          {(stages.length > 1 || viewModes.length > 1) && (
            <div className="lp-controls">
              {stages.length > 1 && (
                <div className="lp-seg" role="group" aria-label="Etapa">
                  {stages.map((s) => (
                    <button key={s.id} type="button" disabled={stageBusy} aria-pressed={s.id === currentStageId} onClick={() => onSelectStage(s.id)}>{s.name}</button>
                  ))}
                </div>
              )}
              {viewModes.length > 1 && (
                <div className="lp-seg" role="group" aria-label="Modo de vista">
                  {viewModes.map((m) => (
                    <button key={m} type="button" aria-pressed={m === viewMode} onClick={() => onSelectViewMode(m)}>{VIEW_LABEL[m]}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <nav className="lp-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'lotes'} onClick={() => setTab('lotes')}>Lotes <span className="lp-tab-n">{visibleLots.length}</span></button>
            {pois.length > 0 && (
              <button type="button" role="tab" aria-selected={tab === 'cerca'} onClick={() => setTab('cerca')}>Cerca <span className="lp-tab-n">{pois.length}</span></button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'proyecto'} onClick={() => setTab('proyecto')}>Proyecto</button>
          </nav>
          {tab === 'lotes' && <SearchField browser={browser} onSelectLot={onSelectLot} />}
        </div>

        <div className="lp-body">
          {tab === 'lotes' && (
            <section className="lp-pane">
              <LotesPane browser={browser} selectedId={selectedId} onSelectLot={onSelectLot} onHoverLot={onHoverLot} />
            </section>
          )}

          {tab === 'cerca' && (
            <section className="lp-pane">
              <CercaPane pois={pois} onPoiSelect={onPoiSelect} />
            </section>
          )}

          {tab === 'proyecto' && (
            <section className="lp-pane">
              {(services ?? []).some((s) => SERVICE_DEFS[s?.tipo]) && (
                <>
                  <h3 className="lp-sub">Servicios</h3>
                  <ServicesList services={services} />
                </>
              )}
              <h3 className="lp-sub">Referencias</h3>
              <Legend counts={counts} />
              {viewModes.includes('satellite') && (
                <>
                  <h3 className="lp-sub">Ubicación</h3>
                  <button type="button" className="lp-btn lp-btn--ghost lp-btn--block" onClick={() => onSelectViewMode('satellite')}><Ico d={I.pin} />Ver en vista satelital</button>
                </>
              )}
            </section>
          )}

          <section className="lp-ficha-wrap" aria-hidden={!selected}>
            {selected && (
              <Ficha
                ann={selected}
                label={labelOf(selected)}
                labels={labels}
                visibleLots={visibleLots}
                allLots={lots}
                services={services}
                whatsappPhone={whatsappPhone}
                hideContactForm={hideContactForm}
                origin={origin}
                loteoId={loteoId}
                showcase={showcase}
                showPrice={Boolean(project?.show_price)}
                onSelect={onSelectLot}
                onHover={onHoverLot}
                onBack={onCloseLot}
                backLabel={tab === 'cerca' ? 'Lugares cercanos' : 'Todos los lotes'}
                submitStatus={submitStatus}
                setSubmitStatus={setSubmitStatus}
                showForm={showForm}
                setShowForm={setShowForm}
              />
            )}
          </section>
          <PrecalificacionOverlay
            submitStatus={submitStatus}
            setSubmitStatus={setSubmitStatus}
            onClose={() => { setSubmitStatus('idle'); setShowForm(false); }}
          />
        </div>

        {whatsappPhone && !selected && (
          <footer className="lp-foot">
            <a
              className="lp-btn lp-btn--wa lp-btn--block"
              href={waLink(whatsappPhone, `Hola, quiero más información sobre ${project?.name ?? stageName ?? 'el loteo'}.`)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent(loteoId, 'whatsapp_click', { type: 'project' })}
            >
              <IconWhatsApp />Hablar con un asesor
            </a>
          </footer>
        )}
      </aside>

      <button type="button" className="lp-reopen" data-collapsed={collapsed ? '1' : '0'} onClick={onToggleCollapsed}>
        <Ico d={I.next} /><b>{counts.available}</b> disponibles
      </button>
    </>
  );
}

// Alto de la ficha en celular (fracción de la pantalla). Lo usa también el
// visor para encuadrar el lote en lo que queda libre arriba.
export const FLOAT_SHEET_RATIO = 0.56;

// Celular (prototipo design-lab/leyenda, versión 2 "Flotante", en claro):
// marca y etapas arriba, buscador abajo con el contador que despliega la lista,
// botón de WhatsApp y la ficha del lote como hoja inferior.
export function LotFloat({
  project,
  stageName,
  stages,
  currentStageId,
  stageBusy,
  onSelectStage,
  viewModes,
  viewMode,
  onSelectViewMode,
  annotations,
  labels,
  services,
  selectedId,
  onSelectLot,
  onCloseLot,
  onPoiSelect,
  onFilterChange,
  whatsappPhone,
  hideContactForm,
  origin,
  loteoId,
  showcase = false,
  compass = null,
}) {
  const [tab, setTab] = useState('lotes');
  const [listOpen, setListOpen] = useState(false);
  const browser = useLotBrowser({ annotations, labels, loteoId, onFilterChange });
  const { lots, pois, counts, labelOf, visibleLots, filtersActive } = browser;
  const selected = selectedId ? lots.find((l) => lotId(l) === selectedId) ?? null : null;
  const { submitStatus, setSubmitStatus, showForm, setShowForm } = useFichaState(selected, onCloseLot);
  const sheetRef = useRef(null);

  // Abrir un lote cierra la lista; la ficha arranca desde arriba.
  useEffect(() => {
    if (!selectedId) return;
    setListOpen(false);
    sheetRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  useEffect(() => {
    if (!listOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setListOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listOpen]);

  const pickLot = (id) => { setListOpen(false); onSelectLot(id); };
  const pickPoi = (id) => { setListOpen(false); onPoiSelect(id); };
  const backToList = () => { onCloseLot(); setListOpen(true); };
  const shown = filtersActive ? visibleLots.length : counts.available;

  return (
    <div id="lot-float" className="lf" data-list={listOpen ? '1' : '0'} data-selected={selected ? '1' : '0'} style={{ '--lf-sheet': `${FLOAT_SHEET_RATIO * 100}dvh` }}>
      <header className="lf-top lf-glass">
        <div className="lf-top-row">
          <div className="lp-brand">
            <BrandMark project={project} stageName={stageName} />
            <span className="lp-brand-txt">
              <b>{project?.name ?? stageName ?? 'Loteo'}</b>
              {project?.name && stageName && stages.length <= 1 && <small>{stageName}</small>}
            </span>
          </div>
          {stages.length > 1 && (
            <div className="lp-seg lf-stages" role="group" aria-label="Etapa">
              {stages.map((s) => (
                <button key={s.id} type="button" disabled={stageBusy} aria-pressed={s.id === currentStageId} onClick={() => onSelectStage(s.id)}>{s.name}</button>
              ))}
            </div>
          )}
        </div>
        {viewModes.length > 1 && (
          <div className="lf-modes" role="group" aria-label="Modo de vista">
            {viewModes.map((m) => (
              <button key={m} type="button" aria-pressed={m === viewMode} onClick={() => onSelectViewMode(m)}>
                <Ico d={I[m]} />{VIEW_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        {compass}
      </header>

      {listOpen && <button type="button" className="lf-scrim" aria-label="Cerrar lista" tabIndex={-1} onClick={() => setListOpen(false)} />}

      <div className="lf-dock">
        <section id="lf-results" className="lf-results lf-glass" aria-label="Lotes y lugares" aria-hidden={!listOpen}>
          <nav className="lp-tabs lf-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'lotes'} onClick={() => setTab('lotes')}>Lotes <span className="lp-tab-n">{visibleLots.length}</span></button>
            {pois.length > 0 && (
              <button type="button" role="tab" aria-selected={tab === 'cerca'} onClick={() => setTab('cerca')}>Cerca <span className="lp-tab-n">{pois.length}</span></button>
            )}
            <button type="button" className="lp-icon-btn lf-close" onClick={() => setListOpen(false)} aria-label="Cerrar lista"><Ico d={I.close} /></button>
          </nav>
          <div className="lf-pane">
            {tab === 'cerca'
              ? <CercaPane pois={pois} onPoiSelect={pickPoi} />
              : <LotesPane browser={browser} selectedId={selectedId} onSelectLot={pickLot} />}
          </div>
        </section>

        <div className="lf-bar lf-glass">
          <SearchField browser={browser} onSelectLot={pickLot} onFocus={() => { setTab('lotes'); setListOpen(true); }} className="lf-search" />
          <button
            type="button"
            className="lf-count"
            aria-expanded={listOpen}
            aria-controls="lf-results"
            aria-label={listOpen ? 'Cerrar lista de lotes' : `Ver lista de lotes (${shown} ${filtersActive ? 'resultados' : 'disponibles'})`}
            onClick={() => setListOpen((v) => !v)}
          >
            <i className="lp-dot s-available" /><b>{shown}</b><Ico d={I.up} />
          </button>
        </div>
      </div>

      {whatsappPhone && (
        <a
          className="lf-fab"
          href={waLink(whatsappPhone, `Hola, quiero más información sobre ${project?.name ?? stageName ?? 'el loteo'}.`)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Consultar por WhatsApp"
          onClick={() => trackEvent(loteoId, 'whatsapp_click', { type: 'project' })}
        >
          <IconWhatsApp />
        </a>
      )}

      <section ref={sheetRef} className="lf-sheet lf-glass" data-form={showForm ? '1' : '0'} aria-hidden={!selected}>
        <span className="lf-grab" aria-hidden="true" />
        {selected && (
          <Ficha
            ann={selected}
            label={labelOf(selected)}
            labels={labels}
            visibleLots={visibleLots}
            allLots={lots}
            services={services}
            whatsappPhone={whatsappPhone}
            hideContactForm={hideContactForm}
            origin={origin}
            loteoId={loteoId}
            showcase={showcase}
            showPrice={Boolean(project?.show_price)}
            onSelect={onSelectLot}
            onBack={backToList}
            backLabel="Ver lotes"
            onClose={onCloseLot}
            submitStatus={submitStatus}
            setSubmitStatus={setSubmitStatus}
            showForm={showForm}
            setShowForm={setShowForm}
          />
        )}
        <PrecalificacionOverlay
          submitStatus={submitStatus}
          setSubmitStatus={setSubmitStatus}
          onClose={() => { setSubmitStatus('idle'); setShowForm(false); }}
        />
      </section>
    </div>
  );
}

// Brújula horizontal del flotante (celular): una cinta de rumbos que corre
// debajo de los modos de vista; la marca dorada del centro es hacia dónde se
// mira. Tocarla gira la cámara hacia el norte. Los rumbos se repiten de -180°
// a 540° para que la cinta siempre llene el ancho.
const TAPE_PX_PER_DEG = 2.4;
const TAPE_LABELS = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
const TAPE_MARKS = Array.from({ length: 49 }, (_, i) => i * 15 - 180);

export function CompassTape({ yaw, northOffset, onNorth }) {
  if (northOffset === null || northOffset === undefined) return null;
  const heading = (((yaw - northOffset) * 180) / Math.PI % 360 + 360) % 360;
  return (
    <button type="button" className="lf-tape" onClick={onNorth} aria-label={`Rumbo ${Math.round(heading)}°. Mirar hacia el norte`}>
      <span className="lf-tape-track" aria-hidden="true" style={{ transform: `translateX(${-(heading + 180) * TAPE_PX_PER_DEG}px)` }}>
        {TAPE_MARKS.map((deg) => {
          const label = TAPE_LABELS[(deg + 360) % 360];
          return (
            <span
              key={deg}
              className={`lf-tape-mark${label ? ' is-label' : ''}${label === 'N' ? ' is-north' : ''}`}
              style={{ left: `${(deg + 180) * TAPE_PX_PER_DEG}px` }}
            >
              {label ?? ''}
            </span>
          );
        })}
      </span>
    </button>
  );
}

export function MapControls({ onZoomIn, onZoomOut, onReset, hidden = false }) {
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  return (
    <div className={`lp-map-ctrl${hidden ? ' is-hidden' : ''}`} role="group" aria-label="Controles de la vista">
      <button type="button" onClick={onZoomIn} aria-label="Acercar" title="Acercar"><Ico d={I.plus} /></button>
      <button type="button" onClick={onZoomOut} aria-label="Alejar" title="Alejar"><Ico d={I.minus} /></button>
      <button type="button" onClick={onReset} aria-label="Volver a la vista inicial" title="Volver a la vista inicial"><Ico d={I.home} /></button>
      <button type="button" onClick={toggleFullscreen} aria-label="Pantalla completa" title="Pantalla completa"><Ico d={I.expand} /></button>
    </div>
  );
}
