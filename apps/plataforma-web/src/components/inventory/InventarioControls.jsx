// Toolbar de la tabla de Inventario: tabs Lotes/Loteos + búsqueda + filtros.
// La acción primaria vive en PageHeader para mantener la jerarquía de página.

import { SlidersHorizontal } from 'lucide-react';
import { DataToolbar, Loader, SearchField, Select } from '../../ui/components';
import './InventarioControls.css';

export default function InventarioControls({
  inventoryTab,
  onTabChange,
  inventorySearch,
  onSearchChange,
  inventoryLoteosSearch,
  onLoteosSearchChange,
  inventoryLoteoFilter,
  onLoteoFilterChange,
  inventoryLoteos,
  inventoryLoading,
  syncLoading,
  inventoryLoteosLoading,
  isVisorOnly = false,
}) {
  const loteoFilterOptions = [
    { value: '', label: 'Loteo: Todos' },
    ...(inventoryLoteos || []).map(loteo => ({ value: String(loteo.id), label: loteo.name })),
  ];
  return (
    <DataToolbar className="inventory-controls inv-toolbar">
      {!isVisorOnly && (
        <div className="inv-seg" role="tablist" aria-label="Ver tabla de">
          <button
            type="button"
            role="tab"
            aria-selected={inventoryTab === 'lotes'}
            className={inventoryTab === 'lotes' ? 'on' : ''}
            onClick={() => onTabChange('lotes')}
          >
            Lotes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inventoryTab === 'loteos'}
            className={inventoryTab === 'loteos' ? 'on' : ''}
            onClick={() => onTabChange('loteos')}
          >
            Loteos
          </button>
        </div>
      )}

      {inventoryTab === 'lotes' ? (
        <>
          <SearchField
            id="inventory-lots-search"
            ariaLabel="Buscar lotes"
            placeholder="Buscar por nombre…"
            value={inventorySearch}
            onChange={event => onSearchChange(event.target.value)}
          />
          <div className="inventory-filters">
            <SlidersHorizontal size={16} className="filter-icon" />
            <Select
              id="inventory-loteo-filter"
              value={inventoryLoteoFilter}
              onChange={e => onLoteoFilterChange(e.target.value)}
              options={loteoFilterOptions}
            />
          </div>
          <div className="loader-container small">
            {(inventoryLoading || syncLoading) && <Loader size="sm" />}
          </div>
        </>
      ) : (
        <>
          <SearchField
            id="inventory-developments-search"
            ariaLabel="Buscar loteos"
            placeholder="Buscar por nombre…"
            value={inventoryLoteosSearch}
            onChange={event => onLoteosSearchChange(event.target.value)}
          />
          <div className="loader-container small">
            {(syncLoading || inventoryLoteosLoading) && <Loader size="sm" />}
          </div>
        </>
      )}
    </DataToolbar>
  );
}
