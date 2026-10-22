// Campos que guardan al salir (blur) y solo si el valor cambió. El `key` con el valor
// re-monta el input cuando cambia desde afuera (p. ej. al recargar tras un error).

export function NumberField({ label, value, onCommit, step = 1, nullable = false }) {
  return (
    <label>
      {label}
      <input
        key={value ?? ''}
        type="number"
        step={step}
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const raw = e.target.value;
          const next = raw === '' ? (nullable ? null : value) : Number(raw);
          if (next !== value && next !== undefined) onCommit(next);
        }}
      />
    </label>
  );
}

export function TextField({ label, value, onCommit, nullable = false }) {
  return (
    <label>
      {label}
      <input
        key={value ?? ''}
        defaultValue={value ?? ''}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          if (!raw && !nullable) return;
          const next = raw || null;
          if (next !== (value ?? null)) onCommit(next);
        }}
      />
    </label>
  );
}
