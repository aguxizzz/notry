// Tabla principal de gestión de Lotes. Paginada client-side con sort por
// columnas. Cada chip de prospecto abre un ProspectoTooltip al clickearlo.
//
// Movida desde InventarioView.jsx en la Fase 7 (último componente grande
// del módulo de inventario).

import { Fragment, useState } from 'react';
import { PencilLine, Trash2 } from 'lucide-react';
import { Badge, CommentTooltip, RowActionsSheet, SortHeader, TablePager } from '../../ui/components';
import { useTableSort } from '../../hooks/useTableSort';
import { useRowActionsMode } from '../../hooks/useRowActionsMode';
import { STATUS_DISPLAY } from '../../constants';
import { LOT_SORT_ACCESSORS, LOTS_PER_PAGE } from './constants';
import ProspectoTooltip from './ProspectoTooltip';
import './LotesTable.css';

export default function LotesTable({ lots, filteredLots, onEditLot, onDeleteLot, allProspectos, onNavigateToProspect }) {
  const [openTooltip, setOpenTooltip] = useState(null);
  const [expandedLotId, setExpandedLotId] = useState(null);
  const [sheetLot, setSheetLot] = useState(null);
  const mode = useRowActionsMode();
  const baseData = filteredLots ?? lots;
  const { sort, handleSort, pageData, fillerRows, page, setPage, totalPages, total } =
    useTableSort(baseData, LOT_SORT_ACCESSORS, { perPage: LOTS_PER_PAGE });

  const handleTagClick = (e, prospecto) => {
    const triggerEl = e.currentTarget;
    setOpenTooltip(prev =>
      prev?.prospecto?.id === prospecto.id ? null : { prospecto, triggerEl }
    );
  };

  const handleRowClick = (e, lot) => {
    if (mode === 'inline') return;
    if (e.target.closest('button, a')) return;
    if (mode === 'drawer') {
      setSheetLot(lot);
      return;
    }
    setExpandedLotId(prev => (prev === lot.id ? null : lot.id));
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
      <table className="inventory-table lotes-table">
        <thead>
          <tr>
            <SortHeader label="Nombre" sortKey="name" sort={sort} onSort={handleSort} />
            <SortHeader label="Área" sortKey="area" sort={sort} onSort={handleSort} />
            <SortHeader label="Precio" sortKey="price" sort={sort} onSort={handleSort} />
            <SortHeader label="Estado" sortKey="status" sort={sort} onSort={handleSort} />
            <SortHeader label="Loteo" sortKey="loteo" sort={sort} onSort={handleSort} />
            <SortHeader label="Prospectos" sortKey="prospectos" sort={sort} onSort={handleSort} className="th-secondary" />
            <th scope="col" className="th-secondary">Notas</th>
            <th scope="col" className="th-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {total === 0 ? (
            <tr>
              <td colSpan={8} className="td-empty-row">No se encontraron lotes.</td>
            </tr>
          ) : (
            <>
            {pageData.map(lot => {
              const prospectosDeLote = (allProspectos || []).filter(p => p.lote_id === lot.id);
              const tieneDatos = prospectosDeLote.length > 0;
              const areaText = lot.area_m2 ? `${parseFloat(lot.area_m2).toLocaleString()} m²` : '—';
              const priceText = lot.price ? `$${parseFloat(lot.price).toLocaleString()}` : '—';
              const statusBadge = (
                <Badge value={lot.status}>
                  {STATUS_DISPLAY[lot.status] ?? lot.status}
                </Badge>
              );
              const prospectosNode = !lot.prospect_names?.length ? (
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
              );
              const notasNode = <CommentTooltip content={lot.comments} label="Notas" entityName={lot.name} />;

              // <768px ("drawer"): la fila deja de ser una tabla de columnas y
              // pasa a ser una card apilada — ver nota en table.css sobre
              // `.td-card`/`.row-card`. Todos los datos quedan visibles acá
              // mismo, sin necesidad de abrir el sheet (que sólo trae acciones).
              if (mode === 'drawer') {
                return (
                  <tr
                    key={lot.id}
                    className="row-clickable"
                    onClick={(e) => handleRowClick(e, lot)}
                  >
                    <td colSpan={8} className="td-card">
                      <div className="row-card">
                        <div className="row-card-head">
                          <span className="row-card-title">{lot.name}</span>
                          {statusBadge}
                        </div>
                        <div className="row-detail-list">
                          <div className="row-detail-item">
                            <span className="row-detail-label">Precio</span>
                            <span className="row-detail-value">{priceText}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Área</span>
                            <span className="row-detail-value">{areaText}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Loteo</span>
                            <span className="row-detail-value">{lot.loteo_name || '—'}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Prospectos</span>
                            <span className="row-detail-value">{prospectosNode}</span>
                          </div>
                          <div className="row-detail-item">
                            <span className="row-detail-label">Notas</span>
                            <span className="row-detail-value">{notasNode}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <Fragment key={lot.id}>
                <tr
                  className={mode !== 'inline' ? 'row-clickable' : undefined}
                  onClick={(e) => handleRowClick(e, lot)}
                >
                  <td className="td-name">{lot.name}</td>
                  <td>{areaText}</td>
                  <td>{priceText}</td>
                  <td>{statusBadge}</td>
                  <td className="td-loteo">{lot.loteo_name}</td>
                  <td className="td-secondary">{prospectosNode}</td>
                  <td className="td-secondary">{notasNode}</td>
                  <td className="td-actions">
                    <button
                      className="action-btn edit"
                      onClick={() => onEditLot(lot)}
                      title="Editar"
                      aria-label={`Editar ${lot.name}`}
                    >
                      <PencilLine size={16} />
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
                {mode === 'accordion' && (
                  <tr className="row-actions-expand">
                    <td colSpan={8}>
                      <div className="row-actions-drawer" data-open={expandedLotId === lot.id}>
                        <div className="row-actions-drawer-inner">
                          <div className="row-actions-drawer-content">
                            <div className="row-detail-list">
                              <div className="row-detail-item">
                                <span className="row-detail-label">Prospectos</span>
                                <span className="row-detail-value">{prospectosNode}</span>
                              </div>
                              <div className="row-detail-item">
                                <span className="row-detail-label">Notas</span>
                                <span className="row-detail-value">{notasNode}</span>
                              </div>
                            </div>
                            <div className="row-actions-expand-inner">
                              <button
                                className="action-btn edit labeled"
                                onClick={() => onEditLot(lot)}
                              >
                                <PencilLine size={14} strokeWidth={1.75} /> Editar
                              </button>
                              <button
                                className="action-btn delete labeled"
                                onClick={() => onDeleteLot(lot)}
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
              <tr key={`filler-${i}`} className="lot-filler-row" aria-hidden="true">
                <td colSpan={8}>&nbsp;</td>
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
          perPage={LOTS_PER_PAGE}
          onPage={setPage}
        />
      )}
      <RowActionsSheet
        open={mode === 'drawer' && !!sheetLot}
        onClose={() => setSheetLot(null)}
        title={sheetLot?.name}
      >
        <button
          className="action-btn edit labeled"
          onClick={() => { onEditLot(sheetLot); setSheetLot(null); }}
        >
          <PencilLine size={16} /> Editar
        </button>
        <button
          className="action-btn delete labeled"
          onClick={() => { onDeleteLot(sheetLot); setSheetLot(null); }}
        >
          <Trash2 size={16} /> Eliminar
        </button>
      </RowActionsSheet>
    </div>
  );
}