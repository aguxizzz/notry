import { deletePoi } from '../api/pois';
import { useUIFeedback } from './useUIFeedback';

export function usePoiOperations({
  setAnnotations,
  selectedId,
  setSelectedId,
  token,
  onAuthError,
}) {
  const { notify } = useUIFeedback();

  const handleDeletePoi = async (poiId) => {
    try {
      if (poiId) await deletePoi(token, poiId);
      setAnnotations(prev => prev.filter(a => a.uuid !== poiId && a.id !== poiId && a.id !== selectedId));
      setSelectedId(null);
      return true;
    } catch (error) {
      if (error.isUnauthorized) onAuthError?.();
      else notify('No se pudo eliminar el POI. Intentá nuevamente.', { variant: 'error' });
      return false;
    }
  };

  return {
    handleDeletePoi,
  };
}
