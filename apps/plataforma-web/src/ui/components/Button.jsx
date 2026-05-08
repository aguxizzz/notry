import React from 'react';
import './Button.css';

export default function Button({ variant = 'primary', size = 'md', loading = false, disabled = false, children, className = '', ...props }) {
  const sizeClass = size === 'sm' ? 'btn-fit' : '';
  const variantClass = variant === 'outline' ? 'outline-button' : 'primary-button';

  return (
    <button
      className={`${variantClass} ${sizeClass} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="loader"></span> : children}
    </button>
  );
}
