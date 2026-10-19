import { MousePointerClick, Trash2 } from 'lucide-react';
import POIInspector from './POIInspector';
import PendingPolygonInspector from './PendingPolygonInspector';
import LoteInspector from './LoteInspector';
import TextInspector from './TextInspector';
import { Field, InspectorShell, Section } from './inspector/InspectorUI';
import { hasLocationIn } from '../utils/annotationModel';

export default function InspectorPanel({
  inspectorOpen,
  onClose,
  annotations,
  selectedMarker,
  mode,
  homography,
  onImportFromBlueprint,
  onDelete,
  onDeleteLot,
  onRemoveFromPanorama,
  updateSelected,
  updateNestedSelected,
  // Lot — pending
  pendingMode, onPendingModeChange,
  isCreatingLote, onCreateLote,
  assignTargetId, onAssignTargetChange,
  isAssigning, onAssign,
  // POI
  siblingStages, onPoiFieldChange,
  uploadFn,
}) {
  // Lotes existentes sin geometría en esta vista: candidatos para "Asignar existente".
  const lotsWithEmptyCoords = annotations.filter(a =>
    a.type === 'polygon' && !a.pending && a.uuid && !hasLocationIn(a, mode)
  );

  let content;
  if (!selectedMarker) {
    content = (
      <div className="ins-empty">
        <span className="ins-empty__icon"><MousePointerClick size={20} /></span>
        <strong>Nada seleccionado</strong>
        <p>Hacé clic en un lote, lugar o texto para editarlo, o elegí una herramienta para dibujar uno nuevo.</p>
      </div>
    );
  } else if (selectedMarker.type === 'polygon' && selectedMarker.pending) {
    content = (
      <PendingPolygonInspector
        pendingMode={pendingMode}
        onPendingModeChange={onPendingModeChange}
        selectedMarker={selectedMarker}
        onUpdateSelected={updateSelected}
        isCreatingLote={isCreatingLote}
        onCreateLote={onCreateLote}
        lotsWithEmptyCoords={lotsWithEmptyCoords}
        assignTargetId={assignTargetId}
        onAssignTargetChange={onAssignTargetChange}
        isAssigning={isAssigning}
        onAssign={onAssign}
        onDiscard={onDelete}
        onClose={onClose}
        annotations={annotations}
        editorMode={mode}
      />
    );
  } else if (selectedMarker.type === 'polygon') {
    content = (
      <LoteInspector
        selectedMarker={selectedMarker}
        onUpdateSelected={updateSelected}
        homography={homography}
        onImportFromBlueprint={onImportFromBlueprint}
        onRemoveFromPanorama={onRemoveFromPanorama}
        onRemoveFromView={onDelete}
        onDeleteLot={onDeleteLot}
        onClose={onClose}
        editorMode={mode}
        uploadFn={uploadFn}
      />
    );
  } else if (selectedMarker.type === 'poi') {
    content = (
      <POIInspector
        key={selectedMarker.id}
        poi={selectedMarker}
        onDelete={onDelete}
        onClose={onClose}
        siblingStages={siblingStages}
        onFieldChange={onPoiFieldChange}
        uploadFn={uploadFn}
      />
    );
  } else if (selectedMarker.type === 'text') {
    content = (
      <TextInspector
        marker={selectedMarker}
        onUpdate={updateSelected}
        onDelete={onDelete}
        onClose={onClose}
      />
    );
  } else {
    // Otros marcadores (sin inspector propio): datos y estilo SVG crudos.
    content = (
      <InspectorShell
        title={selectedMarker.type}
        subtitle={selectedMarker.id}
        onClose={onClose}
        footer={(
          <button type="button" className="editor-btn editor-btn--danger-ghost ins-foot__block" onClick={onDelete}>
            <Trash2 size={15} /> Borrar <kbd>Supr</kbd>
          </button>
        )}
      >
        <Section label="Datos">
          <Field label="ID" htmlFor="marker-id"><input id="marker-id" value={selectedMarker.id} onChange={e => updateSelected('id', e.target.value)} /></Field>
          <Field label="Tooltip" htmlFor="marker-tooltip"><input id="marker-tooltip" value={selectedMarker.tooltip || ''} onChange={e => updateSelected('tooltip', e.target.value)} /></Field>
          <Field label="Precio" htmlFor="marker-precio"><input id="marker-precio" value={selectedMarker.precio || ''} onChange={e => updateSelected('precio', e.target.value)} /></Field>
          <Field label="Área" htmlFor="marker-area"><input id="marker-area" value={selectedMarker.area || ''} onChange={e => updateSelected('area', e.target.value)} /></Field>
        </Section>
        <Section label="Estilo SVG">
          <Field label="Relleno (fill)" htmlFor="marker-fill">
            <input
              id="marker-fill"
              value={selectedMarker.svgStyle?.fill || selectedMarker.style?.backgroundColor || ''}
              onChange={e => { updateNestedSelected('svgStyle', 'fill', e.target.value); updateNestedSelected('style', 'backgroundColor', e.target.value); }}
              placeholder="rgba(0,0,0,0.5)"
            />
          </Field>
          <Field label="Borde (stroke)" htmlFor="marker-stroke">
            <input
              id="marker-stroke"
              value={selectedMarker.svgStyle?.stroke || selectedMarker.style?.borderColor || ''}
              onChange={e => { updateNestedSelected('svgStyle', 'stroke', e.target.value); updateNestedSelected('style', 'borderColor', e.target.value); }}
            />
          </Field>
        </Section>
      </InspectorShell>
    );
  }

  return (
    <div className={`inspector-pane${inspectorOpen ? ' open' : ''}`}>
      {content}
    </div>
  );
}
