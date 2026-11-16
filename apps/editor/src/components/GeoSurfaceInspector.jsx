// Inspector of a surface selected in the Satellite view (manzana, calle,
// verde, agua or perímetro). Everything here edits the selected shape through
// useGeoSurfaces; the toolbar only holds the settings for the next drawing.
import { Fence, Pentagon, Route, Trash2, Trees, Waves } from 'lucide-react';
import { Field, IconTile, InspectorShell, Section, Slider } from './inspector/InspectorUI';
import { MAX_STREET_WIDTH_M, MIN_STREET_WIDTH_M } from '../utils/geoSurfaces';

const KIND_INFO = {
  manzana: { icon: Pentagon, title: 'Manzana', subtitle: 'Superficie del loteo en el mapa' },
  calle: { icon: Route, title: 'Calle', subtitle: 'Eje con ancho en metros' },
  verde: { icon: Trees, title: 'Verde', subtitle: 'Plaza, reserva o espacio verde' },
  agua: { icon: Waves, title: 'Agua', subtitle: 'Laguna, arroyo o espejo de agua' },
  perimetro: { icon: Fence, title: 'Perímetro', subtitle: 'Borde del loteo' },
};

export default function GeoSurfaceInspector({ surfaces, onClose }) {
  const { selected, selectedCalle, selectedArea } = surfaces;
  const info = KIND_INFO[selected.kind];

  return (
    <InspectorShell
      media={<IconTile icon={info.icon} />}
      title={info.title}
      subtitle={info.subtitle}
      onClose={onClose}
      footer={(
        <button type="button" className="editor-btn editor-btn--danger-ghost ins-foot__block" onClick={surfaces.deleteSelected}>
          <Trash2 size={15} /> Borrar <kbd>Supr</kbd>
        </button>
      )}
    >
      {selectedCalle && (
        <Section label="Calle">
          <Field label="Ancho" htmlFor="geo-calle-width" suffix="m">
            <input
              id="geo-calle-width"
              type="number"
              min={MIN_STREET_WIDTH_M}
              max={MAX_STREET_WIDTH_M}
              step="0.5"
              value={selectedCalle.width}
              onChange={e => {
                const value = Number(e.target.value);
                // Out-of-range values (half typed, e.g. "1" on the way to "14") are ignored.
                if (value >= MIN_STREET_WIDTH_M && value <= MAX_STREET_WIDTH_M) surfaces.changeSelectedCalleWidth(value);
              }}
            />
          </Field>
        </Section>
      )}
      {selectedArea && (
        <Section label="Borde">
          <Slider
            id="geo-area-curve"
            label="Curvas"
            valueLabel={`${Math.round((selectedArea.curve ?? 0) * 100)}%`}
            ends={['Esquinas', 'Redondo']}
            min={0}
            max={100}
            value={Math.round((selectedArea.curve ?? 0) * 100)}
            onBegin={surfaces.beginSelectedAreaChange}
            onChange={v => surfaces.changeSelectedArea({ curve: v / 100 })}
          />
          <Slider
            id="geo-area-wobble"
            label="Irregular"
            valueLabel={`${Math.round((selectedArea.wobble ?? 0) * 100)}%`}
            ends={['Recto', 'Natural']}
            min={0}
            max={100}
            value={Math.round((selectedArea.wobble ?? 0) * 100)}
            onBegin={surfaces.beginSelectedAreaChange}
            onChange={v => surfaces.changeSelectedArea({ wobble: v / 100 })}
          />
        </Section>
      )}
    </InspectorShell>
  );
}
