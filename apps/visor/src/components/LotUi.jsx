import { useEffect, useRef } from 'react';
import { SERVICE_DEFS } from '../serviceDefs.js';
import { formatPoiDistance } from '../annotations.js';
import { annId, lotStatus, lotArea, fmtArea, lotManzana, lotMedidas, STATUSES } from '../lotData.js';
import { trackEvent } from '../analytics.js';
import { STATUS_LABEL } from '../lotFormat.js';
import { I } from '../icons/uiIcons.js';
import './LotPanel.css';

// Piezas que comparten el panel de escritorio (LotPanel), el flotante de
// celular (LotFloat) y la ficha del lote (LotFicha).

const STATUS_PLURAL = { available: 'Disponibles', reserved: 'Reservados', sold: 'Vendidos', unavailable: 'No disponibles' };
const SERVICE_STATE = { available: 'Listo', in_progress: 'En obra', unavailable: 'Pendiente' };
const VIEW_LABEL = { panorama: '360°', blueprint: 'Plano', satellite: 'Satélite' };

export const IconWhatsApp = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/>
  </svg>
);

export const Ico = ({ d, filled = false }) => (
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

function waLink(phone, text) {
  return `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

// Link a WhatsApp que registra el click. `track` es el detalle del evento.
export function WhatsAppLink({ phone, text, loteoId, track, className, children, ...rest }) {
  return (
    <a
      className={className}
      href={waLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent(loteoId, 'whatsapp_click', track)}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Brand({ project, stageName, showStage = true }) {
  return (
    <div className="lp-brand">
      {project?.logo_primary
        ? <img className="lp-brand-logo" src={project.logo_primary} alt="" />
        : <span className="lp-brand-mark" aria-hidden="true">{(project?.name ?? stageName ?? 'L').trim().slice(0, 2).toUpperCase()}</span>}
      <span className="lp-brand-txt">
        <b>{project?.name ?? stageName ?? 'Loteo'}</b>
        {project?.name && stageName && showStage && <small>{stageName}</small>}
      </span>
    </div>
  );
}

export function StageSwitch({ stages, currentStageId, busy, onSelect, className = '' }) {
  return (
    <div className={`lp-seg ${className}`} role="group" aria-label="Etapa">
      {stages.map((s) => (
        <button key={s.id} type="button" disabled={busy} aria-pressed={s.id === currentStageId} onClick={() => onSelect(s.id)}>{s.name}</button>
      ))}
    </div>
  );
}

export function ViewModeSwitch({ modes, value, onSelect, withIcons = false, className = 'lp-seg' }) {
  return (
    <div className={className} role="group" aria-label="Modo de vista">
      {modes.map((m) => (
        <button key={m} type="button" aria-pressed={m === value} onClick={() => onSelect(m)}>
          {withIcons && <Ico d={I[m]} />}{VIEW_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

// Pestañas Lotes / Cerca (si hay lugares). `children` va al final (Proyecto en
// escritorio, cerrar en celular).
export function LotTabs({ tab, onTab, lotCount, poiCount, className = '', children }) {
  return (
    <nav className={`lp-tabs ${className}`} role="tablist">
      <button type="button" role="tab" aria-selected={tab === 'lotes'} onClick={() => onTab('lotes')}>Lotes <span className="lp-tab-n">{lotCount}</span></button>
      {poiCount > 0 && (
        <button type="button" role="tab" aria-selected={tab === 'cerca'} onClick={() => onTab('cerca')}>Cerca <span className="lp-tab-n">{poiCount}</span></button>
      )}
      {children}
    </nav>
  );
}

export function LotNum({ label, status, large = false }) {
  return <span className={`lp-num${large ? ' lp-num--lg' : ''} s-${status}`}>{label}</span>;
}

export function LotRow({ ann, label, selected, onSelect, onHover }) {
  const status = lotStatus(ann);
  const area = lotArea(ann);
  const manzana = lotManzana(ann);
  const medidas = lotMedidas(ann);
  const sub = [manzana && `Manzana ${manzana}`, medidas].filter(Boolean).join(' · ');
  // Si la fila desaparece con el mouse encima (filtro, ficha nueva) no llega
  // el mouseleave: se apaga el resaltado al desmontar.
  const hoverRef = useRef(false);
  const setHover = (on) => {
    if (!onHover || hoverRef.current === on) return;
    hoverRef.current = on;
    onHover(on ? annId(ann) : null);
  };
  useEffect(() => () => { if (hoverRef.current) onHover?.(null); }, [onHover]);
  return (
    <button
      type="button"
      className={`lp-lot-row${selected ? ' is-sel' : ''}`}
      onClick={() => onSelect(annId(ann))}
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

export function Legend({ counts }) {
  return (
    <div className="lp-legend" aria-label="Referencias de estado">
      {STATUSES.filter((s) => counts[s] > 0).map((s) => (
        <span key={s} className="lp-lg"><i className={`lp-dot s-${s}`} />{STATUS_PLURAL[s]} <b>{counts[s]}</b></span>
      ))}
    </div>
  );
}

export function ServicesList({ services }) {
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

export function SearchField({ browser, onSelectLot, onFocus, className = '' }) {
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
        onKeyDown={(e) => { if (e.key === 'Enter' && visibleLots[0]) onSelectLot(annId(visibleLots[0])); }}
      />
      <button type="button" className="lp-search-clear" aria-label="Borrar búsqueda" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><Ico d={I.close} /></button>
    </label>
  );
}

export function LotesPane({ browser, selectedId, onSelectLot, onHoverLot }) {
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
            <LotRow key={annId(l)} ann={l} label={labelOf(l)} selected={annId(l) === selectedId} onSelect={onSelectLot} onHover={onHoverLot} />
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

export function CercaPane({ pois, onPoiSelect }) {
  return (
    <>
      <p className="lp-hint">Tocá un lugar para verlo en la foto.</p>
      <div className="lp-poi-list">
        {pois.map((p) => {
          const dist = formatPoiDistance(p.distance_value, p.distance_unit);
          return (
            <button key={annId(p)} type="button" className="lp-poi-row" onClick={() => onPoiSelect(annId(p))}>
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
