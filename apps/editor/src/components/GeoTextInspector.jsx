// Inspector of a text written on the Satellite view's map (street names, zone
// labels). Edits the selected text through useGeoSurfaces; the visor draws it
// with the same layer (@map3d/textLayer.js), so fonts, colors and sizes match.
import { useEffect, useRef } from 'react';
import { Copy, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Trash2, Type } from 'lucide-react';
import {
  TEXT_COLORS, TEXT_FONTS, TEXT_OUTLINES, loadTextFonts, outlineColorFor, textLook,
} from '@map3d/textLayer.js';
import { Field, IconTile, InspectorShell, Section, Segmented, Slider, Swatches } from './inspector/InspectorUI';
import { MAX_TEXT_LENGTH, MAX_TEXT_SIZE_M, MIN_TEXT_SIZE_M, wrapTextAngle } from '../utils/geoSurfaces';

const ORIENTATIONS = [
  { value: 'upright', label: 'Siempre derecho' },
  { value: 'fixed', label: 'Fijo en el mapa' },
];
const OUTLINE_OPTIONS = Object.entries(TEXT_OUTLINES).map(([value, o]) => ({ value, label: o.label }));

/**
 * CSS that imitates how the map paints a text: the font, the letter color and
 * the outline (a blurred text-shadow for "sombra", a stroke behind the fill
 * for "borde"). Approximate, it's only the preview.
 */
function lookCss({ font, color, outline }, { flipX, flipY } = {}) {
  const around = outlineColorFor(color);
  return {
    display: 'inline-block',
    transform: `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
    fontFamily: TEXT_FONTS[font].family,
    fontWeight: 600,
    color,
    ...(outline === 'sombra' ? { textShadow: `0 0 6px ${around}, 0 0 2px ${around}` } : {}),
    // paint-order puts the stroke behind the fill, so it doesn't eat into the letters.
    ...(outline === 'borde' ? { WebkitTextStroke: `4px ${around}`, paintOrder: 'stroke fill' } : {}),
  };
}

export default function GeoTextInspector({ surfaces, onClose }) {
  const { selectedText: texto } = surfaces;
  const fixed = texto.angle != null;
  const look = textLook(texto);

  // The map already asks for them, but the buttons below are drawn in each font too.
  useEffect(() => { loadTextFonts(); }, []);

  // A new text arrives with "Texto" selected, so typing replaces it.
  const inputRef = useRef(null);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [texto.id]);

  // Each click outside the text field and the sliders is one undo step (those
  // take theirs when the gesture starts).
  const changeOnce = (patch) => {
    surfaces.beginSelectedTextChange();
    surfaces.changeSelectedText(patch);
  };

  return (
    <InspectorShell
      media={<IconTile icon={Type} />}
      title="Texto"
      subtitle="Nombre de calle o zona sobre el mapa"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="editor-btn editor-btn--ghost ins-foot__block" onClick={surfaces.duplicateSelected}>
            <Copy size={15} /> Duplicar <kbd>Ctrl D</kbd>
          </button>
          <button type="button" className="editor-btn editor-btn--danger-ghost ins-foot__block" onClick={surfaces.deleteSelected}>
            <Trash2 size={15} /> Borrar <kbd>Supr</kbd>
          </button>
        </>
      )}
    >
      <Section>
        <div className="ins-preview ins-preview--short geo-text-preview">
          <span style={{ ...lookCss(look, texto), fontSize: 26 }}>{texto.text || 'Escribí algo'}</span>
        </div>
        <Field label="Texto" htmlFor="geo-text-content">
          <input
            id="geo-text-content"
            ref={inputRef}
            value={texto.text}
            maxLength={MAX_TEXT_LENGTH}
            onFocus={surfaces.beginSelectedTextChange}
            onChange={e => surfaces.changeSelectedText({ text: e.target.value })}
            placeholder="Ej: Av. de los Álamos"
          />
        </Field>
      </Section>

      <Section label="Fuente" aside={TEXT_FONTS[look.font].label}>
        <div className="ins-presets">
          {Object.entries(TEXT_FONTS).map(([id, font]) => (
            <button
              key={id}
              type="button"
              className={`ins-preset${look.font === id ? ' is-active' : ''}`}
              onClick={() => changeOnce({ font: id })}
            >
              <span className="ins-preset__sample">
                <span style={{ fontFamily: font.family, fontWeight: 600, fontSize: 15, color: '#fff', background: 'none' }}>Aa</span>
              </span>
              {font.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Color">
        <Swatches colors={TEXT_COLORS} value={look.color} onChange={color => changeOnce({ color })} label="Color del texto" />
        <Segmented
          label="Contorno"
          options={OUTLINE_OPTIONS}
          value={look.outline}
          onChange={outline => changeOnce({ outline })}
        />
      </Section>

      <Section label="Ajustes">
        <Slider
          id="geo-text-size"
          label="Tamaño"
          valueLabel={`${texto.size} m`}
          ends={['Chico', 'Grande']}
          min={MIN_TEXT_SIZE_M}
          max={MAX_TEXT_SIZE_M}
          step={0.5}
          value={texto.size}
          onBegin={surfaces.beginSelectedTextChange}
          onChange={size => surfaces.changeSelectedText({ size })}
        />
        <Segmented
          label="Orientación"
          options={ORIENTATIONS}
          value={fixed ? 'fixed' : 'upright'}
          // Fixed starts horizontal (west-east); upright drops the angle.
          onChange={v => changeOnce({ angle: v === 'fixed' ? 0 : null })}
        />
        {fixed && (
          <>
            <Slider
              id="geo-text-angle"
              label="Ángulo"
              valueLabel={`${Math.round(texto.angle)}°`}
              ends={['-180°', '180°']}
              min={-180}
              max={180}
              value={texto.angle}
              onBegin={surfaces.beginSelectedTextChange}
              onChange={angle => surfaces.changeSelectedText({ angle })}
            />
            <Field label="Ángulo exacto" htmlFor="geo-text-angle-exact" suffix="°">
              <input
                id="geo-text-angle-exact"
                type="number"
                step="1"
                value={texto.angle}
                onFocus={surfaces.beginSelectedTextChange}
                onChange={e => {
                  // Half-typed values ("-", "") are skipped; anything else wraps into -180..180.
                  const value = Number(e.target.value);
                  if (e.target.value !== '' && Number.isFinite(value)) surfaces.changeSelectedText({ angle: wrapTextAngle(value) });
                }}
              />
            </Field>
          </>
        )}
        <div className="ins-btn-row">
          {/* Turning an upright text makes it fixed, starting from horizontal. */}
          <button type="button" className="ins-mini" title="Girar 90° a la izquierda" onClick={() => changeOnce({ angle: wrapTextAngle((texto.angle ?? 0) - 90) })}>
            <RotateCcw size={13} /> 90°
          </button>
          <button type="button" className="ins-mini" title="Girar 90° a la derecha" onClick={() => changeOnce({ angle: wrapTextAngle((texto.angle ?? 0) + 90) })}>
            <RotateCw size={13} /> 90°
          </button>
          <button
            type="button"
            className={`ins-mini${texto.flipX ? ' is-active' : ''}`}
            aria-pressed={!!texto.flipX}
            title="Espejar de izquierda a derecha"
            onClick={() => changeOnce({ flipX: !texto.flipX })}
          >
            <FlipHorizontal2 size={13} /> Espejo
          </button>
          <button
            type="button"
            className={`ins-mini${texto.flipY ? ' is-active' : ''}`}
            aria-pressed={!!texto.flipY}
            title="Espejar de arriba a abajo"
            onClick={() => changeOnce({ flipY: !texto.flipY })}
          >
            <FlipVertical2 size={13} /> Invertir
          </button>
        </div>
        <p className="ins-hint">En el mapa: Alt + arrastrar gira el texto. Ctrl+C / Ctrl+V lo copia y pega.</p>
      </Section>
    </InspectorShell>
  );
}
