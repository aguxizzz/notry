import React from 'react';
import { Search, SlidersHorizontal, Pencil, Trash2, Eye } from 'lucide-react';
import { Button, Loader, Select, ErrorBoundary } from '../../ui/components';
import LotDistributionBar from '../LotDistributionBar';
import { API_BASE, VISOR_URL } from '../../config';
import { STATUS_DISPLAY } from '../../constants';

// ─── Sub-components ───────────────────────────────────────────────────────────

function InventarioControls({
  inventoryTab,
  onTabChange,
  inventorySearch,
  onSearchChange,
  inventoryStatusFilter,
  onStatusFilterChange,
  inventoryLoading,
  syncLoading,
  inventoryLoteosLoading,
  onOpenCreateLoteo,
  onOpenCreateLot,
}) {
  return (
    <div className="inventory-controls">
      <div className="inventory-tab-controls">
        <SlidersHorizontal size={16} className="filter-icon" />
        <span className="inventory-tab-label">Ver tabla de:</span>
        <select
          className="inventory-tab-select"
          value={inventoryTab}
          onChange={e => onTabChange(e.target.value)}
        >
          <option value="lotes">Lotes</option>
          <option value="loteos">Loteos</option>
        </select>
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
          <div className="inventory-search" />
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

function LotesTable({ lots, filteredLots, onEditLot, onDeleteLot }) {
  const data = filteredLots ?? lots;
  return (
    <div key="lotes" className="inventory-table-wrapper fade-in">
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
            data.map(lot => (
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
                      {lot.prospect_names.map((p, i) => (
                        <span key={i} className="prospecto-tag">{p}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {lot.comments ? (
                    <span className="td-comments-indicator" title={lot.comments}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </span>
                  ) : (
                    <span className="td-empty">—</span>
                  )}
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LoteosTable({ loteos, loading, onEditLoteo, onDeleteLoteo, onSafeOpen, onOpenEditor }) {
  return (
    <div key="loteos" className="inventory-table-wrapper fade-in">
      {loading && loteos.length === 0 ? (
        <div className="table-cell-center">
          <Loader />
        </div>
      ) : (
        <table className="inventory-table">
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
            {loteos.length === 0 ? (
              <tr>
                <td colSpan={5} className="td-empty-row">No se encontraron loteos.</td>
              </tr>
            ) : (
              loteos.map(loteo => (
                <tr key={loteo.id}>
                  <td className="td-name">{loteo.name}</td>
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
                      type="button"
                      className="text-action-btn edit"
                      onClick={() => onEditLoteo(loteo)}
                      title="Editar"
                      aria-label={`Editar ${loteo.name}`}
                    >
                      <Pencil size={16} style={{ marginRight: '6px' }} /> Editar
                    </button>
                    <button
                      type="button"
                      className="text-action-btn delete"
                      onClick={() => onDeleteLoteo(loteo)}
                      title="Eliminar"
                      aria-label={`Eliminar ${loteo.name}`}
                    >
                      <Trash2 size={16} style={{ marginRight: '6px' }} /> Eliminar
                    </button>
                  </td>
                  <td className="td-links">
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="text-action-btn view"
                        onClick={() => window.open(`${VISOR_URL}/?data=${API_BASE}/loteos/${loteo.id}/visor_data`, '_blank', 'noopener,noreferrer')}
                      >
                        Visor
                      </button>
                      <button
                        type="button"
                        className="text-action-btn view"
                        onClick={() => onOpenEditor(loteo.id)}
                      >
                        Editor
                      </button>
                    </div>
                  </td>
                </tr>
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
  inventoryLoading,
  inventoryLoteosLoading,
  inventoryTab,
  onTabChange,
  inventorySearch,
  onSearchChange,
  inventoryStatusFilter,
  onStatusFilterChange,
  syncLoading,
  onOpenEditLotModal,
  onOpenDeleteConfirm,
  onOpenCreateLotModal,
  onOpenCreateLoteoModal,
  onOpenEditLoteoModal,
  onOpenDeleteLoteoDialog,
  onOpenEditor,
  safeOpen,
}) {
  return (
    <>
      <div className="inventory-distribution-wrapper">
        <LotDistributionBar summary={dashboardSummary} loading={!dashboardSummary} />
      </div>

      <div className="inventory-section">
        <InventarioControls
          inventoryTab={inventoryTab}
          onTabChange={onTabChange}
          inventorySearch={inventorySearch}
          onSearchChange={onSearchChange}
          inventoryStatusFilter={inventoryStatusFilter}
          onStatusFilterChange={onStatusFilterChange}
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
            />
          ) : (
            <LoteosTable
              loteos={inventoryLoteos}
              loading={inventoryLoteosLoading}
              onEditLoteo={onOpenEditLoteoModal}
              onDeleteLoteo={onOpenDeleteLoteoDialog}
              onSafeOpen={safeOpen}
              onOpenEditor={onOpenEditor}
            />
          )}
        </ErrorBoundary>
      </div>
    </>
  );
}
