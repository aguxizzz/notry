// Parámetros de la URL del visor, leídos una sola vez al cargar (es una SPA:
// la query no cambia durante la visita). `?data=` y el slug del path los
// resuelve viewerData.js.

const params = new URLSearchParams(window.location.search);

// ?showcase=1 — modo grabación: autocompleta el form de precalificación (sin
// tipeo), no manda fetches reales (ni click ni submit ni analítica) y rota el
// visor para grabarlo acostado (ver main.jsx).
export const IS_SHOWCASE = params.get('showcase') === '1';

// ?lote=slug|id — link directo a un lote (lo genera "Copiar link" de la ficha).
export const DEEP_LINK_LOT = params.get('lote') || null;

// ?recommended=id1,id2 — lotes recomendados para probar el highlight sin el
// simulador de compra (que los manda por postMessage).
export const RECOMMENDED_LOT_IDS = (params.get('recommended') ?? '').split(',').filter(Boolean);

// Solo dev: ?loadingGallery=demo usa los recortes del mockup (design-lab/)
// para probar la galería de carga sin datos cargados en el back.
export const DEV_LOADING_GALLERY = import.meta.env.DEV && params.get('loadingGallery') === 'demo'
  ? [
      { url: '/design-lab/carga-assets/render-2.jpg', caption: 'Acceso principal' },
      { url: '/design-lab/carga-assets/render-3.jpg', caption: 'Club house y amenities' },
      { url: '/design-lab/carga-assets/render-1.jpg', caption: 'Espacios verdes' },
      { url: '/design-lab/carga-assets/render-4.jpg', caption: 'Vista aérea del loteo' },
    ]
  : null;
