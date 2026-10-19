import { createElement, useRef, useState } from 'react';
import {
  DoorOpen, Dumbbell, Waves, Car, Utensils, ShoppingBag,
  Eye, TreePine, Landmark, HelpCircle, Check, ImagePlus, Info, Layers, Link2, MapPin, RefreshCw, Trash2,
} from 'lucide-react';
import { Field, IconTile, InspectorShell, Section, Segmented, Slider, Swatches } from './inspector/InspectorUI';
import { ACCEPTED_IMAGES, useImageUpload } from './inspector/inspectorUtils';

const POI_ICON_OPTIONS = [
  { value: 'entrance',    Icon: DoorOpen,    label: 'Entrada' },
  { value: 'gym',         Icon: Dumbbell,    label: 'Gimnasio' },
  { value: 'pool',        Icon: Waves,       label: 'Piscina' },
  { value: 'parking',     Icon: Car,         label: 'Estacionamiento' },
  { value: 'restaurant',  Icon: Utensils,    label: 'Restaurante' },
  { value: 'shop',        Icon: ShoppingBag, label: 'Compras' },
  { value: 'view',        Icon: Eye,         label: 'Vista' },
  { value: 'park',        Icon: TreePine,    label: 'Parque' },
  { value: 'landmark',    Icon: Landmark,    label: 'Punto clave' },
  { value: 'other',       Icon: HelpCircle,  label: 'Otro' },
];

// Texto libre (el visor lo muestra tal cual bajo el nombre en "Cerca");
// estas son solo sugerencias.
const POI_CATEGORY_SUGGESTIONS = [
  'Colegio', 'Supermercado', 'Hospital', 'Farmacia', 'Club', 'Plaza',
  'Gimnasio', 'Restaurante', 'Shopping', 'Estación de servicio', 'Banco', 'Transporte',
];

const POI_COLORS = ['#14b8a6', '#c5a059', '#4f82e9', '#f472b6', '#a78bfa', '#22c55e', '#ef4444', '#ffffff'];

// La vista previa dibuja la línea a la mitad de su alto real en el visor.
const STEM_PREVIEW_SCALE = 0.5;

export default function POIInspector({
  poi,
  onDelete,
  onClose,
  siblingStages = [],
  onFieldChange,
  uploadFn,
}) {
  const isPending = poi.pending === true;

  const form = {
    title: poi.tooltip || '',
    icon_type: poi.icon_type || '',
    description: poi.description || '',
    link_url: poi.link_url || '',
    image_url: poi.image_url || '',
    color: poi.color || '#14b8a6',
    target_loteo_id: poi.target_loteo_id || '',
    callout_stem_height: poi.callout_stem_height ?? 96,
    poi_kind: poi.poi_kind || 'place',
    distance_value: poi.distance_value ?? '',
    distance_unit: poi.distance_unit || 'km',
    category: poi.category || '',
  };

  const handleChange = (field, value) => {
    onFieldChange?.(field, value);
  };

  // "Al tocarlo" es una sola elección; se guarda como target_loteo_id o
  // link_url. El estado local deja elegir "link" antes de escribir la URL.
  const [action, setAction] = useState(() => (
    form.target_loteo_id ? 'stage' : form.link_url ? 'link' : 'none'
  ));
  const chooseAction = next => {
    setAction(next);
    if (next !== 'stage' && form.target_loteo_id) handleChange('target_loteo_id', '');
    if (next !== 'link' && form.link_url) handleChange('link_url', '');
    if (next === 'stage' && !form.target_loteo_id && siblingStages[0]) handleChange('target_loteo_id', siblingStages[0].id);
  };

  const hasImage = !!form.image_url;
  // Solo "perspective" abre la foto a pantalla completa en el visor (y por
  // eso oculta ícono/descripción/link/etapa, que ahí no se ven). "place"
  // (default) muestra la foto como thumbnail en el marker y estos campos
  // conviven normalmente en el panel de info.
  const isPerspective = form.poi_kind === 'perspective';
  const hidesContentFields = hasImage && isPerspective;
  const iconOption = POI_ICON_OPTIONS.find(option => option.value === form.icon_type);
  const PreviewIcon = iconOption?.Icon ?? MapPin;

  const fileInputRef = useRef(null);
  const { upload, uploading, error: uploadError } = useImageUpload(uploadFn);
  const pickImage = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const url = await upload(file);
    if (url) handleChange('image_url', url);
  };

  const distanceText = form.distance_value !== '' && form.distance_value != null
    ? `${String(form.distance_value).replace('.', ',')} ${form.distance_unit}`
    : null;
  const previewMeta = [form.category, distanceText].filter(Boolean).join(' · ');
  const showsPhotoOnMarker = hasImage && !isPerspective;
  const imageName = hasImage ? decodeURIComponent(form.image_url.split('/').pop().split('?')[0]) : '';

  return (
    <InspectorShell
      media={<IconTile icon={PreviewIcon} color={form.color} />}
      title={(
        <input
          className="ins-title-input"
          value={form.title}
          onChange={e => handleChange('title', e.target.value)}
          placeholder="Nombre del lugar"
          aria-label="Título del lugar"
        />
      )}
      subtitle={isPending ? 'Lugar nuevo · sin guardar' : `Lugar${iconOption ? ` · ${iconOption.label}` : ''}`}
      onClose={onClose}
      footer={(
        <button type="button" className="editor-btn editor-btn--danger-ghost ins-foot__block" onClick={onDelete}>
          <Trash2 size={15} /> Borrar <kbd>Supr</kbd>
        </button>
      )}
    >
      <Section>
        <div className="ins-preview" aria-hidden="true">
          <span className="ins-preview__tag ins-preview__tag--left">Así se ve en el visor</span>
          <div
            className="ins-poi-anchor"
            style={{ '--stem': `${form.callout_stem_height * STEM_PREVIEW_SCALE}px`, '--c': form.color }}
          >
            <span className="ins-poi-stem" />
            <span
              className="ins-poi-bubble"
              style={showsPhotoOnMarker ? { backgroundImage: `url("${form.image_url}")` } : undefined}
            >
              {!showsPhotoOnMarker && createElement(PreviewIcon, { size: 16, strokeWidth: 2.2 })}
            </span>
            <span className="ins-poi-card">
              <strong>{form.title || 'Sin título'}</strong>
              {previewMeta && <small>{previewMeta}</small>}
            </span>
          </div>
        </div>
        <Slider
          id="poi-stem-height"
          label="Alto de la línea"
          valueLabel={`${form.callout_stem_height} px`}
          min={40}
          max={260}
          step={4}
          value={form.callout_stem_height}
          onChange={value => handleChange('callout_stem_height', value)}
        />
      </Section>

      <Section label="Categoría" aside="Opcional">
        <Field label="Categoría" htmlFor="poi-category">
          <input
            id="poi-category"
            maxLength={50}
            value={form.category}
            onChange={e => handleChange('category', e.target.value)}
            placeholder="Ej: Colegio"
          />
        </Field>
        <div className="ins-chips">
          {POI_CATEGORY_SUGGESTIONS.slice(0, 8).map(category => (
            <button
              key={category}
              type="button"
              className={`ins-chip${form.category === category ? ' is-active' : ''}`}
              onClick={() => handleChange('category', form.category === category ? '' : category)}
            >
              {category}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Ícono y color" aside={iconOption?.label ?? 'Sin ícono'}>
        <div
          className={`ins-icon-grid${hidesContentFields ? ' ins-dim' : ''}`}
          role="radiogroup"
          aria-label="Ícono"
          style={{ '--c': form.color }}
        >
          {POI_ICON_OPTIONS.map(({ value, Icon, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.icon_type === value}
              aria-label={label}
              title={label}
              className={`ins-icon-cell${form.icon_type === value ? ' is-active' : ''}`}
              onClick={() => handleChange('icon_type', value)}
            >
              {createElement(Icon, { size: 18 })}
            </button>
          ))}
        </div>
        <Swatches colors={POI_COLORS} value={form.color} onChange={value => handleChange('color', value)} label="Color" />
      </Section>

      <Section label="Foto">
        {hasImage ? (
          <>
            <div className="ins-img-row">
              <div className="ins-photo"><img src={form.image_url} alt="Foto del lugar" /></div>
              <span className="ins-where__text"><strong title={imageName}>{imageName || 'Foto'}</strong></span>
              <span className="ins-btn-row">
                <button type="button" className="editor-icon-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading} aria-label="Cambiar foto" title="Cambiar foto">
                  <RefreshCw size={15} />
                </button>
                <button type="button" className="editor-icon-btn" onClick={() => handleChange('image_url', '')} aria-label="Quitar foto" title="Quitar foto">
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
            <div className="ins-choice" role="radiogroup" aria-label="Cómo se muestra la foto">
              <button
                type="button"
                role="radio"
                aria-checked={!isPerspective}
                className={`ins-choice__card${!isPerspective ? ' is-active' : ''}`}
                onClick={() => handleChange('poi_kind', 'place')}
              >
                <span className="ins-kind" style={{ '--ph': `url("${form.image_url}")` }}><span className="ins-kind__marker" /></span>
                <strong>Lugar</strong>
                <small>Miniatura en el marcador y ficha con datos</small>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isPerspective}
                className={`ins-choice__card${isPerspective ? ' is-active' : ''}`}
                onClick={() => handleChange('poi_kind', 'perspective')}
              >
                <span className="ins-kind ins-kind--full" style={{ '--ph': `url("${form.image_url}")` }} />
                <strong>Perspectiva</strong>
                <small>Al tocarlo abre la foto a pantalla completa</small>
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="ins-drop" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <span className="ins-choice__icon"><ImagePlus size={16} /></span>
            <span>
              <strong>{uploading ? 'Subiendo…' : 'Agregar una foto'}</strong>
              <small>JPG, PNG, WebP o GIF</small>
            </span>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept={ACCEPTED_IMAGES} hidden onChange={pickImage} />
        {uploadError && <p className="ins-error">{uploadError}</p>}
      </Section>

      <Section label="Al tocarlo en el visor">
        {hidesContentFields && (
          <div className="ins-note">
            <Info size={14} />
            <div>Con Perspectiva solo se ve la foto. <span>La ficha, el link y el salto a otra etapa no se muestran.</span></div>
          </div>
        )}
        <div className={hidesContentFields ? 'ins-dim' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Field label="Descripción en la ficha" htmlFor="poi-description">
            <textarea
              id="poi-description"
              rows={2}
              value={form.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Qué hay en este lugar"
              disabled={hidesContentFields}
            />
          </Field>
          <div className="ins-actions" role="radiogroup" aria-label="Acción al tocarlo">
            <ActionOption id="none" action={action} onChoose={chooseAction} icon={Info} label="Solo mostrar la ficha" />
            {siblingStages.length > 0 && (
              <ActionOption id="stage" action={action} onChoose={chooseAction} icon={Layers} label="Llevar a otra etapa">
                <div className="ins-options" role="radiogroup" aria-label="Etapa de destino">
                  {siblingStages.map(stage => {
                    const selected = String(form.target_loteo_id) === String(stage.id);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={`ins-option${selected ? ' is-active' : ''}`}
                        onClick={() => handleChange('target_loteo_id', stage.id)}
                      >
                        <Layers size={14} />
                        <span>{stage.name}</span>
                        {selected && <Check size={14} strokeWidth={2.6} />}
                      </button>
                    );
                  })}
                </div>
              </ActionOption>
            )}
            <ActionOption id="link" action={action} onChoose={chooseAction} icon={Link2} label="Abrir un link">
              <Field label="Dirección" htmlFor="poi-link">
                <input
                  id="poi-link"
                  value={form.link_url}
                  onChange={e => handleChange('link_url', e.target.value)}
                  placeholder="https://"
                  autoFocus={!form.link_url}
                />
              </Field>
            </ActionOption>
          </div>
        </div>
      </Section>

      <Section label="Distancia" aside="Opcional">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 112px', gap: 8, alignItems: 'end' }}>
          <Field label={form.distance_unit === 'min' ? 'Minutos en auto' : 'Kilómetros'} htmlFor="poi-distance">
            <input
              id="poi-distance"
              className="ins-num"
              type="number"
              min={0}
              max={9999}
              step={0.1}
              value={form.distance_value}
              onChange={e => handleChange('distance_value', e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="Ej: 3.5"
            />
          </Field>
          <Segmented
            label="Unidad"
            value={form.distance_unit}
            onChange={value => handleChange('distance_unit', value)}
            options={[{ value: 'km', label: 'km' }, { value: 'min', label: 'min' }]}
          />
        </div>
      </Section>
    </InspectorShell>
  );
}

function ActionOption({ id, action, onChoose, icon, label, children }) {
  const active = action === id;
  return (
    <div>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        className={`ins-action${active ? ' is-active' : ''}`}
        onClick={() => onChoose(id)}
      >
        <span className="ins-radio" />
        {createElement(icon, { size: 15 })}
        <span>{label}</span>
      </button>
      {active && children && <div className="ins-action__extra">{children}</div>}
    </div>
  );
}
