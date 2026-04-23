import { useCallback } from 'react';

export default function TopLotsPanel({ topLots, maxClicks, topLotsFocusedIdx, onFocusChange }) {
  const handleKeyDown = useCallback((e, index) => {
    if (topLots.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      onFocusChange(Math.min(index + 1, topLots.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onFocusChange(Math.max(index - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onFocusChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onFocusChange(topLots.length - 1);
    }
  }, [topLots.length, onFocusChange]);

  const lotCount = topLots.length;

  return (
    <div className="top-lots-panel" role="region" aria-label="Ranking de lotes">
      <div className="top-lots-header">
        <span className="top-lots-title">Ranking lotes</span>
        <span className="top-lots-subtitle">Top 10</span>
      </div>
      <div
        className="top-lots-list"
        style={{ '--lot-count': lotCount }}
        role="listbox"
        aria-label="Ranking de lotes, usa flechas arriba y abajo para navegar"
      >
        {topLots.length === 0 ? (
          <p className="top-lots-empty">Sin datos disponibles</p>
        ) : (
          topLots.map((item, i) => (
            <div
              key={item.lote_uuid}
              role="option"
              tabIndex={topLotsFocusedIdx === i ? 0 : -1}
              aria-selected={topLotsFocusedIdx === i}
              aria-label={`${item.name}, ${item.clicks} clics, posición ${i + 1}`}
              className="top-lot-row"
              onClick={() => onFocusChange(i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onFocus={() => onFocusChange(i)}
            >
              <div className="top-lot-rank">{String(i + 1).padStart(2, '0')}</div>
              <div className="top-lot-info">
                <span className="top-lot-name">{item.name}</span>
                <div className="top-lot-bar-track">
                  <div
                    className="top-lot-bar-fill"
                    style={{
                      width: `${maxClicks > 0 ? (item.clicks / maxClicks) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="top-lot-clicks">{item.clicks.toLocaleString('es-AR')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}