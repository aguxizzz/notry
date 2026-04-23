import { useCallback } from 'react';
import BlueprintHeatmap from '../BlueprintHeatmap';
import { Loader } from '../../ui/components';
import { getHeatColor, getTextColor } from '../../utils/heatColor';

export default function HeatmapCard({
  selectedLoteo,
  visorData,
  clicksData,
  shouldShowBlueprint,
  annotationsWithCoords,
  missingCoordinatesCount,
  heatmapFocusedIdx,
  onFocusChange,
}) {
  const handleCellKeyDown = useCallback((e, index) => {
    if (clicksData.length === 0) return;
    const cols = Math.min(clicksData.length, 6);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onFocusChange(Math.min(index + 1, clicksData.length - 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onFocusChange(Math.max(index - 1, 0));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onFocusChange(Math.min(index + cols, clicksData.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onFocusChange(Math.max(index - cols, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onFocusChange(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      onFocusChange(clicksData.length - 1);
    }
  }, [clicksData.length, onFocusChange]);

  const maxClicks = clicksData.reduce((m, d) => Math.max(m, d.clicks), 0);

  return (
    <div className="heatmap-card">
      <div className="heatmap-header">
        <span className="heatmap-title">
          Mapa de calor — {selectedLoteo?.name ?? 'Selecciona un loteo'}
        </span>
        <div className="heatmap-legend">
          <span className="legend-label">Menos</span>
          <div className="legend-gradient"></div>
          <span className="legend-label">Más</span>
        </div>
      </div>

      {!visorData && !clicksData.length ? (
        <div className="heatmap-loading">
          <Loader />
        </div>
      ) : clicksData.length === 0 ? (
        <p className="heatmap-empty">Sin datos de clics para este loteo.</p>
      ) : shouldShowBlueprint ? (
        <BlueprintHeatmap
          blueprintUrl={visorData.blueprintUrl}
          annotations={annotationsWithCoords}
          clicksData={clicksData}
          missingCoordinatesCount={missingCoordinatesCount}
        />
      ) : (
        <div
          className="heatmap-grid"
          role="grid"
          aria-label={`Mapa de calor de ${selectedLoteo?.name ?? 'loteo'}, usa flechas para navegar`}
        >
          {clicksData.map((item, i) => {
            const bg = getHeatColor(item.clicks, maxClicks);
            const fg = getTextColor(item.clicks, maxClicks);
            return (
              <div
                key={item.lote_uuid}
                role="gridcell"
                tabIndex={heatmapFocusedIdx === i ? 0 : -1}
                aria-label={`${item.name}, ${item.clicks} clics`}
                className="heatmap-cell"
                style={{ background: bg, color: fg }}
                onClick={() => onFocusChange(i)}
                onKeyDown={(e) => handleCellKeyDown(e, i)}
                onFocus={() => onFocusChange(i)}
              >
                <span className="cell-id">{item.name}</span>
                <span className="cell-clicks">{item.clicks}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}