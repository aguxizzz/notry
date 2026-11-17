// Encabezado de la tabla de Inventario, en una sola fila: selector Lotes/Loteos
// (con su cantidad) + búsqueda + filtro.
// La acción primaria vive en PageHeader para mantener la jerarquía de página.

import { DataToolbar, Loader, SearchField, SegmentedControl, Select } from '../../ui/components';
import './InventarioControls.css';

const TABS = [
  { key: 'lotes', label: 'Lotes' },
  { key: 'loteos', label: 'Loteos' },
];

function TabLabel({ label, count }) {
  return (
    <>
      {label}
      <span className="inv-tab-count">{count}</span>
    </>
  );
}

export default function InventarioControls({
  inventoryTab,
  onTabChange,
  lotsCount,
  loteosCount,
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
  const counts = { lotes: lotsCount, loteos: loteosCount };
  const loading = inventoryTab === 'lotes'
    ? inventoryLoading || syncLoading
    : syncLoading || inventoryLoteosLoading;

  return (
    <DataToolbar className="inventory-controls inv-toolbar">
      {isVisorOnly ? (
        <h2 className="inv-tabs-title">
          <TabLabel label="Lotes" count={lotsCount} />
        </h2>
      ) : (
        <SegmentedControl
          className="inv-view-switch"
          ariaLabel="Ver tabla de"
          value={inventoryTab}
          onChange={onTabChange}
          options={TABS.map(tab => ({
            value: tab.key,
            label: <TabLabel label={tab.label} count={counts[tab.key]} />,
          }))}
        />
      )}

      <div className="inv-toolbar-tools">
        {loading && <Loader size="sm" />}
        {inventoryTab === 'lotes' ? (
          <>
            <SearchField
              id="inventory-lots-search"
              ariaLabel="Buscar lotes"
              placeholder="Buscar lote…"
              value={inventorySearch}
              onChange={event => onSearchChange(event.target.value)}
            />
            <Select
              id="inventory-loteo-filter"
              className="inv-loteo-filter"
              size="sm"
              value={inventoryLoteoFilter}
              onChange={e => onLoteoFilterChange(e.target.value)}
              options={loteoFilterOptions}
            />
          </>
        ) : (
          <SearchField
            id="inventory-developments-search"
            ariaLabel="Buscar loteos"
            placeholder="Buscar loteo…"
            value={inventoryLoteosSearch}
            onChange={event => onLoteosSearchChange(event.target.value)}
          />
        )}
      </div>
    </DataToolbar>
  );
}
