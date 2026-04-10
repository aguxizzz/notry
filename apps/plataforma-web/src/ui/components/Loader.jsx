import React from 'react';

export default function Loader({ size = 'md' }) {
  return (
    <span className={`loader ${size === 'sm' ? 'small' : ''}`} />
  );
}
