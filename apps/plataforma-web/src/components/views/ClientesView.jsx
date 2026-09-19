import React, { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Pencil,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  UserMinus,
  Users,
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
  Select,
  SortHeader,
  SummaryBand,
  SummaryMetric,
  TablePager,
} from '../../ui/components';
import CategoryPieChart from '../CategoryPieChart';
import NeglectedProspectsPanel from '../NeglectedProspectsPanel';
import ActivityFeed from '../ActivityFeed';
import ShellLayout from '../ShellLayout';
import { useTableSort } from '../../hooks/useTableSort';
import { useRowActionsMode } from '../../hooks/useRowActionsMode';
import { CATEGORY_DISPLAY, ORIGIN_DISPLAY, formatDate } from '../../constants';
import { daysSinceContact, NEGLECTED_THRESHOLD_DAYS } from '../../utils/prospects';
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

function computeClientStats(prospects = []) {
  let sinAsesor = 0;
  let vencido = 0;
  const byOrigin = new Map();

  for (const p of prospects) {
    if (!p.advisor_id) sinAsesor++;
    const days = daysSinceContact(p.last_contact);
    if (days != null && days >= NEGLECTED_THRESHOLD_DAYS) vencido++;
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

  return { total, sinAsesor, vencido, origins, maxOriginCount: Math.max(...origins.map(({ n }) => n), 0) };
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

function ProspectosFilters({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryChange,
}) {
  return (
    <DataToolbar className="inventory-controls cli-toolbar">
      <SearchField
        id="prospects-search"
        ariaLabel="Buscar prospectos"
        placeholder="Buscar por nombre o email…"
        value={search}
        onChange={event => onSearchChange(event.target.value)}
      />
      <div className="inventory-filters">
        <SlidersHorizontal size={16} className="filter-icon" />
        <Select
          id="prospects-category-filter"
          value={categoryFilter}
          onChange={e => onCategoryChange(e.target.value)}
          options={[
            { value: '', label: 'Categoría: Todas' },
            ...Object.entries(CATEGORY_DISPLAY).map(([val, label]) => ({
              value: val,
              label,
            })),
          ]}
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

  const handleRowClick = (e, p) => {
    if (mode === 'inline') return;
    if (e.target.closest('button, a')) return;
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
            <th scope="col" className="th-actions">Acciones</th>
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
              const lastContactNode = (
                <div className="last-contact-cell">
                  <span>{formatDate(p.last_contact)}</span>
                  <CommentTooltip content={p.observation_notes} label="Observaciones" entityName={p.name} />
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
                  className={mode !== 'inline' ? 'row-clickable' : undefined}
                  onClick={(e) => handleRowClick(e, p)}
                >
                  <td className="td-name">{p.name}</td>
                  <td className="td-muted td-secondary">{p.email || '—'}</td>
                  <td className="td-muted td-secondary">{p.phone || '—'}</td>
                  <td>{categoryBadge}</td>
                  <td className="td-muted td-secondary">
                    {ORIGIN_DISPLAY[p.origin] ?? '—'}
                  </td>
                  <td className="td-muted">{lastContactNode}</td>
                  <td className="td-actions">
                    <button
                      className="action-btn update"
                      onClick={() => onUpdateContact(p.id, p.name)}
                      title="Actualizar Contacto"
                      aria-label={`Actualizar contacto ${p.name}`}
                    >
                      <RotateCw size={16} />
                    </button>
                    <button
                      className="action-btn edit"
                      onClick={() => onEditProspect(p)}
                      title="Editar"
                      aria-label={`Editar ${p.name}`}
                    >
                      <Pencil size={16} />
                    </button>
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

          <SummaryBand
            className="cli-summary"
            aria-label="Resumen de la cartera"
            lead={<CategoryPieChart prospects={allProspectosList} embedded />}
          >
            <SummaryMetric
              icon={<Users size={17} />}
              label="Total contactos"
              hint="cartera registrada"
              value={stats.total}
            />
            <SummaryMetric
              icon={<UserMinus size={17} />}
              label="Sin asesor"
              hint="requieren asignación"
              value={stats.sinAsesor}
            />
            <SummaryMetric
              icon={<Clock3 size={17} />}
              label="Seguimiento vencido"
              hint="requieren contacto"
              value={stats.vencido}
              tone={stats.vencido > 0 ? 'followup' : 'neutral'}
            />
          </SummaryBand>

          <NeglectedProspectsPanel prospects={allProspectosList} onUpdateContact={onUpdateContact} />

          <Panel as="section" className="cli-table-panel" flush>
            <SectionHeader
              className="cli-phead"
              eyebrow="Directorio"
              title="Contactos"
              sub="Gestioná etapa, asesor y último seguimiento"
            />
            <ProspectosFilters
              search={prospectosSearch}
              onSearchChange={onSearchChange}
              categoryFilter={prospectosCategoryFilter}
              onCategoryChange={onCategoryChange}
            />
            <ProspectosTable
              prospectos={allProspectosList}
              filteredProspectos={filteredProspectos}
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
