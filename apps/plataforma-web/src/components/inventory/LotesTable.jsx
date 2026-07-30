// Tabla principal de gestión de Lotes. Paginada client-side con sort por
// columnas. Cada chip de prospecto abre un ProspectoTooltip al clickearlo.
//
// Movida desde InventarioView.jsx en la Fase 7 (último componente grande
// del módulo de inventario).

import { useState } from 'react';
import { PencilLine, Trash2 } from 'lucide-react';
import { Badge, CommentTooltip, SortHeader, TablePager } from '../../ui/components';
import { useTableSort } from '../../hooks/useTableSort';
import { STATUS_DISPLAY } from '../../constants';
import { LOT_SORT_ACCESSORS, LOTS_PER_PAGE } from './constants';
import ProspectoTooltip from './ProspectoTooltip';
import './LotesTable.css';

export default function LotesTable({ lots, filteredLots, onEditLot, onDeleteLot, allProspectos, onNavigateToProspect }) {
  const [openTooltip, setOpenTooltip] = useState(null);
  const baseData = filteredLots ?? lots;
  const { sort, handleSort, pageData, fillerRows, page, setPage, totalPages, total } =
    useTableSort(baseData, LOT_SORT_ACCESSORS, { perPage: LOTS_PER_PAGE });

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
            <SortHeader label="Nombre" sortKey="name" sort={sort} onSort={handleSort} />
            <SortHeader label="Área" sortKey="area" sort={sort} onSort={handleSort} />
            <SortHeader label="Precio" sortKey="price" sort={sort} onSort={handleSort} />
            <SortHeader label="Estado" sortKey="status" sort={sort} onSort={handleSort} />
            <SortHeader label="Loteo" sortKey="loteo" sort={sort} onSort={handleSort} />
            <SortHeader label="Prospectos" sortKey="prospectos" sort={sort} onSort={handleSort} />
            <th scope="col">Notas</th>
            <th scope="col">Acciones</th>
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
              return (
                <tr key={lot.id}>
                  <td className="td-name">{lot.name}</td>
                  <td>{lot.area_m2 ? `${parseFloat(lot.area_m2).toLocaleString()} m²` : '—'}</td>
                  <td>{lot.price ? `$${parseFloat(lot.price).toLocaleString()}` : '—'}</td>
                  <td>
                    <Badge value={lot.status}>
                      {STATUS_DISPLAY[lot.status] ?? lot.status}
                    </Badge>
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
    </div>
  );
}