import './SegmentedControl.css';

export default function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  stackOnMobile = false,
  className = '',
}) {
  const activeIndex = Math.max(options.findIndex(option => option.value === value), 0);
  const count = options.length;
  const gap = 4;
  const controlStyle = {
    '--segmented-cell-width': `calc((100% - ${gap * (count + 1)}px) / ${count})`,
    '--segmented-cell-height': `calc((100% - ${gap * (count + 1)}px) / ${count})`,
    '--segmented-offset-x': activeIndex === 0 ? '0px' : `calc(${activeIndex * 100}% + ${activeIndex * gap}px)`,
    '--segmented-offset-y': activeIndex === 0 ? '0px' : `calc(${activeIndex * 100}% + ${activeIndex * gap}px)`,
    '--segmented-count': count,
  };

  const classes = [
    'segmented-control',
    stackOnMobile && 'segmented-control--stack-mobile',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} style={controlStyle} role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          className={option.value === value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
