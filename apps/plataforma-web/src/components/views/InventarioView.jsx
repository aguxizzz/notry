import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, SlidersHorizontal, Pencil, Trash2, Eye, TrendingUp, LayoutGrid, Share2, Phone, Mail, Clock, MessageCircle, X, Layers } from 'lucide-react';
import { Button, Loader, Select, ErrorBoundary, CommentTooltip } from '../../ui/components';
import LotDistributionBar from '../LotDistributionBar';
import { API_BASE, VISOR_URL } from '../../config';
import { STATUS_DISPLAY, CATEGORY_DISPLAY } from '../../constants';
import '../../ui/components/ActionBtn.css';
import './InventarioView.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeContact(dateStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProspectoTooltip({ prospecto, triggerEl, onClose, onNavigateToProspect }) {
  const tooltipRef = useRef(null);
  const [coords, setCoords] = useState({});
  const [positionBottom, setPositionBottom] = useState(false);

  useEffect(() => {
    if (!triggerEl) return;
    const update = () => {
      const rect = triggerEl.getBoundingClientRect();
      const tooltipHeight = tooltipRef.current ? tooltipRef.current.offsetHeight : 200;
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      const isBottom = spaceAbove < tooltipHeight + 16 && spaceBelow > tooltipHeight + 16;
      setPositionBottom(isBottom);
      const left = Math.min(rect.left, window.innerWidth - 296);
      if (isBottom) {
        setCoords({ top: rect.bottom + 8, left, bottom: 'auto' });
      } else {
        setCoords({ bottom: window.innerHeight - rect.top + 8, left, top: 'auto' });
      }
    };
    update();
    const t = setTimeout(update, 0);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { clearTimeout(t); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [triggerEl]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target) && !triggerEl?.contains(e.target)) onClose();
    };
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => { document.removeEventListener('mousedown', handleOutside); document.removeEventListener('keydown', handleEsc); };
  }, [triggerEl, onClose]);

  const contactLabel = formatRelativeContact(prospecto.last_contact);
  const categoryLabel = CATEGORY_DISPLAY[prospecto.category] ?? prospecto.category;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`prospecto-tooltip${positionBottom ? ' bottom' : ''}`}
      style={{ position: 'fixed', margin: 0, ...coords }}
    >
      <div className="prospecto-tooltip-header">
        <div className="prospecto-tooltip-header-main">
          <button
              className="prospecto-tooltip-name-btn"
              onClick={() => { onNavigateToProspect(prospecto.id); onClose(); }}
              title="Ver en tabla de prospectos"
            >
              {prospecto.name}
            </button>
          {prospecto.category && (
            <span className={`prospecto-tooltip-badge category-${prospecto.category}`}>
              {categoryLabel}
            </span>
          )}
        </div>
        <button className="prospecto-tooltip-close" onClick={onClose} aria-label="Cerrar">
          <X size={14} />
        </button>
      </div>
      <div className="prospecto-tooltip-body">
        {prospecto.phone && (
          <div className="prospecto-tooltip-row">
            <Phone size={13} className="prospecto-tooltip-icon" />
            <span>{prospecto.phone}</span>
          </div>
        )}
        {prospecto.email && (
          <div className="prospecto-tooltip-row">
            <Mail size={13} className="prospecto-tooltip-icon" />
            <span>{prospecto.email}</span>
          </div>
        )}
        <div className="prospecto-tooltip-row">
          <Clock size={13} className={`prospecto-tooltip-icon${!contactLabel ? ' muted' : ''}`} />
          <span className={!contactLabel ? 'prospecto-tooltip-muted' : ''}>
            {contactLabel ? `Último contacto: ${contactLabel}` : 'Sin contacto aún'}
          </span>
        </div>
        {prospecto.observation_notes && (
          <div className="prospecto-tooltip-row prospecto-tooltip-row--notes">
            <MessageCircle size={13} className="prospecto-tooltip-icon" />
            <span className="prospecto-tooltip-notes-text">{prospecto.observation_notes}</span>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function InventarioControls({
  inventoryTab,
  onTabChange,
  inventorySearch,
  onSearchChange,
  inventoryLoteosSearch,
  onLoteosSearchChange,
  inventoryStatusFilter,
  onStatusFilterChange,
  inventoryLoteoFilter,
  onLoteoFilterChange,
  inventoryLoteos,
  inventoryLoading,
  syncLoading,
  inventoryLoteosLoading,
  onOpenCreateLoteo,
  onOpenCreateLot,
}) {
  const loteoFilterOptions = [
    { value: '', label: 'Loteo: Todos' },
    ...(inventoryLoteos || []).map(loteo => ({ value: String(loteo.id), label: loteo.name })),
  ];
  return (
    <div className="inventory-controls">
      <div className="inventory-tab-controls">
        <SlidersHorizontal size={16} className="filter-icon" />
        <span className="inventory-tab-label">Ver tabla de:</span>
        <Select
          id="inventory-tab-select"
          value={inventoryTab}
          onChange={e => onTabChange(e.target.value)}
          options={[
            { value: 'lotes', label: 'Lotes' },
            { value: 'loteos', label: 'Loteos' },
          ]}
          className="inventory-tab-select-custom"
        />
      </div>

      {inventoryTab === 'lotes' ? (
        <>
          <div className="inventory-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              className="search-input"
              value={inventorySearch}
              onChange={e => onSearchChange(e.target.value)}
            />
          </div>
          <div className="inventory-filters">
            <SlidersHorizontal size={16} className="filter-icon" />
            <Select
              id="inventory-loteo-filter"
              value={inventoryLoteoFilter}
              onChange={e => onLoteoFilterChange(e.target.value)}
              options={loteoFilterOptions}
            />
            <Select
              id="inventory-status-filter"
              value={inventoryStatusFilter}
              onChange={e => onStatusFilterChange(e.target.value)}
              options={[
                { value: '', label: 'Estado: Todos' },
                { value: 'available', label: 'Disponible' },
                { value: 'reserved', label: 'Reservado' },
                { value: 'sold', label: 'Vendido' },
              ]}
            />
          </div>
          <div className="loader-container small">
            {(inventoryLoading || syncLoading) && <Loader size="sm" />}
          </div>
          <Button size="sm" onClick={onOpenCreateLot}>
            + Nuevo Lote
          </Button>
        </>
      ) : (
        <>
          <div className="inventory-search">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              className="search-input"
              value={inventoryLoteosSearch}
              onChange={e => onLoteosSearchChange(e.target.value)}
            />
          </div>
          <div className="loader-container small">
            {(syncLoading || inventoryLoteosLoading) && <Loader size="sm" />}
          </div>
          <Button size="sm" onClick={onOpenCreateLoteo}>
            + Nuevo Loteo
          </Button>
        </>
      )}
    </div>
  );
}

function LotesTable({ lots, filteredLots, onEditLot, onDeleteLot, allProspectos, onNavigateToProspect }) {
  const [openTooltip, setOpenTooltip] = useState(null);
  const data = filteredLots ?? lots;

  const handleTagClick = (e, prospecto) => {
    const triggerEl = e.currentTarget;
    setOpenTooltip(prev =>
      prev?.prospecto?.id === prospecto.id ? null : { prospecto, triggerEl }
    );
  };

  return (
    <div key="lotes" className="inventory-table-wrapper fade-in">
      {openTooltip && (
        <ProspectoTooltip
          prospecto={openTooltip.prospecto}
          triggerEl={openTooltip.triggerEl}
          onClose={() => setOpenTooltip(null)}
          onNavigateToProspect={onNavigateToProspect}
        />
      )}
      <table className="inventory-table">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Área</th>
            <th scope="col">Precio</th>
            <th scope="col">Estado</th>
            <th scope="col">Loteo</th>
            <th scope="col">Prospectos</th>
            <th scope="col">Notas</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={8} className="td-empty-row">No se encontraron lotes.</td>
            </tr>
          ) : (
            data.map(lot => {
              const prospectosDeLote = (allProspectos || []).filter(p => p.lote_id === lot.id);
              const tieneDatos = prospectosDeLote.length > 0;
              return (
                <tr key={lot.id}>
                  <td className="td-name">{lot.name}</td>
                  <td>{lot.area_m2 ? `${parseFloat(lot.area_m2).toLocaleString()} m²` : '—'}</td>
                  <td>{lot.price ? `$${parseFloat(lot.price).toLocaleString()}` : '—'}</td>
                  <td>
                    <span className={`badge status-${STATUS_DISPLAY[lot.status] ?? lot.status}`}>
                      {STATUS_DISPLAY[lot.status] ?? lot.status}
                    </span>
                  </td>
                  <td className="td-loteo">{lot.loteo_name}</td>
                  <td>
                    {!lot.prospect_names?.length ? (
                      <span className="td-empty">—</span>
                    ) : (
                      <div className="prospectos-list">
                        {tieneDatos
                          ? prospectosDeLote.map(p => (
                              <button
                                key={p.id}
                                className={`prospecto-tag clickable${openTooltip?.prospecto?.id === p.id ? ' active' : ''}`}
                                onClick={(e) => handleTagClick(e, p)}
                                title={`Ver info de ${p.name}`}
                              >
                                {p.name}
                              </button>
                            ))
                          : lot.prospect_names.map((name, i) => (
                              <span key={i} className="prospecto-tag">{name}</span>
                            ))
                        }
                      </div>
                    )}
                  </td>
                  <td>
                    <CommentTooltip content={lot.comments} label="Notas" entityName={lot.name} />
                  </td>
                  <td className="td-actions">
                    <button
                      className="action-btn edit"
                      onClick={() => onEditLot(lot)}
                      title="Editar"
                      aria-label={`Editar ${lot.name}`}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => onDeleteLot(lot)}
                      title="Eliminar"
                      aria-label={`Eliminar ${lot.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// Ordena los loteos agrupando las etapas debajo de su general (o de la primera
// etapa si no hay general). Devuelve filas con metadata de posición para el recuadro.
function buildLoteoRows(data) {
  const groupsByetapas = new Map();
  const order = [];
  for (const loteo of data) {
    if (!loteo.grupo_id) {
      order.push({ kind: 'standalone', loteo });
    } else {
      if (!groupsByetapas.has(loteo.grupo_id)) {
        const entry = { kind: 'group', grupoId: loteo.grupo_id, general: null, etapas: [] };
        groupsByetapas.set(loteo.grupo_id, entry);
        order.push(entry);
      }
      const g = groupsByetapas.get(loteo.grupo_id);
      if (loteo.tipo === 'general') g.general = loteo;
      else g.etapas.push(loteo);
    }
  }
  const rows = [];
  for (const item of order) {
    if (item.kind === 'standalone') {
      rows.push({ key: item.loteo.id, loteo: item.loteo, variant: 'standalone' });
      continue;
    }
    item.etapas.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    const members = [];
    if (item.general) members.push({ loteo: item.general, role: 'general' });
    for (const e of item.etapas) members.push({ loteo: e, role: 'etapa' });
    members.forEach((m, i) => {
      rows.push({
        key: m.loteo.id,
        loteo: m.loteo,
        variant: 'group',
        role: m.role,
        isFirst: i === 0,
        isLast: i === members.length - 1,
      });
    });
  }
  return rows;
}

function LoteoRow({ row, onEditLoteo, onDeleteLoteo, onGroupLoteo, onSafeOpen, onOpenEditor, onOpenShareLoteo }) {
  const { loteo, variant, role, isFirst, isLast } = row;
  const rowClass = [];
  if (variant === 'group') {
    rowClass.push('loteo-group-row');
    if (isFirst) rowClass.push('loteo-group-first');
    if (isLast) rowClass.push('loteo-group-last');
    rowClass.push(role === 'general' ? 'loteo-group-general' : 'loteo-group-etapa');
  }
  const isGrouped = !!loteo.grupo_id;

  return (
    <tr className={rowClass.join(' ')}>
      <td className="td-name">
        {variant === 'group' ? (
          <span className={`loteo-name-cell role-${role}`}>
            {role === 'etapa' && <span className="loteo-tree-connector" aria-hidden="true" />}
            <span className="loteo-name-text">{loteo.name}</span>
            <span className={`loteo-role-badge ${role}`}>{role === 'general' ? 'General' : 'Etapa'}</span>
          </span>
        ) : (
          loteo.name
        )}
      </td>
      <td>
        {loteo.image_url ? (
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onSafeOpen(loteo.image_url)}
            title="Ver imagen"
            aria-label="Ver imagen"
          >
            <Eye size={16} style={{ marginRight: '6px' }} /> Ver
          </button>
        ) : (
          <span className="td-empty">—</span>
        )}
      </td>
      <td>
        {loteo.blueprint_url ? (
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onSafeOpen(loteo.blueprint_url)}
            title="Ver blueprint"
            aria-label="Ver blueprint"
          >
            <Eye size={16} style={{ marginRight: '6px' }} /> Ver
          </button>
        ) : (
          <span className="td-empty">—</span>
        )}
      </td>
      <td className="td-actions">
        <button
          className="action-btn edit"
          onClick={() => onEditLoteo(loteo)}
          title="Editar"
          aria-label={`Editar ${loteo.name}`}
        >
          <Pencil size={16} />
        </button>
        <button
          className={`action-btn group${isGrouped ? ' active' : ''}`}
          onClick={() => onGroupLoteo(loteo)}
          title={isGrouped ? 'Editar grupo' : 'Agrupar'}
          aria-label={`Agrupar ${loteo.name}`}
        >
          <Layers size={16} />
        </button>
        <button
          className="action-btn delete"
          onClick={() => onDeleteLoteo(loteo)}
          title="Eliminar"
          aria-label={`Eliminar ${loteo.name}`}
        >
          <Trash2 size={16} />
        </button>
      </td>
      <td className="td-links">
        <div className="loteo-link-actions">
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => window.open(`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/group_visor_data`, '_blank', 'noopener,noreferrer')}
            title="Abrir visor"
            aria-label={`Abrir visor de ${loteo.name}`}
          >
            Visor
          </button>
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onOpenShareLoteo(loteo.id)}
            title="Copiar enlace compartible"
            aria-label={`Copiar enlace de ${loteo.name}`}
          >
            <Share2 size={16} style={{ marginRight: '6px' }} /> Compartir
          </button>
          <button
            type="button"
            className="text-action-btn view"
            onClick={() => onOpenEditor(loteo.id)}
            title="Abrir editor"
            aria-label={`Abrir editor de ${loteo.name}`}
          >
            Editor
          </button>
        </div>
      </td>
    </tr>
  );
}

function LoteosTable({ loteos, filteredLoteos, loading, onEditLoteo, onDeleteLoteo, onGroupLoteo, onSafeOpen, onOpenEditor, onOpenShareLoteo }) {
  const data = filteredLoteos ?? loteos;
  const rows = buildLoteoRows(data);
  return (
    <div key="loteos" className="inventory-table-wrapper fade-in">
      {loading && loteos.length === 0 ? (
        <div className="table-cell-center">
          <Loader />
        </div>
      ) : (
        <table className="inventory-table loteos-table">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Imagen</th>
              <th scope="col">Blueprint</th>
              <th scope="col">Acciones</th>
              <th scope="col">Links</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="td-empty-row">No se encontraron loteos.</td>
              </tr>
            ) : (
              rows.map(row => (
                <LoteoRow
                  key={row.key}
                  row={row}
                  onEditLoteo={onEditLoteo}
                  onDeleteLoteo={onDeleteLoteo}
                  onGroupLoteo={onGroupLoteo}
                  onSafeOpen={onSafeOpen}
                  onOpenEditor={onOpenEditor}
                  onOpenShareLoteo={onOpenShareLoteo}
                />
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InventarioView({
  dashboardSummary,
  inventoryLots,
  filteredInventoryLots,
  inventoryLoteos,
  filteredInventoryLoteos,
  inventoryLoading,
  inventoryLoteosLoading,
  inventoryTab,
  onTabChange,
  inventorySearch,
  onSearchChange,
  inventoryLoteosSearch,
  onLoteosSearchChange,
  inventoryStatusFilter,
  onStatusFilterChange,
  inventoryLoteoFilter,
  onLoteoFilterChange,
  syncLoading,
  onOpenEditLotModal,
  onOpenDeleteConfirm,
  onOpenCreateLotModal,
  onOpenCreateLoteoModal,
  onOpenEditLoteoModal,
  onOpenDeleteLoteoDialog,
  onGroupLoteo,
  onOpenEditor,
  safeOpen,
  onOpenShareLoteo,
  allProspectosList,
  onNavigateToProspect,
}) {

  return (
    <>
      <div className="stats-section">
        <div className="stats-header has-deco-icon">
          <TrendingUp className="section-deco-icon" size={72} />
          <div className="stats-header-eyebrow">Inventario</div>
          <h2>Distribución de Lotes</h2>
          <p className="stats-header-sub">Estado actual del inventario disponible</p>
        </div>
        <LotDistributionBar summary={dashboardSummary} loading={!dashboardSummary} />
      </div>

      <div className="kanban-section">
        <div className="kanban-header has-deco-icon">
          <LayoutGrid className="section-deco-icon" size={80} />
          <div className="stats-header-eyebrow">Lotes</div>
          <h2>Gestión de Inventario</h2>
          <p className="kanban-header-sub">Administra lotes y loteos</p>
        </div>
        <InventarioControls
          inventoryTab={inventoryTab}
          onTabChange={onTabChange}
          inventorySearch={inventorySearch}
          onSearchChange={onSearchChange}
          inventoryLoteosSearch={inventoryLoteosSearch}
          onLoteosSearchChange={onLoteosSearchChange}
          inventoryStatusFilter={inventoryStatusFilter}
          onStatusFilterChange={onStatusFilterChange}
          inventoryLoteoFilter={inventoryLoteoFilter}
          onLoteoFilterChange={onLoteoFilterChange}
          inventoryLoteos={inventoryLoteos}
          inventoryLoading={inventoryLoading}
          syncLoading={syncLoading}
          inventoryLoteosLoading={inventoryLoteosLoading}
          onOpenCreateLot={onOpenCreateLotModal}
          onOpenCreateLoteo={onOpenCreateLoteoModal}
        />

        <ErrorBoundary label="Error al cargar inventario">
          {inventoryTab === 'lotes' ? (
            <LotesTable
              lots={inventoryLots}
              filteredLots={filteredInventoryLots}
              onEditLot={onOpenEditLotModal}
              onDeleteLot={onOpenDeleteConfirm}
              allProspectos={allProspectosList}
              onNavigateToProspect={onNavigateToProspect}
            />
          ) : (
            <LoteosTable
              loteos={inventoryLoteos}
              filteredLoteos={filteredInventoryLoteos}
              loading={inventoryLoteosLoading}
              onEditLoteo={onOpenEditLoteoModal}
              onDeleteLoteo={onOpenDeleteLoteoDialog}
              onGroupLoteo={onGroupLoteo}
              onSafeOpen={safeOpen}
              onOpenEditor={onOpenEditor}
              onOpenShareLoteo={onOpenShareLoteo}
            />
          )}
        </ErrorBoundary>
      </div>
    </>
  );
}
