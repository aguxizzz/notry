// Tabla de gestión de Loteos. Primero el proyecto con sus etapas (las del stage
// switcher del visor) y debajo, en otra sección, los loteos sin proyecto.
//
// Movida desde InventarioView.jsx en la Fase 6.

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { Loader, RowActionsSheet } from '../../ui/components';
import { useRowActionsMode } from '../../hooks/useRowActionsMode';
import { buildLoteoRows } from './inventoryStats';
import LoteoRow, { LoteoRowActions } from './LoteoRow';
import './LoteosTable.css';

export default function LoteosTable({ loteos, filteredLoteos, projects, loading, onEditLoteo, onDeleteLoteo, onOpenLoteoServices, onSafeOpen, onOpenEditor }) {
  const [expandedLoteoId, setExpandedLoteoId] = useState(null);
  const [sheetLoteo, setSheetLoteo] = useState(null);
  const mode = useRowActionsMode();
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
              <th scope="col" className="th-secondary">Imagen</th>
              <th scope="col" className="th-secondary">Blueprint</th>
              <th scope="col" className="th-actions">Acciones</th>
              <th scope="col" className="th-links">Links</th>
              <th scope="col" className="th-tablet-link">Visor</th>
              <th scope="col" className="th-tablet-link">Editor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="td-empty-row">No se encontraron loteos.</td>
              </tr>
            ) : (
              rows.map(row => {
                if (row.variant === 'section-gap') {
                  return (
                    <tr key={row.key} className="loteo-section-gap" aria-hidden="true">
                      <td colSpan={7} />
                    </tr>
                  );
                }
                if (row.variant === 'section-header') {
                  return (
                    <tr key={row.key} className={`loteo-section-row is-${row.kind}`}>
                      <td colSpan={7} className="td-section-header">
                        <div className="section-header-inner">
                          <span className="section-header-kicker">
                            {row.kind === 'project' && <Layers size={12} aria-hidden="true" />}
                            {row.kind === 'project' ? 'Proyecto' : row.label}
                          </span>
                          {row.kind === 'project' && <span className="section-header-name">{row.label}</span>}
                          <span className="section-header-count">
                            {row.count} {row.count === 1 ? 'loteo' : 'loteos'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <LoteoRow
                    key={row.key}
                    row={row}
                    mode={mode}
                    isExpanded={expandedLoteoId === row.loteo.id}
                    onToggleExpand={() =>
                      setExpandedLoteoId(prev => (prev === row.loteo.id ? null : row.loteo.id))
                    }
                    onOpenSheet={() => setSheetLoteo(row.loteo)}
                    onEditLoteo={onEditLoteo}
                    onDeleteLoteo={onDeleteLoteo}
                    onOpenLoteoServices={onOpenLoteoServices}
                    onSafeOpen={onSafeOpen}
                    onOpenEditor={onOpenEditor}
                  />
                );
              })
            )}
          </tbody>
        </table>
      )}
      <RowActionsSheet
        open={mode === 'drawer' && !!sheetLoteo}
        onClose={() => setSheetLoteo(null)}
        title={sheetLoteo?.name}
      >
        {sheetLoteo && (
          <LoteoRowActions
            loteo={sheetLoteo}
            variant="sheet"
            onEditLoteo={(l) => { onEditLoteo(l); setSheetLoteo(null); }}
            onDeleteLoteo={(l) => { onDeleteLoteo(l); setSheetLoteo(null); }}
            onOpenLoteoServices={(l) => { onOpenLoteoServices(l); setSheetLoteo(null); }}
            onSafeOpen={onSafeOpen}
          />
        )}
      </RowActionsSheet>
    </div>
  );
}