import { useCallback } from 'react';
import BlueprintHeatmap from '../BlueprintHeatmap';
import { Loader } from '../../ui/components';
import { getHeatColor, getHeatGradient, getTextColor } from '../../utils/heatColor';
import './HeatmapCard.css';

export default function HeatmapCard({
  selectedLoteo,
  visorData,
  clicksData,
  shouldShowBlueprint,
  annotationsWithCoords,
  missingCoordinatesCount,
  heatmapFocusedIdx,
  onFocusChange,
  isLoading = false,
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
        <div className="heatmap-heading">
          <span className="heatmap-kicker">Mapa de calor</span>
          <h3 className="heatmap-title">{selectedLoteo?.name ?? 'Selecciona un loteo'}</h3>
        </div>
        <div className="heatmap-legend" aria-label="Escala de clics: de menor a mayor intensidad">
          <span className="legend-label">Menor</span>
          <span
            className="legend-gradient"
            aria-hidden="true"
            style={{ backgroundImage: getHeatGradient() }}
          />
          <span className="legend-label">Mayor</span>
        </div>
      </div>

      {isLoading ? (
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
          loteoName={selectedLoteo?.name}
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
