import React from 'react';
import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

// <th> ordenable para .inventory-table. El estilo vive en ui/components/table.css
// (base) y puede afinarse por shell (.inventario-shell / .clientes-shell).
export default function SortHeader({ label, sortKey, sort, onSort, className = '' }) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className={`th-sortable${active ? ' is-sorted' : ''}${className ? ` ${className}` : ''}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="th-sort-btn" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {active
          ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)
          : <ChevronsUpDown size={13} className="th-sort-idle" />}
      </button>
    </th>
  );
}
