// Los atajos globales (window keydown) no actúan mientras se escribe en un campo o hay un
// diálogo abierto.
export function isTypingOrModal() {
  const el = document.activeElement;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el?.tagName) || Boolean(el?.closest('.modal'));
}

const TYPED_FIELD = 'input:not([type=range]):not([type=file]):not([type=checkbox]):not([type=radio]):not(:disabled)';

// onKeyDown para una sección con varios campos: Enter pasa al siguiente campo de la sección.
// En el último, si la sección es un <form> lo envía (comportamiento nativo); si no, vuelve al
// primero. Al cambiar de foco, el blur del campo dispara su guardado.
export function enterToNextField(e) {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing || !e.target.matches(TYPED_FIELD)) return;
  const fields = [...e.currentTarget.querySelectorAll(TYPED_FIELD)];
  const i = fields.indexOf(e.target);
  if (i === fields.length - 1 && e.target.form) return;
  e.preventDefault();
  const next = fields[(i + 1) % fields.length];
  next.focus();
  next.select();
}

// Nombre del atajo de un evento, para buscarlo en una tabla: 'mod+shift+z', 'delete'…
// (`mod` es Ctrl, o Cmd en Mac).
export function shortcutOf(e) {
  return [e.ctrlKey || e.metaKey ? 'mod' : null, e.shiftKey ? 'shift' : null, e.key.toLowerCase()].filter(Boolean).join('+');
}
