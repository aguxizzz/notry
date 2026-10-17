import { useLayoutEffect, useRef } from 'react';

/**
 * Ref que siempre tiene el último valor de `value`. Para listeners que se
 * registran una sola vez (PSV, window) y tienen que leer props/callbacks
 * actuales sin volver a registrarse.
 */
export function useLatest(value) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
