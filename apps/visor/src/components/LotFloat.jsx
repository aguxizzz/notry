import { useState, useEffect, useRef } from 'react';
import { useLotUi } from '../hooks/useLotUi.js';
import { FLOAT_SHEET_RATIO } from '../hooks/usePanelLayout.js';
import { LotFicha, LotFormOverlay } from './LotFicha.jsx';
import { projectWaText } from '../lotFormat.js';
import { I } from '../icons/uiIcons.js';
import {
  Ico, IconWhatsApp, WhatsAppLink, Brand, StageSwitch, ViewModeSwitch, LotTabs,
  SearchField, LotesPane, CercaPane,
} from './LotUi.jsx';

/**
 * Celular (prototipo design-lab/leyenda, versión 2 "Flotante", en claro):
 * marca y etapas arriba, buscador abajo con el contador que despliega la lista,
 * botón de WhatsApp y la ficha del lote como hoja inferior.
 */
export function LotFloat(props) {
  const {
    project, stageName, stages, currentStageId, stageBusy, onSelectStage,
    viewModes, viewMode, onSelectViewMode, selectedId, onSelectLot, onCloseLot, onPoiSelect,
    whatsappPhone, loteoId, compass = null,
  } = props;
  const [tab, setTab] = useState('lotes');
  const [listOpen, setListOpen] = useState(false);
  const { browser, selected, form, fichaProps } = useLotUi(props);
  const { pois, counts, visibleLots, filtersActive } = browser;
  const sheetRef = useRef(null);

  // Abrir un lote cierra la lista.
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    if (selectedId) setListOpen(false);
  }

  // La ficha de cada lote arranca desde arriba.
  useEffect(() => {
    if (selectedId) sheetRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  useEffect(() => {
    if (!listOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setListOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listOpen]);

  const pickLot = (id) => { setListOpen(false); onSelectLot(id); };
  const pickPoi = (id) => { setListOpen(false); onPoiSelect(id); };
  const backToList = () => { onCloseLot(); setListOpen(true); };
  const shown = filtersActive ? visibleLots.length : counts.available;

  return (
    <div id="lot-float" className="lf" data-list={listOpen ? '1' : '0'} data-selected={selected ? '1' : '0'} style={{ '--lf-sheet': `${FLOAT_SHEET_RATIO * 100}dvh` }}>
      <header className="lf-top lf-glass">
        <div className="lf-top-row">
          <Brand project={project} stageName={stageName} showStage={stages.length <= 1} />
          {stages.length > 1 && <StageSwitch className="lf-stages" stages={stages} currentStageId={currentStageId} busy={stageBusy} onSelect={onSelectStage} />}
        </div>
        {viewModes.length > 1 && <ViewModeSwitch className="lf-modes" modes={viewModes} value={viewMode} onSelect={onSelectViewMode} withIcons />}
        {compass}
      </header>

      {listOpen && <button type="button" className="lf-scrim" aria-label="Cerrar lista" tabIndex={-1} onClick={() => setListOpen(false)} />}

      <div className="lf-dock">
        <section id="lf-results" className="lf-results lf-glass" aria-label="Lotes y lugares" aria-hidden={!listOpen}>
          <LotTabs className="lf-tabs" tab={tab} onTab={setTab} lotCount={visibleLots.length} poiCount={pois.length}>
            <button type="button" className="lp-icon-btn lf-close" onClick={() => setListOpen(false)} aria-label="Cerrar lista"><Ico d={I.close} /></button>
          </LotTabs>
          <div className="lf-pane">
            {tab === 'cerca'
              ? <CercaPane pois={pois} onPoiSelect={pickPoi} />
              : <LotesPane browser={browser} selectedId={selectedId} onSelectLot={pickLot} />}
          </div>
        </section>

        <div className="lf-bar lf-glass">
          <SearchField browser={browser} onSelectLot={pickLot} onFocus={() => { setTab('lotes'); setListOpen(true); }} className="lf-search" />
          <button
            type="button"
            className="lf-count"
            aria-expanded={listOpen}
            aria-controls="lf-results"
            aria-label={listOpen ? 'Cerrar lista de lotes' : `Ver lista de lotes (${shown} ${filtersActive ? 'resultados' : 'disponibles'})`}
            onClick={() => setListOpen((v) => !v)}
          >
            <i className="lp-dot s-available" /><b>{shown}</b><Ico d={I.up} />
          </button>
        </div>
      </div>

      {whatsappPhone && (
        <WhatsAppLink
          className="lf-fab"
          phone={whatsappPhone}
          text={projectWaText(project, stageName)}
          loteoId={loteoId}
          track={{ type: 'project' }}
          aria-label="Consultar por WhatsApp"
        >
          <IconWhatsApp />
        </WhatsAppLink>
      )}

      <section ref={sheetRef} className="lf-sheet lf-glass" data-form={form.showForm ? '1' : '0'} aria-hidden={!selected}>
        <span className="lf-grab" aria-hidden="true" />
        {selected && (
          <LotFicha
            key={selectedId}
            {...fichaProps}
            onBack={backToList}
            backLabel="Ver lotes"
            onClose={onCloseLot}
          />
        )}
        <LotFormOverlay form={form} />
      </section>
    </div>
  );
}
