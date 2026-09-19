import { Search } from 'lucide-react';
import './SearchField.css';

export default function SearchField({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel = 'Buscar',
  className = '',
  ...rest
}) {
  const classes = ['search-field', className].filter(Boolean).join(' ');

  return (
    <label className={classes} htmlFor={id}>
      <Search size={16} aria-hidden="true" />
      <span className="sr-only">{ariaLabel}</span>
      <input
        {...rest}
        id={id}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
}
