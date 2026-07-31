import { useRef } from 'react';

function normalizeInput(value) {
  const cleaned = String(value ?? '').replace(/[^\d,.]/g, '');
  if (!cleaned) return '';

  const commaIndex = cleaned.lastIndexOf(',');
  if (commaIndex >= 0) {
    const integer = cleaned.slice(0, commaIndex).replace(/\./g, '') || '0';
    const decimals = cleaned.slice(commaIndex + 1).replace(/[.,]/g, '').slice(0, 2);
    return `${integer}.${decimals}`;
  }

  // The visible input always uses the es-AR convention, so dots in the DOM
  // are grouping separators. Canonical decimal dots only exist in `value`.
  return cleaned.replace(/\./g, '');
}

function formatNumber(value) {
  const normalized = String(value ?? '');
  if (!normalized || normalized === '.') return '';
  if (normalized.endsWith('.')) {
    const integer = normalized.slice(0, -1) || '0';
    return `${new Intl.NumberFormat('es-AR').format(Number(integer))},`;
  }
  const number = Number(normalized);
  if (!Number.isFinite(number)) return value;

  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2,
  }).format(number);
}

export default function FormattedNumberInput({ value, onChange, onFocus, onBlur, ...props }) {
  const inputRef = useRef(null);
  const displayValue = formatNumber(value);

  const restoreCaret = (formattedValue, digitCount, inDecimals) => {
    let seen = 0;
    let position = formattedValue.length;
    for (let index = 0; index < formattedValue.length; index += 1) {
      if (/\d/.test(formattedValue[index])) seen += 1;
      if (seen >= digitCount) {
        position = index + 1;
        break;
      }
    }
    if (inDecimals) {
      const decimalIndex = formattedValue.indexOf(',');
      if (decimalIndex >= 0) position = Math.max(position, decimalIndex + 1);
    }
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(position, position);
    });
  };

  return (
    <input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={displayValue}
      onFocus={event => {
        onFocus?.(event);
      }}
      onChange={event => {
        const caret = event.target.selectionStart ?? event.target.value.length;
        const normalized = normalizeInput(event.target.value);
        const formatted = formatNumber(normalized);
        const digitsBeforeCaret = event.target.value.slice(0, caret).replace(/\D/g, '').length;
        const inDecimals = event.target.value.slice(0, caret).includes(',');
        onChange({ target: { value: normalized } });
        restoreCaret(formatted, digitsBeforeCaret, inDecimals);
      }}
      onBlur={event => {
        onBlur?.(event);
      }}
    />
  );
}
