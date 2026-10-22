// Los atajos globales (window keydown) no actúan mientras se escribe en un campo o hay un
// diálogo abierto.
export function isTypingOrModal() {
  const el = document.activeElement;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el?.tagName) || Boolean(el?.closest('.modal'));
}

// Nombre del atajo de un evento, para buscarlo en una tabla: 'mod+shift+z', 'delete'…
// (`mod` es Ctrl, o Cmd en Mac).
export function shortcutOf(e) {
  return [e.ctrlKey || e.metaKey ? 'mod' : null, e.shiftKey ? 'shift' : null, e.key.toLowerCase()].filter(Boolean).join('+');
}
