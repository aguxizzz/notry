import { useState } from 'react';
import { useLotUi } from '../hooks/useLotUi.js';
import { LotFicha, LotFormOverlay } from './LotFicha.jsx';
import { projectWaText } from '../lotFormat.js';
import { hasServices } from '../serviceDefs.js';
import { I } from '../icons/uiIcons.js';
import {
  Ico, IconWhatsApp, WhatsAppLink, Brand, StageSwitch, ViewModeSwitch, LotTabs,
  Legend, ServicesList, SearchField, LotesPane, CercaPane,
} from './LotUi.jsx';

/**
 * Panel lateral del visor en escritorio (prototipo design-lab/leyenda, versión
 * "Panel"): lista de lotes con buscador y filtros, lugares cercanos, datos del
 * proyecto y la ficha del lote, todo en la misma columna. En celular, LotFloat
 * arma lo mismo como piezas flotantes sobre la foto.
 */
export function LotPanel(props) {
  const {
    project, stageName, stages, currentStageId, stageBusy, onSelectStage,
    viewModes, viewMode, onSelectViewMode, services, selectedId, onSelectLot, onHoverLot, onCloseLot,
    onPoiSelect, collapsed, onToggleCollapsed, whatsappPhone, loteoId,
  } = props;
  const [tab, setTab] = useState('lotes');
  const { browser, selected, form, fichaProps } = useLotUi(props);
  const { pois, counts, visibleLots } = browser;

  return (
    <>
      <aside id="lot-panel" className="lp" data-collapsed={collapsed ? '1' : '0'} data-selected={selected ? '1' : '0'} aria-label="Panel del loteo">
        <header className="lp-head">
          <Brand project={project} stageName={stageName} />
          <button type="button" className="lp-icon-btn" onClick={onToggleCollapsed} aria-label="Ocultar panel" title="Ocultar panel"><Ico d={I.prev} /></button>
        </header>

        <div className="lp-nav">
          {(stages.length > 1 || viewModes.length > 1) && (
            <div className="lp-controls">
              {stages.length > 1 && <StageSwitch stages={stages} currentStageId={currentStageId} busy={stageBusy} onSelect={onSelectStage} />}
              {viewModes.length > 1 && <ViewModeSwitch modes={viewModes} value={viewMode} onSelect={onSelectViewMode} />}
            </div>
          )}
          <LotTabs tab={tab} onTab={setTab} lotCount={visibleLots.length} poiCount={pois.length}>
            <button type="button" role="tab" aria-selected={tab === 'proyecto'} onClick={() => setTab('proyecto')}>Proyecto</button>
          </LotTabs>
          {tab === 'lotes' && <SearchField browser={browser} onSelectLot={onSelectLot} />}
        </div>

        <div className="lp-body">
          {tab === 'lotes' && (
            <section className="lp-pane">
              <LotesPane browser={browser} selectedId={selectedId} onSelectLot={onSelectLot} onHoverLot={onHoverLot} />
            </section>
          )}

          {tab === 'cerca' && (
            <section className="lp-pane">
              <CercaPane pois={pois} onPoiSelect={onPoiSelect} />
            </section>
          )}

          {tab === 'proyecto' && (
            <section className="lp-pane">
              {hasServices(services) && (
                <>
                  <h3 className="lp-sub">Servicios</h3>
                  <ServicesList services={services} />
                </>
              )}
              <h3 className="lp-sub">Referencias</h3>
              <Legend counts={counts} />
              {viewModes.includes('satellite') && (
                <>
                  <h3 className="lp-sub">Ubicación</h3>
                  <button type="button" className="lp-btn lp-btn--ghost lp-btn--block" onClick={() => onSelectViewMode('satellite')}><Ico d={I.pin} />Ver en vista satelital</button>
                </>
              )}
            </section>
          )}

          <section className="lp-ficha-wrap" aria-hidden={!selected}>
            {selected && (
              <LotFicha
                key={selectedId}
                {...fichaProps}
                onBack={onCloseLot}
                backLabel={tab === 'cerca' ? 'Lugares cercanos' : 'Todos los lotes'}
              />
            )}
          </section>
          <LotFormOverlay form={form} />
        </div>

        {whatsappPhone && !selected && (
          <footer className="lp-foot">
            <WhatsAppLink
              className="lp-btn lp-btn--wa lp-btn--block"
              phone={whatsappPhone}
              text={projectWaText(project, stageName)}
              loteoId={loteoId}
              track={{ type: 'project' }}
            >
              <IconWhatsApp />Hablar con un asesor
            </WhatsAppLink>
          </footer>
        )}
      </aside>

      <button type="button" className="lp-reopen" data-collapsed={collapsed ? '1' : '0'} onClick={onToggleCollapsed}>
        <Ico d={I.next} /><b>{counts.available}</b> disponibles
      </button>
    </>
  );
}
