import React from 'react';
import './Loader.css';

export default function Loader({ size = 'md' }) {
  return (
    <span className={`loader ${size === 'sm' ? 'small' : ''}`} />
  );
}
