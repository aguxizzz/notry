import { useRef, useState } from 'react';
import { ArrowRight, Check, Globe, ImagePlus, Map as MapIcon, RotateCcw, Trash2, X } from 'lucide-react';
import { Field, InspectorShell, LotShape, NumberInput, Section, StatusPicker } from './inspector/InspectorUI';
import { ACCEPTED_IMAGES, statusColor, useImageUpload } from './inspector/inspectorUtils';

export default function LoteInspector({
  selectedMarker,
  onUpdateSelected,
  homography,
  onImportFromBlueprint,
  onRemoveFromPanorama,
  onRemoveFromView,
  onDeleteLot,
  onClose,
  editorMode,
  uploadFn,
}) {
  const name     = selectedMarker.tooltip || '';
  const status   = selectedMarker.status || selectedMarker.estado || 'available';
  const price    = selectedMarker.price != null ? String(selectedMarker.price) : (selectedMarker.precio != null ? String(selectedMarker.precio) : '');
  const area     = selectedMarker.area_m2 != null ? String(selectedMarker.area_m2) : (selectedMarker.area != null ? String(selectedMarker.area) : '');
  const comments = selectedMarker.comments || '';
  const images   = selectedMarker.image_urls || [];
  const loteSlug = selectedMarker.slug || selectedMarker.uuid || selectedMarker.id;

  const blueprintVertices = selectedMarker.blueprint_coordinates?.length ?? 0;
  const panoramaVertices = selectedMarker.panorama_coordinates?.length ?? 0;
  const inBlueprint = blueprintVertices >= 3;
  const inPanorama = panoramaVertices > 0;
  const canProject = !!homography && inBlueprint;
  const onBlueprintView = editorMode === 'blueprint';

  const [justProjectedId, setJustProjectedId] = useState(null);
  const justProjected = justProjectedId === selectedMarker.id;
  const project = () => {
    const projectedId = selectedMarker.id;
    onImportFromBlueprint();
    setJustProjectedId(projectedId);
    setTimeout(() => setJustProjectedId(current => (current === projectedId ? null : current)), 2000);
  };

  const fileInputRef = useRef(null);
  const { upload, uploading, error: uploadError } = useImageUpload(uploadFn);
  const addPhoto = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const url = await upload(file, `lotes/${loteSlug}`);
    if (url) onUpdateSelected('image_urls', [...images, url]);
  };

  const ppm = Number(price) > 0 && Number(area) > 0 ? Math.round(Number(price) / Number(area)) : null;

  return (
    <InspectorShell
      media={<LotShape coords={onBlueprintView ? selectedMarker.blueprint_coordinates : selectedMarker.panorama_coordinates} size={44} color={statusColor(status)} />}
      title={(
        <input
          className="ins-title-input"
          value={name}
          onChange={e => onUpdateSelected('tooltip', e.target.value)}
          placeholder="Ej: Lote 07"
          aria-label="Nombre del lote"
        />
      )}
      subtitle={selectedMarker.slug || 'Lote guardado'}
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            className="editor-btn editor-btn--ghost ins-foot__block"
            onClick={onRemoveFromView}
            title={`Lo saca de la vista ${onBlueprintView ? 'Plano' : 'Panorama'}. El lote y su ubicación en la otra vista quedan. Se deshace con Ctrl+Z (Supr)`}
          >
            Quitar del {onBlueprintView ? 'plano' : 'panorama'}
          </button>
          <button
            type="button"
            className="editor-btn editor-btn--danger-ghost"
            onClick={onDeleteLot}
            title="Borra el lote de la base de datos. No se puede deshacer"
          >
            <Trash2 size={15} /> Eliminar
          </button>
        </>
      )}
    >
      <Section label="Estado">
        <StatusPicker value={status} onChange={value => onUpdateSelected('status', value)} />
      </Section>

      <Section label="Comercial">
        <div className="ins-grid2">
          <Field label="Precio" htmlFor="lote-price" prefix="USD">
            <NumberInput
              id="lote-price"
              value={price}
              onChange={value => onUpdateSelected('price', value)}
              onBlur={() => { if (price === '') onUpdateSelected('price', 0); }}
              placeholder="0"
            />
          </Field>
          <Field label="Superficie" htmlFor="lote-area" suffix="m²">
            <NumberInput
              id="lote-area"
              value={area}
              onChange={value => onUpdateSelected('area_m2', value)}
              onBlur={() => { if (area === '') onUpdateSelected('area_m2', 0); }}
              placeholder="0"
            />
          </Field>
        </div>
        {ppm != null && (
          <div className="ins-derived"><span>USD <b>{ppm.toLocaleString('es-AR')}</b> por m²</span></div>
        )}
      </Section>

      <Section label="Ubicación">
        <div className="ins-where">
          <div className={`ins-where__row${inBlueprint ? '' : ' is-missing'}`}>
            <span className="ins-where__icon"><MapIcon size={16} /></span>
            <span className="ins-where__text">
              <strong>Plano {onBlueprintView && <em>esta vista</em>}</strong>
              <small className={inBlueprint ? 'is-ok' : 'is-warn'}>
                {inBlueprint ? `Ubicado · ${blueprintVertices} vértices` : 'Sin dibujar'}
              </small>
            </span>
          </div>

          <div className={`ins-where__row${inPanorama ? '' : ' is-missing'}`}>
            <span className="ins-where__icon"><Globe size={16} /></span>
            <span className="ins-where__text">
              <strong>Panorama {!onBlueprintView && <em>esta vista</em>}</strong>
              <small className={inPanorama ? 'is-ok' : 'is-warn'}>
                {inPanorama
                  ? `Ubicado · ${panoramaVertices} vértices`
                  : canProject ? 'Sin ubicar' : inBlueprint ? 'Sin ubicar · falta calibrar' : 'Sin ubicar'}
              </small>
            </span>
            <span className="ins-where__actions">
              {inPanorama ? (
                <>
                  {canProject && (
                    <button
                      type="button"
                      className="ins-icon-mini"
                      onClick={project}
                      aria-label="Reproyectar con la calibración actual"
                      title="Reproyectar con la calibración actual"
                    >
                      {justProjected ? <Check size={14} /> : <RotateCcw size={14} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ins-icon-mini"
                    onClick={onBlueprintView ? onRemoveFromPanorama : onRemoveFromView}
                    aria-label="Quitar del panorama"
                    title="Saca el lote del panorama. El lote y su polígono del plano quedan. Se deshace con Ctrl+Z"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : canProject && (
                <button
                  type="button"
                  className="ins-mini ins-mini--primary"
                  onClick={project}
                  title="Proyecta el polígono del plano con la calibración actual"
                >
                  <ArrowRight size={13} /> Proyectar
                </button>
              )}
            </span>
          </div>
        </div>
      </Section>

      <Section label="Fotos" aside={images.length ? `${images.length}` : null}>
        <div className="ins-photos">
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="ins-photo">
              <img src={url} alt={`Foto ${index + 1} de ${name || 'el lote'}`} loading="lazy" />
              <button
                type="button"
                className="ins-photo__remove"
                aria-label={`Quitar foto ${index + 1}`}
                onClick={() => onUpdateSelected('image_urls', images.filter((_, i) => i !== index))}
              >
                <X size={12} strokeWidth={2.6} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ins-photo ins-photo--add"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <ImagePlus size={17} />
            <span>{uploading ? 'Subiendo…' : 'Agregar'}</span>
          </button>
          <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGES} hidden onChange={addPhoto} />
        </div>
        {uploadError && <p className="ins-error">{uploadError}</p>}
      </Section>

      <Section label="Observaciones">
        <Field label="Notas" htmlFor="lote-comments">
          <textarea
            id="lote-comments"
            rows={3}
            value={comments}
            onChange={e => onUpdateSelected('comments', e.target.value)}
            placeholder="Ej: lote con servidumbre de paso"
          />
        </Field>
      </Section>
    </InspectorShell>
  );
}
