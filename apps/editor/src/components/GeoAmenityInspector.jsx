// Inspector of an amenity drawn in the Satellite view (club house, guardia,
// canchas...). Picks one of the three generic forms of @map3d/amenities.js plus
// a free name and an icon; edits go through useGeoSurfaces like the other shapes.
import { useEffect, useRef } from 'react';
import { Building2, Trash2 } from 'lucide-react';
import {
  AMENITY_FLOORS, AMENITY_FORMS, AMENITY_ICONS, AMENITY_MATERIALS, AMENITY_SPORTS, MAX_AMENITY_NAME,
  amenityColor, amenityIconSvg,
} from '@map3d/amenities.js';
import { Field, IconTile, InspectorShell, Section, Segmented } from './inspector/InspectorUI';

const FORM_OPTIONS = Object.entries(AMENITY_FORMS).map(([value, f]) => ({ value, label: f.label }));
const FLOOR_OPTIONS = AMENITY_FLOORS.map(n => ({ value: n, label: n === 1 ? '1 piso' : `${n} pisos` }));

/** Chips with a color dot, for materials and sports (both are { key: { label, color } }). */
function ColorChoices({ options, value, onChange, label }) {
  return (
    <div className="ins-presets" role="radiogroup" aria-label={label}>
      {Object.entries(options).map(([key, o]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={`ins-preset${value === key ? ' is-active' : ''}`}
          onClick={() => onChange(key)}
        >
          <span className="ins-amenity-dot" style={{ background: o.color }} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function GeoAmenityInspector({ surfaces, onClose }) {
  const { selectedAmenity: amenity } = surfaces;
  const form = AMENITY_FORMS[amenity.form] ?? AMENITY_FORMS.edificio;

  // A just-closed amenity comes without a name: the field takes focus to type it.
  const inputRef = useRef(null);
  useEffect(() => {
    const timeoutId = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timeoutId);
  }, [amenity.id]);

  // Each click is one undo step; the name field takes its snapshot on focus.
  const changeOnce = (patch) => {
    surfaces.beginSelectedAmenityChange();
    surfaces.changeSelectedAmenity(patch);
  };

  return (
    <InspectorShell
      media={<IconTile icon={Building2} color={amenityColor(amenity)} />}
      title={amenity.name?.trim() || 'Amenity'}
      subtitle={form.hint}
      onClose={onClose}
      footer={(
        <button type="button" className="editor-btn editor-btn--danger-ghost ins-foot__block" onClick={surfaces.deleteSelected}>
          <Trash2 size={15} /> Borrar <kbd>Supr</kbd>
        </button>
      )}
    >
      <Section>
        <Field label="Nombre" htmlFor="geo-amenity-name">
          <input
            id="geo-amenity-name"
            ref={inputRef}
            value={amenity.name ?? ''}
            maxLength={MAX_AMENITY_NAME}
            onFocus={surfaces.beginSelectedAmenityChange}
            onChange={e => surfaces.changeSelectedAmenity({ name: e.target.value })}
            placeholder="Ej: Club house"
          />
        </Field>
      </Section>

      <Section label="Forma">
        <Segmented label="Forma" options={FORM_OPTIONS} value={amenity.form} onChange={v => changeOnce({ form: v })} />
        {amenity.form === 'edificio' && (
          <Segmented label="Altura" options={FLOOR_OPTIONS} value={amenity.floors ?? 1} onChange={v => changeOnce({ floors: v })} />
        )}
        {amenity.form === 'piso' && (
          <ColorChoices label="Material" options={AMENITY_MATERIALS} value={amenity.material} onChange={v => changeOnce({ material: v })} />
        )}
        {amenity.form === 'cancha' && (
          <ColorChoices label="Deporte" options={AMENITY_SPORTS} value={amenity.sport} onChange={v => changeOnce({ sport: v })} />
        )}
      </Section>

      <Section label="Ícono" aside={AMENITY_ICONS[amenity.icon]?.label ?? 'Sin ícono'}>
        <div className="ins-icon-grid" role="radiogroup" aria-label="Ícono">
          {Object.entries(AMENITY_ICONS).map(([key, icon]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={amenity.icon === key}
              title={icon.label}
              aria-label={icon.label}
              className={`ins-icon-cell${amenity.icon === key ? ' is-active' : ''}`}
              style={{ '--c': 'var(--accent)' }}
              // Clicking the chosen icon again takes it off.
              onClick={() => changeOnce({ icon: amenity.icon === key ? null : key })}
              // Our own markup from AMENITY_ICONS, not user input.
              dangerouslySetInnerHTML={{ __html: amenityIconSvg(key, 18) }}
            />
          ))}
        </div>
        <p className="ins-hint">El ícono y el nombre se muestran sobre la amenity en el mapa.</p>
      </Section>
    </InspectorShell>
  );
}
