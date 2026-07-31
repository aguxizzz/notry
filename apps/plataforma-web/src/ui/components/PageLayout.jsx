import './PageLayout.css';

/**
 * Contenedor canónico de una vista de primer nivel.
 * La vista puede ajustar el ritmo con --page-section-gap sin redefinir layout.
 */
export default function PageLayout({
  as = 'div',
  className = '',
  children,
  ...rest
}) {
  const Tag = as;
  const classes = ['page-layout', className].filter(Boolean).join(' ');

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
