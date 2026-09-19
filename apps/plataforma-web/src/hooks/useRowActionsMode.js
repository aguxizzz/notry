// Decide cómo se exponen las acciones de una fila de tabla según el ancho de
// pantalla: 'inline' (columna de acciones normal), 'accordion' (la fila se
// expande hacia abajo al clickearla) o 'drawer' (clickear la fila abre un
// bottom sheet). Los breakpoints coinciden con los que ocultan la columna de
// acciones en table.css — ver esa media query si se cambian estos valores.
import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(max-width: 1379px)';

function computeMode() {
  if (window.matchMedia(MOBILE_QUERY).matches) return 'drawer';
  if (window.matchMedia(TABLET_QUERY).matches) return 'accordion';
  return 'inline';
}

export function useRowActionsMode() {
  const [mode, setMode] = useState(computeMode);

  useEffect(() => {
    const mobileMql = window.matchMedia(MOBILE_QUERY);
    const tabletMql = window.matchMedia(TABLET_QUERY);
    const update = () => setMode(computeMode());
    mobileMql.addEventListener('change', update);
    tabletMql.addEventListener('change', update);
    return () => {
      mobileMql.removeEventListener('change', update);
      tabletMql.removeEventListener('change', update);
    };
  }, []);

  return mode;
}
