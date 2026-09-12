// Tabla de gestión de Loteos. Los loteos que comparten proyecto se muestran
// agrupados bajo el nombre del proyecto (son las etapas de su stage switcher
// en el visor). Soporta loteos sueltos también.
//
// Movida desde InventarioView.jsx en la Fase 6.

import { Layers } from 'lucide-react';
import { Loader } from '../../ui/components';
import { buildLoteoRows } from './inventoryStats';
import LoteoRow from './LoteoRow';
import './LoteosTable.css';

export default function LoteosTable({ loteos, filteredLoteos, projects, loading, onEditLoteo, onDeleteLoteo, onSafeOpen, onOpenEditor, onOpenShareLoteo }) {
  const data = filteredLoteos ?? loteos;
  const rows = buildLoteoRows(data, projects);
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
              rows.map(row => {
                if (row.variant === 'group-header') {
                  return (
                    <tr key={row.key} className="loteo-group-row loteo-group-first loteo-group-header-row">
                      <td colSpan={5} className="td-group-header">
                        <span className="group-header-label">
                          <Layers size={11} aria-hidden="true" />
                          {row.label}
                        </span>
                      </td>
                    </tr>
                  );
                }
                return (
                  <LoteoRow
                    key={row.key}
                    row={row}
                    onEditLoteo={onEditLoteo}
                    onDeleteLoteo={onDeleteLoteo}
                    onSafeOpen={onSafeOpen}
                    onOpenEditor={onOpenEditor}
                    onOpenShareLoteo={onOpenShareLoteo}
                  />
                );
              })
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}