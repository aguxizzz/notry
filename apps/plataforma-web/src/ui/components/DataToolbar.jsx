import './DataToolbar.css';

export default function DataToolbar({
  as = 'div',
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  const classes = ['data-toolbar', className].filter(Boolean).join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
