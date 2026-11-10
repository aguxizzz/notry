import './Switch.css';

// On/off switch with a title and optional hint, shared by settings forms.
// It's a native checkbox with role="switch" (keyboard and screen readers for free);
// `onChange` gets the boolean, not the event.
export default function Switch({ id, label, hint, checked, onChange, disabled = false, className = '' }) {
  return (
    <label className={`ui-switch ${className}`.trim()} htmlFor={id} data-disabled={disabled ? '1' : undefined}>
      <span className="ui-switch-text">
        <span className="ui-switch-title">{label}</span>
        {hint && <span className="ui-switch-hint">{hint}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="ui-switch-input"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="ui-switch-track" aria-hidden="true">
        <span className="ui-switch-thumb" />
      </span>
    </label>
  );
}
