import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Pencil,
  Plus,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  Button,
  CommentTooltip,
  DataToolbar,
  ErrorBoundary,
  PageHeader,
  PageLayout,
  Panel,
  RowActionsSheet,
  SearchField,
  SectionHeader,
  SortHeader,
  StageSummary,
  TablePager,
} from '../../ui/components';
import NeglectedProspectsPanel from '../NeglectedProspectsPanel';
import ActivityFeed from '../ActivityFeed';
import ShellLayout from '../ShellLayout';
import { useTableSort } from '../../hooks/useTableSort';
import { editableRowProps, useRowActionsMode } from '../../hooks/useRowActionsMode';
import { CATEGORY_DISPLAY, ORIGIN_DISPLAY, formatDate } from '../../constants';
import { daysSinceContact, formatDaysAgo, NEGLECTED_THRESHOLD_DAYS } from '../../utils/prospects';
import { ACTIVITY_SCOPES, getActivityTypesForScope } from '../../constants/activityTypes';
import '../../ui/components/ActionBtn.css';
import './ClientesView.css';

const CLIENT_ACTIVITY_TYPES = new Set(getActivityTypesForScope(ACTIVITY_SCOPES.CLIENTS));

const PROSPECTS_PER_PAGE = 10;

// Orden de categorías por etapa del embudo (para ordenar la columna Categoría).
const CATEGORY_RANK = { primer_contacto: 0, seguimiento: 1, negociacion: 2, vendido: 3 };
const ORIGIN_STAGE_ORDER = ['primer_contacto', 'seguimiento', 'negociacion', 'vendido'];

const PROSPECT_SORT_ACCESSORS = {
  name: p => p.name,
  email: p => p.email || null,
  phone: p => p.phone || null,
  category: p => CATEGORY_RANK[p.category] ?? 99,
  origin: p => ORIGIN_DISPLAY[p.origin] || null,
  last_contact: p => (p.last_contact ? new Date(p.last_contact).getTime() : null),
};

// Casillas del resumen (StageSummary), en orden de embudo. `key` es la
// categoría del prospecto que filtran.
const CATEGORY_SEGMENTS = [
  { key: 'primer_contacto', color: 'var(--color-cat-contacto)', label: 'Primer contacto' },
  { key: 'seguimiento', color: 'var(--color-cat-seguimiento)', label: 'En seguimiento' },
  { key: 'negociacion', color: 'var(--color-cat-negociacion)', label: 'En negociación' },
  { key: 'vendido', color: 'var(--color-cat-vendido)', label: 'Vendidos' },
];

// Filtros de "Para atender". Mismo criterio que computeClientStats: los
// vendidos nunca cuentan como pendientes de seguimiento.
const FOLLOWUP_FILTERS = {
  vencido: {
    label: 'Seguimiento vencido',
    match: p => {
      const days = daysSinceContact(p.last_contact);
      return p.category !== 'vendido' && days != null && days >= NEGLECTED_THRESHOLD_DAYS;
    },
  },
  sin_contactar: {
    label: 'Sin contactar',
    match: p => p.category !== 'vendido' && daysSinceContact(p.last_contact) == null,
  },
};

function computeClientStats(prospects = []) {
  // Vencidos y sin contactar sólo cuentan prospectos no vendidos: un vendido
  // no necesita seguimiento (mismo criterio que el "Para hoy" de Inicio).
  let sinContactar = 0;
  let vencido = 0;
  const byCategory = Object.fromEntries(ORIGIN_STAGE_ORDER.map(category => [category, 0]));
  const byOrigin = new Map();

  for (const p of prospects) {
    if (p.category in byCategory) byCategory[p.category]++;
    if (p.category !== 'vendido') {
      const days = daysSinceContact(p.last_contact);
      if (days == null) sinContactar++;
      else if (days >= NEGLECTED_THRESHOLD_DAYS) vencido++;
    }
    if (p.origin) {
      const originStats = byOrigin.get(p.origin) ?? {
        n: 0,
        stages: Object.fromEntries(ORIGIN_STAGE_ORDER.map(category => [category, 0])),
      };
      originStats.n++;
      if (ORIGIN_STAGE_ORDER.includes(p.category)) originStats.stages[p.category]++;
      byOrigin.set(p.origin, originStats);
    }
  }

  const total = prospects.length;
  // Todos los orígenes conocidos, incluidos los que no tienen prospectos (n=0).
  const origins = Object.keys(ORIGIN_DISPLAY)
    .map(origin => {
      const originStats = byOrigin.get(origin) ?? {
        n: 0,
        stages: Object.fromEntries(ORIGIN_STAGE_ORDER.map(category => [category, 0])),
      };
      const { n, stages } = originStats;
      return {
        origin,
        label: ORIGIN_DISPLAY[origin],
        n,
        pct: total > 0 ? Math.round((n / total) * 100) : 0,
        stages,
      };
    })
    .sort((a, b) => b.n - a.n);

  return {
    total,
    sinContactar,
    vencido,
    byCategory,
    origins,
    maxOriginCount: Math.max(...origins.map(({ n }) => n), 0),
  };
}

function OriginDistribution({ origins, total, maxOriginCount }) {
  const midpoint = Math.ceil(maxOriginCount / 2);

  return (
    <div className="cli-origin-chart-wrap">
      <div className="cli-origin-axis" aria-hidden="true">
        <span>Origen</span>
        <span className="cli-origin-axis-scale"><i>0</i><i>{midpoint}</i><i>{maxOriginCount}</i></span>
        <span>Total</span>
      </div>
      <div className="cli-origin-chart" role="img" aria-label={`Distribución de ${total} prospectos por origen y etapa`}>
        {origins.map(({ origin, label, n, pct, stages }) => (
          <div className="cli-origin-row" key={origin}>
            <span className="cli-origin-label" title={label}>{label}</span>
            <div className="cli-origin-track">
              <div className={`cli-origin-stack ${n === 0 ? 'is-empty' : ''}`} style={{ '--volume': `${(n / maxOriginCount) * 100}%` }}>
                {ORIGIN_STAGE_ORDER.map(category => {
                  const count = stages[category];
                  if (!count) return null;
                  return (
                    <span
                      key={category}
                      className={`cli-origin-segment cli-origin-segment--${category}`}
                      style={{ '--share': count / n }}
                      title={`${CATEGORY_DISPLAY[category]} · ${count}`}
                    />
                  );
                })}
              </div>
            </div>
            <span className="cli-origin-value"><b>{n}</b><small>{pct}%</small></span>
          </div>
        ))}
      </div>
      <div className="cli-origin-legend">
        {ORIGIN_STAGE_ORDER.map(category => <span key={category}><i className={`cli-origin-segment--${category}`} />{CATEGORY_DISPLAY[category]}</span>)}
        <span className="cli-origin-legend-note">Cada color muestra la etapa actual</span>
      </div>
    </div>
  );
}

// Encabezado de la tabla en una sola fila: título con cantidad y filtros
// activos a la izquierda, búsqueda a la derecha. Los filtros se eligen en el
// resumen (StageSummary); acá solo se ven y se quitan.
function ProspectosFilters({
  count,
  total,
  search,
  onSearchChange,
  activeFilters,
}) {
  return (
    <DataToolbar className="inventory-controls cli-toolbar">
      <div className="cli-toolbar-head">
        <h2 className="cli-table-title">
          Contactos
          {/* "N de M" en cuanto la tabla muestra menos que el total (búsqueda o filtros). */}
          <span className="cli-table-count">
            {count !== total ? `${count} de ${total}` : total}
          </span>
        </h2>
        {activeFilters.map(f => (
          <span key={f.key} className="cli-filter-chip">
            {f.label}
            <button type="button" onClick={f.onClear} aria-label={`Quitar filtro ${f.label}`}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="cli-toolbar-tools">
        <SearchField
          id="prospects-search"
          ariaLabel="Buscar prospectos"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
        />
      </div>
    </DataToolbar>
  );
}

function ProspectosTable({ prospectos, filteredProspectos, onEditProspect, onDeleteProspect, onUpdateContact, highlightedProspectId }) {
  const [expandedProspectId, setExpandedProspectId] = useState(null);
  const [sheetProspect, setSheetProspect] = useState(null);
  const mode = useRowActionsMode();
  const baseData = filteredProspectos ?? prospectos;
  const { sort, handleSort, sorted, pageData, fillerRows, page, setPage, totalPages, total } =
    useTableSort(baseData, PROSPECT_SORT_ACCESSORS, { perPage: PROSPECTS_PER_PAGE });

  // Escritorio: la fila entera abre la edición del prospecto.
  const handleRowClick = (e, p) => {
    if (e.target.closest('button, a')) return;
    if (mode === 'inline') {
      onEditProspect(p);
      return;
    }
    if (mode === 'drawer') {
      setSheetProspect(p);
      return;
    }
    setExpandedProspectId(prev => (prev === p.id ? null : p.id));
  };

  // Al resaltar un prospecto (ej. navegando desde un lote), saltar primero a la
  // página que lo contiene y recién ahí hacer scroll + highlight de la fila.
  useEffect(() => {
    if (!highlightedProspectId) return;
    const idx = sorted.findIndex(p => p.id === highlightedProspectId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / PROSPECTS_PER_PAGE) + 1;
    if (targetPage !== page) {
      setPage(targetPage);
      return;
    }
    const el = document.getElementById(`prospect-row-${highlightedProspectId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('row-highlight');
    const t = setTimeout(() => el.classList.remove('row-highlight'), 1800);
    return () => clearTimeout(t);
  }, [highlightedProspectId, sorted, page, setPage]);

  return (
    <div className="inventory-table-wrapper">
      <table className="inventory-table">
        <caption className="sr-only">Lista de prospectos</caption>
        <thead>
          <tr>
            <SortHeader label="Nombre" sortKey="name" sort={sort} onSort={handleSort} />
            <SortHeader label="Email" sortKey="email" sort={sort} onSort={handleSort} className="th-secondary" />
            <SortHeader label="Teléfono" sortKey="phone" sort={sort} onSort={handleSort} className="th-secondary" />
            <SortHeader label="Categoría" sortKey="category" sort={sort} onSort={handleSort} />
            <SortHeader label="Origen" sortKey="origin" sort={sort} onSort={handleSort} className="th-secondary" />
            <SortHeader label="Último Contacto" sortKey="last_contact" sort={sort} onSort={handleSort} />
            <th scope="col" className="th-actions"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {total === 0 ? (
            <tr>
              <td colSpan={7} className="td-empty-row">No se encontraron prospectos.</td>
            </tr>
          ) : (
            <>
            {pageData.map(p => {
              const categoryBadge = (
                <span className={`badge category-${p.category}`}>
                  {CATEGORY_DISPLAY[p.category] ?? p.category?.replace(/_/g, ' ')}
                </span>
              );
              // Mismo criterio que el resumen: vendidos nunca cuentan como
              // vencidos ni "sin contactar", quedan neutros.
              const days = daysSinceContact(p.last_contact);
              const sold = p.category === 'vendido';
              const contactState = sold ? 'ok'
                : days == null ? 'never'
                : days >= NEGLECTED_THRESHOLD_DAYS ? 'overdue'
                : 'ok';
              const hasNotes = !!p.observation_notes?.trim();
              const dateTitle = [
                p.last_contact && formatDate(p.last_contact),
                hasNotes && 'clic para ver observaciones',
              ].filter(Boolean).join(' · ') || undefined;
              // La fecha misma abre las observaciones; "Registrar" sólo en
              // escritorio (en acordeón/sheet está como acción con label).
              const lastContactNode = (
                <div className="last-contact-cell">
                  <CommentTooltip content={p.observation_notes} label="Observaciones" entityName={p.name}>
                    <span className={`last-contact-date is-${contactState}`} title={dateTitle}>
                      {days == null ? (sold ? '—' : 'Sin contactar') : formatDaysAgo(days)}
                    </span>
                  </CommentTooltip>
                  {mode === 'inline' && (
                    <button
                      type="button"
                      className="last-contact-register"
                      onClick={() => onUpdateContact(p.id, p.name)}
                      aria-label={`Registrar contacto con ${p.name}`}
                    >
                      <RotateCw size={12} strokeWidth={2} aria-hidden="true" /> Registrar
                    </button>
                  )}
                </div>
              );

              // <768px ("drawer"): la fila pasa a ser una card apilada — ver
              // nota en table.css sobre `.td-card`/`.row-card`. Todos los datos
              // quedan visibles acá, el sheet sólo trae las acciones.
              if (mode === 'drawer') {
                return (
                  <tr
                    key={p.id}
                    id={`prospect-row-${p.id}`}
                    className="row-clickable"
                    onClick={(e) => handleRowClick(e, p)}
                  >
                    <td colSpan={7} className="td-card">
                      <div className="row-card">
                        <div className="row-card-head">
                          <span className="row-card-title">{p.name}</span>
                          {categoryBadge}
                        </div>
                        <div className="row-detail-list">
                          <div className="row-detail-item">
                            <span className="row-detail-label">Email</span>
                            <span className="row-detail-value">{p.email || '—'}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Teléfono</span>
                            <span className="row-detail-value">{p.phone || '—'}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Origen</span>
                            <span className="row-detail-value">{ORIGIN_DISPLAY[p.origin] ?? '—'}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Último contacto</span>
                            <span className="row-detail-value">{lastContactNode}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <Fragment key={p.id}>
                <tr
                  id={`prospect-row-${p.id}`}
                  className="row-clickable"
                  onClick={(e) => handleRowClick(e, p)}
                  {...editableRowProps(mode, p.name, () => onEditProspect(p))}
                >
                  <td className="td-name">{p.name}</td>
                  <td className="td-muted td-secondary">{p.email || '—'}</td>
                  <td className="td-muted td-secondary">{p.phone || '—'}</td>
                  <td className="td-nowrap">{categoryBadge}</td>
                  <td className="td-muted td-secondary td-nowrap">
                    {ORIGIN_DISPLAY[p.origin] ?? '—'}
                  </td>
                  <td className="td-muted">{lastContactNode}</td>
                  <td className="td-actions">
                    <button
                      className="action-btn delete"
                      onClick={() => onDeleteProspect(p)}
                      title="Eliminar"
                      aria-label={`Eliminar ${p.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
                {mode === 'accordion' && (
                  <tr className="row-actions-expand">
                    <td colSpan={7}>
                      <div className="row-actions-drawer" data-open={expandedProspectId === p.id}>
                        <div className="row-actions-drawer-inner">
                          <div className="row-actions-drawer-content">
                            <div className="row-detail-list">
                              <div className="row-detail-item">
                                <span className="row-detail-label">Email</span>
                                <span className="row-detail-value">{p.email || '—'}</span>
                              </div>
                              <div className="row-detail-item">
                                <span className="row-detail-label">Teléfono</span>
                                <span className="row-detail-value">{p.phone || '—'}</span>
                              </div>
                              <div className="row-detail-item">
                                <span className="row-detail-label">Origen</span>
                                <span className="row-detail-value">{ORIGIN_DISPLAY[p.origin] ?? '—'}</span>
                              </div>
                            </div>
                            <div className="row-actions-expand-inner">
                              <button
                                className="action-btn update labeled"
                                onClick={() => onUpdateContact(p.id, p.name)}
                              >
                                <RotateCw size={14} strokeWidth={1.75} /> Actualizar contacto
                              </button>
                              <button
                                className="action-btn edit labeled"
                                onClick={() => onEditProspect(p)}
                              >
                                <Pencil size={14} strokeWidth={1.75} /> Editar
                              </button>
                              <button
                                className="action-btn delete labeled"
                                onClick={() => onDeleteProspect(p)}
                              >
                                <Trash2 size={14} strokeWidth={1.75} /> Eliminar
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {Array.from({ length: fillerRows }).map((_, i) => (
              <tr key={`filler-${i}`} className="table-filler-row" aria-hidden="true">
                <td colSpan={7}>&nbsp;</td>
              </tr>
            ))}
            </>
          )}
        </tbody>
      </table>
      {totalPages > 1 && (
        <TablePager
          page={page}
          totalPages={totalPages}
          total={total}
          perPage={PROSPECTS_PER_PAGE}
          onPage={setPage}
        />
      )}
      <RowActionsSheet
        open={mode === 'drawer' && !!sheetProspect}
        onClose={() => setSheetProspect(null)}
        title={sheetProspect?.name}
      >
        <button
          className="action-btn update labeled"
          onClick={() => { onUpdateContact(sheetProspect.id, sheetProspect.name); setSheetProspect(null); }}
        >
          <RotateCw size={16} /> Actualizar contacto
        </button>
        <button
          className="action-btn edit labeled"
          onClick={() => { onEditProspect(sheetProspect); setSheetProspect(null); }}
        >
          <Pencil size={16} /> Editar
        </button>
        <button
          className="action-btn delete labeled"
          onClick={() => { onDeleteProspect(sheetProspect); setSheetProspect(null); }}
        >
          <Trash2 size={16} /> Eliminar
        </button>
      </RowActionsSheet>
    </div>
  );
}

export default function ClientesView({
  allProspectosList,
  filteredProspectos,
  prospectosSearch,
  onSearchChange,
  prospectosCategoryFilter,
  onCategoryChange,
  onOpenAddProspect,
  onEditProspect,
  onDeleteProspect,
  onUpdateContact,
  highlightedProspectId,
  activities = [],
}) {
  const stats = useMemo(() => computeClientStats(allProspectosList), [allProspectosList]);
  // Filtro de "Para atender" (vencido / sin contactar). Es local a la vista;
  // la categoría vive en App porque también la usa el sync.
  const [followupFilter, setFollowupFilter] = useState(null);

  // Combina búsqueda + categoría (ya resueltas en App) con el filtro de seguimiento.
  // null = sin filtros, ProspectosTable muestra la lista completa.
  const visibleProspectos = useMemo(() => {
    if (!followupFilter) return filteredProspectos;
    const base = filteredProspectos ?? allProspectosList ?? [];
    return base.filter(FOLLOWUP_FILTERS[followupFilter].match);
  }, [filteredProspectos, allProspectosList, followupFilter]);

  const toggleFollowup = key => setFollowupFilter(prev => (prev === key ? null : key));

  const activeFilters = [
    prospectosCategoryFilter && {
      key: 'category',
      label: CATEGORY_SEGMENTS.find(s => s.key === prospectosCategoryFilter)?.label
        ?? CATEGORY_DISPLAY[prospectosCategoryFilter],
      onClear: () => onCategoryChange(''),
    },
    followupFilter && {
      key: 'followup',
      label: FOLLOWUP_FILTERS[followupFilter].label,
      onClear: () => setFollowupFilter(null),
    },
  ].filter(Boolean);

  const clientActivities = useMemo(
    () => activities.filter(a => CLIENT_ACTIVITY_TYPES.has(a.type)),
    [activities]
  );

  return (
    <ShellLayout className="clientes-shell">
      <ErrorBoundary label="Error al cargar prospectos">
        <PageLayout className="clientes-page">
          <PageHeader
            eyebrow="Gestión comercial"
            title="Clientes"
            description="Organizá contactos, etapas y próximos seguimientos desde una sola cartera."
            actions={
              <Button size="sm" onClick={onOpenAddProspect}>
                <Plus size={16} aria-hidden="true" />
                Nuevo prospecto
              </Button>
            }
          />

          {/* Resumen: cada etapa filtra por categoría; "Para atender" filtra por seguimiento. */}
          <StageSummary
            className="cli-summary"
            aria-label="Resumen de la cartera"
            total={{ value: stats.total, label: 'contactos' }}
            segments={CATEGORY_SEGMENTS.map(s => ({ ...s, value: stats.byCategory[s.key] }))}
            activeKey={prospectosCategoryFilter || null}
            onSelect={key => onCategoryChange(key ?? '')}
            aside={{
              title: 'Para atender',
              tone: 'alert',
              items: [
                {
                  key: 'vencido',
                  label: 'Seguimiento vencido',
                  value: stats.vencido,
                  active: followupFilter === 'vencido',
                  onClick: () => toggleFollowup('vencido'),
                },
                {
                  key: 'sin_contactar',
                  label: 'Sin contactar',
                  value: stats.sinContactar,
                  active: followupFilter === 'sin_contactar',
                  onClick: () => toggleFollowup('sin_contactar'),
                },
              ],
            }}
          />

          <NeglectedProspectsPanel prospects={allProspectosList} onUpdateContact={onUpdateContact} />

          <Panel as="section" className="cli-table-panel" flush>
            <ProspectosFilters
              count={(visibleProspectos ?? allProspectosList ?? []).length}
              total={allProspectosList?.length ?? 0}
              search={prospectosSearch}
              onSearchChange={onSearchChange}
              activeFilters={activeFilters}
            />
            <ProspectosTable
              prospectos={allProspectosList}
              filteredProspectos={visibleProspectos}
              onEditProspect={onEditProspect}
              onDeleteProspect={onDeleteProspect}
              onUpdateContact={onUpdateContact}
              highlightedProspectId={highlightedProspectId}
            />
          </Panel>

          <div className="cli-row3">
            <Panel as="section" className="cli-mod cli-origins">
              <SectionHeader tier="aside" className="cli-mod-head" eyebrow="Prospectos" title="Distribución por origen" sub="De dónde llegan tus prospectos" />
              {stats.origins.some(origin => origin.n > 0) ? (
                <>
                  <div className="cli-summ">
                    <div className="cli-summ-total">
                      <span className="cli-summ-kicker">Prospectos</span>
                      <strong className="cli-summ-value"><span>{stats.total}</span><small>en total</small></strong>
                    </div>
                    {stats.origins[0].n > 0 && (
                      <div className="cli-summ-lead">
                        <span className="cli-summ-kicker">Origen líder</span>
                        <b className="cli-summ-value">{stats.origins[0].label}</b>
                      </div>
                    )}
                  </div>
                  <OriginDistribution origins={stats.origins} total={stats.total} maxOriginCount={stats.maxOriginCount} />
                </>
              ) : (
                <p className="cli-mod-empty">Sin datos de origen todavía.</p>
              )}
            </Panel>

            <Panel as="section" className="cli-mod cli-activity">
              <ActivityFeed
                activities={clientActivities}
                sectionTitle="Actividad reciente"
                sectionSubtitle="Últimos movimientos de la cartera"
              />
            </Panel>
          </div>
        </PageLayout>
      </ErrorBoundary>
    </ShellLayout>
  );
}
