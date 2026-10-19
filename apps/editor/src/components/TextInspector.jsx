import { useEffect, useRef } from 'react';
import { Trash2, Type } from 'lucide-react';
import { Field, IconTile, InspectorShell, Section, Slider, Swatches } from './inspector/InspectorUI';
import { hexToRgba } from './inspector/inspectorUtils';

const TEXT_PRESETS = [
  { id: 'calle', label: 'Calle', textColor: '#ffffff', bgColor: '#000000', bgOpacity: 0, fontSize: 16 },
  { id: 'cartel', label: 'Cartel', textColor: '#17130c', bgColor: '#f0eee9', bgOpacity: 0.9, fontSize: 18 },
  { id: 'dorado', label: 'Dorado', textColor: '#17130c', bgColor: '#c5a059', bgOpacity: 1, fontSize: 16 },
  { id: 'sutil', label: 'Sutil', textColor: '#ffffff', bgColor: '#000000', bgOpacity: 0.45, fontSize: 14 },
];
const TEXT_COLORS = ['#ffffff', '#17130c', '#c5a059', '#14b8a6', '#f4b740'];
const BG_COLORS = ['#000000', '#ffffff', '#f0eee9', '#c5a059', '#2a3141'];

export default function TextInspector({ marker, onUpdate, onDelete, onClose }) {
  const text = marker.tooltip || '';
  const textColor = marker.textColor || '#ffffff';
  const bgColor = marker.bgColor || '#ffffff';
  const bgOpacity = marker.bgOpacity !== undefined ? marker.bgOpacity : 0;
  const fontSize = marker.fontSize ?? 14;

  const inputRef = useRef(null);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [marker.id]);

  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const activePreset = TEXT_PRESETS.find(preset => (
    same(preset.textColor, textColor) && same(preset.bgColor, bgColor)
    && preset.bgOpacity === bgOpacity && preset.fontSize === fontSize
  ));
  const applyPreset = preset => {
    onUpdate('textColor', preset.textColor);
    onUpdate('bgColor', preset.bgColor);
    onUpdate('bgOpacity', preset.bgOpacity);
    onUpdate('fontSize', preset.fontSize);
  };

  return (
    <InspectorShell
      media={<IconTile icon={Type} />}
      title="Texto"
      subtitle="Etiqueta libre en el panorama"
      onClose={onClose}
      footer={(
        <button type="button" className="editor-btn editor-btn--danger-ghost ins-foot__block" onClick={onDelete}>
          <Trash2 size={15} /> Borrar <kbd>Supr</kbd>
        </button>
      )}
    >
      <Section>
        <div className="ins-preview ins-preview--short">
          <span className="ins-preview__tag ins-preview__tag--right">{fontSize} px</span>
          <span
            className="ins-text-sample"
            style={{ fontSize: Math.min(fontSize, 56), color: textColor, background: hexToRgba(bgColor, bgOpacity) }}
          >
            {text || 'Escribí algo'}
          </span>
        </div>
        <Field label="Texto" htmlFor="text-content">
          <input
            id="text-content"
            ref={inputRef}
            value={text}
            onChange={e => onUpdate('tooltip', e.target.value)}
            placeholder="Ej: Av. de los Álamos"
          />
        </Field>
      </Section>

      <Section label="Estilo" aside={activePreset ? activePreset.label : 'Personalizado'}>
        <div className="ins-presets">
          {TEXT_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={`ins-preset${activePreset?.id === preset.id ? ' is-active' : ''}`}
              onClick={() => applyPreset(preset)}
            >
              <span className="ins-preset__sample">
                <span style={{ color: preset.textColor, background: hexToRgba(preset.bgColor, preset.bgOpacity) }}>Aa</span>
              </span>
              {preset.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Ajustes">
        <Slider
          id="text-size"
          label="Tamaño"
          valueLabel={`${fontSize} px`}
          min={8}
          max={200}
          value={fontSize}
          onChange={value => onUpdate('fontSize', value)}
        />
        <div className="ins-slider">
          <span className="ins-slider__top"><span>Color del texto</span></span>
          <Swatches colors={TEXT_COLORS} value={textColor} onChange={value => onUpdate('textColor', value)} label="Color del texto" />
        </div>
        <div className="ins-slider">
          <span className="ins-slider__top"><span>Fondo</span></span>
          <Swatches colors={BG_COLORS} value={bgColor} onChange={value => onUpdate('bgColor', value)} label="Color de fondo" />
        </div>
        <Slider
          id="text-bg-opacity"
          label="Opacidad del fondo"
          valueLabel={`${Math.round(bgOpacity * 100)} %`}
          min={0}
          max={1}
          step={0.05}
          value={bgOpacity}
          onChange={value => onUpdate('bgOpacity', value)}
          color={bgColor}
          alpha
          ends={['Sin fondo', 'Opaco']}
        />
      </Section>
    </InspectorShell>
  );
}
