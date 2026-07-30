import { useMemo, useState } from 'react';

// Ordena `data` según un mapa de accessors { key: row => valor }.
// Reglas comunes a todas las tablas: valores vacíos (null/NaN) siempre al final,
// strings con localeCompare es-numeric, números por resta. Dirección asc/desc.
export function sortRows(data, sort, accessors) {
  const accessor = accessors[sort.key];
  if (!accessor) return data;
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...data].sort((a, b) => {
    const va = accessor(a);
    const vb = accessor(b);
    const aNull = va == null || (typeof va === 'number' && Number.isNaN(va));
    const bNull = vb == null || (typeof vb === 'number' && Number.isNaN(vb));
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    if (typeof va === 'string') return va.localeCompare(vb, 'es', { numeric: true }) * dir;
    return (va - vb) * dir;
  });
}

// Sort + paginación client-side para tablas (el /sync ya trae todo el dataset).
// `rows` es el conjunto ya filtrado; `accessors` el mapa de columnas ordenables.
// Devuelve el estado de orden y los datos derivados de la página actual.
export function useTableSort(rows, accessors, { perPage = 10 } = {}) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => sortRows(rows, sort, accessors), [rows, sort, accessors]);

  // Volver a la primera página cuando cambia el conjunto (filtro/búsqueda/datos):
  // reset en fase de render (patrón recomendado por React, sin efecto).
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageData = useMemo(
    () => sorted.slice((safePage - 1) * perPage, safePage * perPage),
    [sorted, safePage, perPage]
  );
  // Reservar el alto de las filas faltantes para que el pager no salte en la
  // última página. Solo cuando hay paginación (más de una página).
  const fillerRows = totalPages > 1 ? perPage - pageData.length : 0;

  const handleSort = (key) => {
    setPage(1); // el nuevo orden arranca desde la primera página
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  return {
    sort,
    handleSort,
    sorted,       // lista ordenada completa (útil para ubicar una fila puntual)
    pageData,
    fillerRows,
    page: safePage,
    setPage,
    totalPages,
    total: sorted.length,
    perPage,
  };
}
