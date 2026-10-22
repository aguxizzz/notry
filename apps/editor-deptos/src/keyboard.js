// Los atajos globales (window keydown) no actúan mientras se escribe en un campo o hay un
// diálogo abierto.
export function isTypingOrModal() {
  const el = document.activeElement;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el?.tagName) || Boolean(el?.closest('.modal'));
}
