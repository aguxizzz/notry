import React from 'react';
import './Button.css';

const SIZE_CLASS = { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' };
const VARIANT_CLASS = {
  primary: 'primary-button',
  outline: 'outline-button',
  danger: 'primary-button danger',
};

export default function Button({ as: Tag = 'button', variant = 'primary', size = 'md', loading = false, disabled = false, children, className = '', ...props }) {
  const classes = [VARIANT_CLASS[variant] || VARIANT_CLASS.primary, SIZE_CLASS[size] || SIZE_CLASS.md, className]
    .filter(Boolean)
    .join(' ');
  const isButton = Tag === 'button';

  return (
    <Tag
      className={classes}
      disabled={isButton ? disabled || loading : undefined}
      {...props}
    >
      {loading ? <span className="loader"></span> : children}
    </Tag>
  );
}
