import { useEffect, useRef, useState } from 'react';
import { fetchVisorData, getLoteo, listLoteos, patchLoteo } from '../api/loteos';
import { fetchImage } from '../utils/fetchImage';

const dataUrlFromLocation = () => new URLSearchParams(window.location.search).get('data');
const loteoIdFromDataUrl = dataUrl => dataUrl?.match(/\/loteos\/([^/?]+)/)?.[1] ?? null;

const cleanUrlParams = (names) => {
  const params = new URLSearchParams(window.location.search);
  names.forEach(name => params.delete(name));
  return window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
};

/**
 * El loteo abierto en el editor: de dónde sale (link `?data=`), si la cuenta
 * tiene acceso, sus imágenes, sus etapas hermanas y los ajustes que se
 * guardan al toque con PATCH (home, norte, nombre/snap).
 *
 * Lo editable (anotaciones, calibraciones, superficies de Render) no vive
 * acá: cuando llegan los datos se le pasan a `onDataLoaded(data, ctx)` y App
 * los reparte entre sus hooks.
 */
export function useLoteoData({ accessToken, user, activeOrgId, notify, getViewerPositionRef, onDataLoaded }) {
  const [loteoId, setLoteoId] = useState(() => loteoIdFromDataUrl(dataUrlFromLocation()));
  const [selectedLoteo, setSelectedLoteo] = useState(null);
  const [loteoAccessDenied, setLoteoAccessDenied] = useState(false);
  const [siblingStages, setSiblingStages] = useState([]);
  // Sin ?data= no hay nada que cargar.
  const [isLoading, setIsLoading] = useState(() => Boolean(dataUrlFromLocation()));

  const [panoramaUrl, setPanoramaUrl] = useState(null);
  const [blueprintUrl, setBlueprintUrl] = useState(null);
  const [panoramaDimensions, setPanoramaDimensions] = useState(null);
  const [snapThreshold, setSnapThreshold] = useState(5);
  const [homePosition, setHomePosition] = useState(null);
  const [northOffset, setNorthOffset] = useState(null);
  // Blob URL actual del panorama, para revocarlo y no perder memoria.
  const panoramaBlobRef = useRef(null);

  // La carga corre una sola vez al montar: el callback se lee de un ref para
  // usar siempre el de la última render.
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => { onDataLoadedRef.current = onDataLoaded; });

  const hasDataParam = new URLSearchParams(window.location.search).has('data');
  // super_admin sin org resuelta (ver useAuth: pasa cuando hay ?data= sin un
  // ?orgId= que lo acompañe — link viejo, o esta misma pestaña reusada tras
  // cambiar de cuenta) no puede confiar en el loteo del link: no hay forma de
  // saber a qué org pertenece sin abrirlo. Se lo trata como si no hubiera
  // ?data= — cae al listado en vez de arriesgarse a mostrar un loteo ajeno.
  const untrustedDirectLink = user?.role === 'super_admin' && hasDataParam && !activeOrgId;
  // Gatea los fetches org-scoped (loteos, siblingStages) hasta que se sepa el
  // rol y, si es super_admin, ya eligió (o el link trajo) una org — evita
  // 400s del backend (falta X-Active-Org-Id).
  const hasOrgContext = Boolean(user) && (user.role !== 'super_admin' || Boolean(activeOrgId));

  // Si el link no es confiable, se limpia ?data=/&from= de la URL — así, una
  // vez elegida una org en el listado, no queda un ?data= viejo compitiendo
  // por mostrarse (ver bug reportado 2026-09-04: se abría un loteo de la org
  // anterior al elegir la nueva).
  useEffect(() => {
    if (!untrustedDirectLink) return;
    window.history.replaceState({}, '', cleanUrlParams(['data', 'from']));
  }, [untrustedDirectLink]);

  // useAuth ya limpia ?data=/&orgId= de la URL al hacer logout, pero el
  // loteo cargado sigue en memoria (la SPA no remonta) — sin este reset, al
  // loguearse con otra cuenta en la misma pestaña se reintentaba abrir el
  // loteo/etapa de la sesión anterior (bug reportado 2026-09-05).
  const [prevToken, setPrevToken] = useState(accessToken);
  if (prevToken !== accessToken) {
    setPrevToken(accessToken);
    if (!accessToken) {
      setLoteoId(null);
      setSelectedLoteo(null);
      setLoteoAccessDenied(false);
    }
  }

  // Cuando se carga vía ?data=URL, selectedLoteo queda null — lo cargamos aparte
  useEffect(() => {
    if (!loteoId || selectedLoteo || !accessToken || !hasOrgContext) return;
    getLoteo(accessToken, loteoId)
      .then(data => setSelectedLoteo(data))
      .catch(() => setLoteoAccessDenied(true));
  }, [loteoId, selectedLoteo, accessToken, hasOrgContext]);

  // Carga los datos del loteo desde la URL recibida por query string.
  useEffect(() => {
    const dataUrl = dataUrlFromLocation();
    if (!dataUrl) return;
    const extractedLoteoId = loteoIdFromDataUrl(dataUrl);
    // StrictMode monta este efecto dos veces en dev: la corrida descartada no debe
    // aplicar estado ni crear/revocar blob URLs (con la imagen en caché ambas
    // resuelven casi a la vez y se pisan el blob que el visor está cargando).
    let cancelled = false;

    fetchVisorData(dataUrl)
      .then(async data => {
        if (cancelled) return;
        const dimensions = data.panoramaWidth && data.panoramaHeight
          ? { width: data.panoramaWidth, height: data.panoramaHeight }
          : null;
        onDataLoadedRef.current(data, { loteoId: extractedLoteoId, panoramaDimensions: dimensions });

        if (typeof data.blueprintUrl === 'string' && data.blueprintUrl) setBlueprintUrl(data.blueprintUrl);
        if (data.snapThreshold != null) setSnapThreshold(data.snapThreshold);
        if (data.homeYaw != null && data.homePitch != null) {
          setHomePosition({ yaw: data.homeYaw, pitch: data.homePitch });
        }
        if (data.northOffset != null) setNorthOffset(data.northOffset);

        if (typeof data.panoramaUrl === 'string' && data.panoramaUrl) {
          setPanoramaDimensions(dimensions);
          const url = await loadPanoramaBlob(data.panoramaUrl, () => cancelled, panoramaBlobRef);
          if (!cancelled) setPanoramaUrl(url);
        }
      })
      .catch(err => {
        if (cancelled) return;
        notify(`No se pudo cargar el JSON desde la URL: ${err.message}`, { variant: 'error' });
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Etapas hermanas del proyecto (para que un POI pueda navegar a otra etapa).
  useEffect(() => {
    if (!loteoId || !accessToken || !hasOrgContext) return;
    let cancelled = false;
    listLoteos(accessToken, { limit: 100 })
      .then(data => {
        if (cancelled || !data?.items) return;
        const me = data.items.find(l => l.id === loteoId);
        if (!me?.project_id) { setSiblingStages([]); return; }
        const siblings = data.items
          .filter(l => l.project_id === me.project_id && l.id !== loteoId)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
          .map(l => ({ id: l.id, name: l.name }));
        setSiblingStages(siblings);
      })
      .catch(() => { if (!cancelled) setSiblingStages([]); });
    return () => { cancelled = true; };
  }, [loteoId, accessToken, hasOrgContext]);

  // Ajustes que se guardan al toque. Los errores (ApiError) los muestra
  // ProjectPanel — acá solo se propagan.
  const currentViewerPosition = () => {
    const pos = getViewerPositionRef.current?.();
    if (!pos) throw new Error('El visor no está listo');
    return pos;
  };

  const captureHome = async () => {
    const pos = currentViewerPosition();
    const saved = await patchLoteo(accessToken, loteoId, { home_yaw: pos.yaw, home_pitch: pos.pitch });
    setHomePosition({ yaw: saved.home_yaw, pitch: saved.home_pitch });
    return saved;
  };

  const setNorth = async () => {
    const pos = currentViewerPosition();
    const saved = await patchLoteo(accessToken, loteoId, { north_offset: pos.yaw });
    setNorthOffset(saved.north_offset);
    return saved;
  };

  const resetHome = async () => {
    const saved = await patchLoteo(accessToken, loteoId, { home_yaw: null, home_pitch: null });
    setHomePosition(null);
    return saved;
  };

  const resetNorth = async () => {
    const saved = await patchLoteo(accessToken, loteoId, { north_offset: null });
    setNorthOffset(null);
    return saved;
  };

  const saveSettings = async ({ name, snapThreshold: nextSnapThreshold }) => {
    if (!loteoId) throw new Error('No se encontró el loteo que querés configurar.');
    const saved = await patchLoteo(accessToken, loteoId, {
      ...(name ? { name } : {}),
      snap_threshold: nextSnapThreshold,
    });
    if (saved.snap_threshold != null) setSnapThreshold(saved.snap_threshold);
    setSelectedLoteo(prev => prev
      ? { ...prev, name: saved.name ?? prev.name }
      : { ...saved, name: saved.name ?? name });
    return saved;
  };

  // Red de seguridad para cuando el loteo cargado no pertenece a la cuenta
  // activa (ver reset por logout más arriba): descarta el ?data=/&orgId=/&from=
  // de la URL y el loteo en memoria para volver al listado sin recargar la página.
  const backToList = () => {
    window.history.replaceState({}, '', cleanUrlParams(['data', 'orgId', 'from']));
    setLoteoId(null);
    setSelectedLoteo(null);
    setLoteoAccessDenied(false);
  };

  return {
    loteoId, selectedLoteo, loteoAccessDenied, siblingStages, isLoading,
    hasDataParam, untrustedDirectLink,
    panoramaUrl, blueprintUrl, panoramaDimensions, setPanoramaDimensions,
    snapThreshold, homePosition, northOffset,
    captureHome, setNorth, resetHome, resetNorth, saveSettings,
    backToList,
  };
}

// Baja el panorama como blob URL y revoca el anterior. Si la descarga falla,
// usa la URL directa.
async function loadPanoramaBlob(url, isCancelled, blobRef) {
  try {
    const res = await fetchImage(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    if (isCancelled()) return url;
    if (blobRef.current?.startsWith('blob:')) URL.revokeObjectURL(blobRef.current);
    blobRef.current = URL.createObjectURL(blob);
    return blobRef.current;
  } catch {
    return url;
  }
}
