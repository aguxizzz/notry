import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { POI_ICON_MARKERS } from '../icons/poiIcons';
import './PoiPanel.css';

// Ficha de un punto de interés (los lotes tienen la suya en LotPanel/LotFloat).
// Los ids #info-* son los del modal en index.css.

const IconLink = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);

const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconDistance = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

const formatDistance = (value, unit) => {
  if (value == null || value === '') return '';
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  const rounded = Number.isInteger(num) ? num : Math.round(num * 10) / 10;
  return unit === 'min' ? `${rounded} min en auto` : `${rounded} km`;
};

/** `poi`: ficha armada con poiFromAnnotation (annotations.js); null = cerrada. */
export function PoiPanel({ poi, onClose, onGoToStage }) {
  const isOpen = Boolean(poi);
  // Al cerrar, el contenido queda congelado mientras dura la animación de
  // salida (#info-backdrop pierde .visible y se desvanece).
  const [lastPoi, setLastPoi] = useState(poi);
  if (poi && poi !== lastPoi) setLastPoi(poi);
  const shown = poi ?? lastPoi;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Solo el poi_kind "perspective" abre la foto a pantalla completa al click;
  // "place" (default) muestra el thumbnail en el marker y el panel de texto.
  const isPhotoPoi = Boolean(shown?.image_url) && shown?.poi_kind === 'perspective';
  const distance = formatDistance(shown?.distance_value, shown?.distance_unit);

  return (
    <div
      id="info-backdrop"
      className={isOpen ? 'visible' : ''}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div id="info-panel-wrap">
        <div id="info-panel" className={isPhotoPoi ? 'info-panel-photo' : undefined} role="dialog" aria-modal="true" aria-live="polite">
          <header id="info-panel-header">
            <div id="info-panel-header-left" />
            <div id="info-panel-header-center">
              <span id="info-panel-lot-title">{shown?.title}</span>
            </div>
            <div id="info-panel-header-right">
              <button type="button" id="info-panel-close" aria-label="Cerrar" onClick={onClose}>
                <span className="sr-only">Cerrar</span>
                <IconClose />
              </button>
            </div>
          </header>

          {shown && (
            <div id="info-panel-content">
              <div id="info-panel-view">
                {isPhotoPoi ? (
                  <figure className="poi-photo-view">
                    <img src={shown.image_url} alt={shown.title || 'Foto del lugar'} />
                  </figure>
                ) : (
                  <>
                    <div className="poi-header">
                      {shown.icon_type && POI_ICON_MARKERS[shown.icon_type] && (
                        <div className="poi-icon-wrap" style={{ background: shown.color }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d={POI_ICON_MARKERS[shown.icon_type]} />
                          </svg>
                        </div>
                      )}
                      <div className="poi-header-text">
                        <span className="poi-label">Punto de interés</span>
                        {shown.icon_type && (
                          <span className="poi-type-tag">{shown.icon_type}</span>
                        )}
                      </div>
                    </div>
                    {distance && (
                      <div className="poi-distance">
                        <IconDistance />
                        <span>{distance}</span>
                      </div>
                    )}
                    {shown.content && (
                      <div id="info-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(shown.content) }} />
                    )}
                    {shown.target_loteo_id && onGoToStage ? (
                      <div id="info-actions">
                        <button
                          type="button"
                          className="poi-link-btn"
                          onClick={() => onGoToStage(shown.target_loteo_id)}
                        >
                          <IconLink />
                          {shown.target_stage_name ? `Ir a ${shown.target_stage_name}` : 'Ir a la etapa'}
                        </button>
                      </div>
                    ) : shown.link_url ? (
                      <div id="info-actions">
                        <a href={shown.link_url} target="_self" className="poi-link-btn">
                          <IconLink />
                          Visitar enlace
                        </a>
                      </div>
                    ) : !shown.content ? (
                      <div className="poi-empty-state">Sin información adicional.</div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
