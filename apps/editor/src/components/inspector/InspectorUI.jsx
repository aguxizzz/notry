import { createElement } from 'react';
import { X } from 'lucide-react';
import { LOT_STATUS_OPTIONS, numberFromDisplay, numberToDisplay } from './inspectorUtils';
import './inspector.css';

export function InspectorShell({ media, title, subtitle, onClose, footer, children, onKeyDown }) {
  return (
    <div className="ins-shell" onKeyDown={onKeyDown}>
      <header className="ins-head">
        {media}
        <div className="ins-head__main">
          {typeof title === 'string' ? <div className="ins-head__title">{title}</div> : title}
          {subtitle && <div className="ins-head__sub">{subtitle}</div>}
        </div>
        {onClose ? (
          <button type="button" className="editor-icon-btn" onClick={onClose} aria-label="Cerrar inspector">
            <X size={17} />
          </button>
        ) : <span />}
      </header>
      <div className="ins-body">{children}</div>
      {footer && <footer className="ins-foot">{footer}</footer>}
    </div>
  );
}

export function IconTile({ icon, color }) {
  return (
    <span className="ins-tile" style={color ? { '--tile-color': color } : undefined}>
      {createElement(icon, { size: 20 })}
    </span>
  );
}

export function Section({ label, aside, children }) {
  return (
    <section className="ins-sec">
      {label && (
        <div className="ins-sec__label">
          <span>{label}</span>
          {aside && <span className="ins-sec__aside">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, htmlFor, prefix, suffix, children, className = '' }) {
  return (
    <label className={`ins-field ${className}`} htmlFor={htmlFor}>
      <span className="ins-field__label">{label}</span>
      <span className="ins-field__row">
        {prefix && <span className="ins-field__affix">{prefix}</span>}
        {children}
        {suffix && <span className="ins-field__affix">{suffix}</span>}
      </span>
    </label>
  );
}

export function NumberInput({ id, value, onChange, onBlur, placeholder }) {
  return (
    <input
      id={id}
      className="ins-num"
      inputMode="decimal"
      value={numberToDisplay(value)}
      onChange={event => onChange(numberFromDisplay(event.target.value))}
      onBlur={onBlur}
      placeholder={placeholder}
    />
  );
}

export function StatusPicker({ value, onChange, options = LOT_STATUS_OPTIONS }) {
  return (
    <div className={`ins-status${options.length === 3 ? ' ins-status--3' : ''}`} role="radiogroup" aria-label="Estado">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          style={{ '--status': option.color }}
          onClick={() => onChange(option.value)}
        >
          <span className="ins-status__dot" />{option.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="ins-seg" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({ id, label, valueLabel, ends, min, max, step = 1, value, onChange, color, alpha = false }) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="ins-slider">
      <label className="ins-slider__top" htmlFor={id}>
        <span>{label}</span>
        <span className="ins-slider__value">{valueLabel}</span>
      </label>
      <input
        id={id}
        type="range"
        className={`ins-range${alpha ? ' ins-range--alpha' : ''}`}
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--p': `${percent}%`, ...(color ? { '--c': color } : {}) }}
        onChange={event => onChange(Number(event.target.value))}
      />
      {ends && <div className="ins-slider__ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
    </div>
  );
}

export function Swatches({ colors, value, onChange, label }) {
  const current = (value || '').toLowerCase();
  return (
    <div className="ins-swatches" role="radiogroup" aria-label={label}>
      {colors.map(color => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={current === color}
          aria-label={color}
          className={`ins-swatch${current === color ? ' is-active' : ''}`}
          style={{ '--c': color }}
          onClick={() => onChange(color)}
        />
      ))}
      <label className="ins-swatch ins-swatch--custom" title="Otro color">
        <input type="color" value={value} onChange={event => onChange(event.target.value)} aria-label={`${label}: otro color`} />
      </label>
      <span className="ins-swatches__hex">{(value || '').toUpperCase()}</span>
    </div>
  );
}

// Miniatura de un polígono: normaliza por su caja, sirve para coordenadas
// del plano ([0,1]) y del panorama (px de textura) por igual.
export function LotShape({ coords, size = 40, color = 'var(--accent)', dashed = false }) {
  const points = Array.isArray(coords) ? coords.filter(point => Array.isArray(point) && point.length >= 2) : [];
  let polygon = null;
  if (points.length >= 3) {
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY) || 1;
    const pad = 6, inner = size - pad * 2;
    const offsetX = (inner - ((Math.max(...xs) - minX) / span) * inner) / 2;
    const offsetY = (inner - ((Math.max(...ys) - minY) / span) * inner) / 2;
    polygon = points.map(([x, y]) => [
      pad + offsetX + ((x - minX) / span) * inner,
      pad + offsetY + ((y - minY) / span) * inner,
    ]);
  }
  return (
    <svg className="ins-shape" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {polygon ? (
        <polygon
          points={polygon.map(point => point.join(',')).join(' ')}
          fill={color}
          fillOpacity="0.22"
          stroke={color}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeDasharray={dashed ? '3 2.5' : undefined}
        />
      ) : (
        <rect x={size * 0.28} y={size * 0.28} width={size * 0.44} height={size * 0.44} rx="3" fill="none" stroke="var(--text-subtle)" strokeDasharray="3 2.5" />
      )}
    </svg>
  );
}
