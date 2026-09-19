import { createContext, useContext, useEffect, useRef } from 'react';

// Registro de formularios con cambios pendientes dentro de Configuración
// (AccountModal). No hay botones de Guardar: cada panel se registra acá y el
// modal consulta el registro al cerrarse o al cambiar de sección para ofrecer
// guardar todo de una vez.
export const UnsavedChangesContext = createContext(null);

/**
 * @param {string} key   identificador único del formulario dentro del modal
 * @param {{ dirty: boolean, save: () => Promise<boolean> }} entry
 *   `save` resuelve true si guardó (o no había nada que guardar), false si falló.
 */
export function useUnsavedChanges(key, entry) {
  const registry = useContext(UnsavedChangesContext);
  // El registro guarda un getter para leer siempre el estado más reciente
  // sin re-registrar en cada render.
  const latest = useRef(entry);
  useEffect(() => { latest.current = entry; });

  useEffect(() => {
    if (!registry) return undefined;
    registry.set(key, () => latest.current);
    return () => registry.delete(key);
  }, [registry, key]);
}
