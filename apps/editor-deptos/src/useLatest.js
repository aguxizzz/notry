import { useLayoutEffect, useRef } from 'react';

// Ref que siempre tiene el último valor de `value`. Para listeners que se registran una
// sola vez (window) y tienen que leer props/callbacks actuales sin volver a registrarse.
// Mismo hook que apps/editor/src/hooks/useLatest.js.
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
