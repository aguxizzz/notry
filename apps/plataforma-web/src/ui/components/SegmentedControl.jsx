import './SegmentedControl.css';

export default function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  stackOnMobile = false,
  variant = 'pill',
  label,
  emptyMessage,
  className = '',
}) {
  const activeIndex = Math.max(options.findIndex(option => option.value === value), 0);
  const count = options.length;
  const gap = 4;
  const controlStyle = variant === 'pill' ? {
    '--segmented-cell-width': `calc((100% - ${gap * (count + 1)}px) / ${count})`,
    '--segmented-cell-height': `calc((100% - ${gap * (count + 1)}px) / ${count})`,
    '--segmented-offset-x': activeIndex === 0 ? '0px' : `calc(${activeIndex * 100}% + ${activeIndex * gap}px)`,
    '--segmented-offset-y': activeIndex === 0 ? '0px' : `calc(${activeIndex * 100}% + ${activeIndex * gap}px)`,
    '--segmented-count': count,
  } : undefined;

  const classes = [
    'segmented-control',
    `segmented-control--${variant}`,
    stackOnMobile && 'segmented-control--stack-mobile',
    className,
  ].filter(Boolean).join(' ');

  const buttons = count === 0 && emptyMessage
    ? <span className="segmented-control__empty">{emptyMessage}</span>
    : options.map(option => (
      <button
        type="button"
        key={option.value}
        className={option.value === value ? 'is-active' : ''}
        onClick={() => onChange(option.value)}
        aria-pressed={option.value === value}
        aria-label={option.ariaLabel}
        disabled={disabled}
      >
        {option.label}
      </button>
    ));

  return (
    <div className={classes} style={controlStyle} role="group" aria-label={ariaLabel}>
      {variant === 'underline' && label && <span className="segmented-control__label">{label}</span>}
      {variant === 'underline' ? <div className="segmented-control__options">{buttons}</div> : buttons}
    </div>
  );
}
