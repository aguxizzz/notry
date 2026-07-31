import './Panel.css';

const VARIANT_CLASS = {
  compact: 'panel--compact',
  raised: 'panel--raised',
  dissolved: 'panel--dissolved',
  'accent-top': 'panel--accent-top',
};

// Superficie base del sistema. Ver Panel.css para variantes.
// Uso: <Panel as="section" className="inv-mod">…</Panel>
export default function Panel({
  as = 'div',
  variant,
  flush = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  const classes = [
    'panel',
    variant && VARIANT_CLASS[variant],
    flush && 'panel--flush',
    interactive && 'panel--interactive',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
