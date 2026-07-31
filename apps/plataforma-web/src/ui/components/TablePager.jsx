import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// Ventana de páginas con elipsis: primera, última, actual ± 1.
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...wanted].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push(`gap-${p}`);
    out.push(p);
    prev = p;
  }
  return out;
}

// Pager client-side para .inventory-table. Estilo base en ui/components/table.css.
export default function TablePager({ page, totalPages, total, perPage, onPage }) {
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="table-pager">
      <span className="table-pager-info">
        {from}–{to} de {total}
      </span>
      <div className="table-pager-ctrls">
        <button
          type="button"
          className="table-pager-btn"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        {pageWindow(page, totalPages).map(p =>
          typeof p === 'number' ? (
            <button
              key={p}
              type="button"
              className={`table-pager-num${p === page ? ' is-active' : ''}`}
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          ) : (
            <span key={p} className="table-pager-gap">…</span>
          )
        )}
        <button
          type="button"
          className="table-pager-btn"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Página siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
