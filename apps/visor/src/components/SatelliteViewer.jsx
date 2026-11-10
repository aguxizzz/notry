// Vista 3D del loteo sobre el terreno real (ArcGIS SceneView). Sirve a dos
// modos del visor: 'satellite' (foto satelital de Esri) y 'render' (mapa gris
// de calles, lotes pintados por estado). Comparten la misma escena: pasar
// de uno a otro solo cambia el estilo, la cámara queda donde está.
import { useEffect, useRef, useState } from 'react';
import EsriMap from '@arcgis/core/Map.js';
import SceneView from '@arcgis/core/views/SceneView.js';
import esriConfig from '@arcgis/core/config.js';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer.js';
import Graphic from '@arcgis/core/Graphic.js';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer.js';
import Polygon from '@arcgis/core/geometry/Polygon.js';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils.js';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils.js';
import '@arcgis/core/assets/esri/themes/dark/main.css';
import { annId, lotStatus, STATUSES, STATUS_COLORS } from '../lotData.js';
import { getLotPanelInsets } from '../hooks/usePanelLayout.js';
import './SatelliteViewer.css';

// Altura/inclinación del vuelo al lote elegido. El extent del lote se agranda
// para que se vea con algo de contexto alrededor y no ocupando toda la pantalla.
const FOCUS_TILT = 55;
const FOCUS_EXPAND = 5;
const FOCUS_DURATION_MS = 900;

// Fase 3: en el modo render el lote elegido se levanta como un bloque, tipo
// maqueta. Bajo a propósito (3 m): marca el lote sin leerse como un edificio;
// se probaron 8, 4 y 2 m en un loteo real. Crece en vez de aparecer de golpe
// para que el ojo lo siga.
const BLOCK_HEIGHT_M = 3;
const BLOCK_GROW_MS = 550;
const BLOCK_COLOR = [197, 160, 89, 0.92]; // dorado de la marca, como el highlight

// Giro lento alrededor del lote elegido, con los mismos números que la órbita
// de panorama (lotOrbit.js): velocidad, arranque suave y pausa al tocar.
const ORBIT_DEG_PER_S = 5.5;
const ORBIT_RAMP_MS = 1500;
const ORBIT_RESUME_MS = 2500;

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const blockSymbol = (height) => ({
  type: 'polygon-3d',
  symbolLayers: [{
    type: 'extrude',
    size: height,
    material: { color: BLOCK_COLOR },
    // Aristas blancas: sin ellas, con luz virtual las caras quedan casi del
    // mismo tono y el bloque se ve como una mancha plana.
    edges: { type: 'solid', color: [255, 255, 255, 0.9], size: 1 },
  }],
});

const hexToRgba = (hex, alpha) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
};

const fill = (color, outline, outlineWidth = 2) => ({
  type: 'simple-fill',
  color,
  outline: { color: outline, width: outlineWidth },
});

// Satélite: a diferencia de blueprint/panorama (donde el borde SVG alcanza
// para el hit-test del mouse), en 3D el hitTest necesita superficie: sin fill,
// clickear "adentro" del lote no pega. Por eso el gris translúcido parejo.
const SATELLITE_RENDERER = {
  type: 'simple',
  symbol: fill([160, 160, 160, 0.35], [255, 255, 255, 0.9]),
};

// Render: colores de estado de toda la app (STATUS_COLORS), casi opacos para
// que se lea como maqueta y no como un velo sobre el suelo.
const RENDER_RENDERER = {
  type: 'unique-value',
  field: 'status',
  uniqueValueInfos: STATUSES.map((s) => ({
    value: s,
    symbol: fill(hexToRgba(STATUS_COLORS[s], 0.82), [255, 255, 255, 1], 1.5),
  })),
  defaultSymbol: fill(hexToRgba(STATUS_COLORS.unavailable, 0.82), [255, 255, 255, 1], 1.5),
};

// Número del lote (mismo código que el badge de panorama, ver loteLabels.js).
// Texto claro con halo oscuro sobre la foto; al revés sobre el suelo claro.
const labelingInfo = (text, halo) => [{
  labelExpressionInfo: { expression: '$feature.label' },
  // Sin labelPlacement: ArcGIS 5 en SceneView no soporta 'always-horizontal'
  // (avisa por consola y usa su posición por defecto, que es la que queremos).
  symbol: {
    type: 'label-3d',
    symbolLayers: [{
      type: 'text',
      material: { color: text },
      halo: { color: halo, size: 1.2 },
      size: 11,
      font: { weight: 'bold' },
    }],
  },
}];

// Suelo y cielo del modo render: tono papel cálido, sin atmósfera ni
// estrellas.
const RENDER_GROUND = '#e7e3d9';
const RENDER_SKY = [243, 241, 236, 1];

// Fase 3b: sol fijo a media tarde, con sombras. La hora es solar del lugar
// (sale de la longitud del loteo), no la del navegador: así se ve igual
// desde cualquier país. Equinoccio para que la altura del sol (~30° a las
// 16 h en latitudes como Buenos Aires) no dependa del hemisferio ni la época.
const RENDER_SUN_HOUR = 16;
const RENDER_SUN_DAY = Date.UTC(2026, 2, 20); // 20 de marzo, 00:00 UTC

// 15° de longitud = 1 hora de sol: al oeste de Greenwich el mediodía solar
// llega más tarde en UTC (lng -60 → 16 h solar = 20 h UTC).
const renderSunDate = (longitude) =>
  new Date(RENDER_SUN_DAY + (RENDER_SUN_HOUR - (longitude ?? 0) / 15) * 3600 * 1000);

// Alrededor del loteo, el render muestra el mapa gris de calles de Esri
// (classic, no pide API key): da accesos y trama del barrio sin repetir la
// foto, que ya tiene su propio modo. Se probó contra satélite atenuado y suelo
// liso en un loteo real (fase 2).
const RENDER_BASEMAP = 'gray-vector';

const STYLE = {
  satellite: {
    basemap: 'satellite',
    surfaceColor: null,
    environment: {
      background: { type: 'default' },
      starsEnabled: true,
      atmosphereEnabled: true,
      lighting: { type: 'sun' },
    },
    renderer: SATELLITE_RENDERER,
    labels: labelingInfo([255, 255, 255, 1], [0, 0, 0, 0.75]),
  },
  render: {
    basemap: RENDER_BASEMAP,
    surfaceColor: RENDER_GROUND,
    environment: {
      background: { type: 'color', color: RENDER_SKY },
      starsEnabled: false,
      atmosphereEnabled: false,
      // La fecha se completa en applyStyle con la longitud del loteo.
      lighting: { type: 'sun', directShadowsEnabled: true },
    },
    renderer: RENDER_RENDERER,
    labels: labelingInfo([31, 41, 55, 1], [255, 255, 255, 0.9]),
  },
};

/**
 * Marca en view.padding lo que tapa el panel de lotes. `hasLot` y `isAlive`
 * son getters porque se pueden volver a leer al terminar un vuelo.
 */
function setPanelPadding(view, hasLot, isAlive) {
  const insets = getLotPanelInsets();
  view.padding = {
    top: insets.top || 0,
    // En celular la hoja de abajo solo existe con un lote abierto.
    bottom: hasLot() ? insets.bottom || 0 : 0,
    left: insets.left || 0,
    right: 0,
  };
  // Un goTo en curso vuelve a imponer el padding con el que arrancó (visto
  // con logs: el panel se abría en pleno vuelo y ~20ms después ArcGIS lo
  // dejaba en 0). Se vuelve a aplicar cuando el vuelo termina o se corta.
  if (view.animation?.state === 'running') {
    reactiveUtils
      .whenOnce(() => view.animation?.state !== 'running')
      .then(() => { if (isAlive()) setPanelPadding(view, hasLot, isAlive); });
  }
}

// Gama baja (ver devicePerf.js, se fuerza con ?lite=1): la misma clase que
// usa el panorama para aliviar el celular.
const isLiteDevice = () => document.documentElement.classList.contains('perf-lite');

// Pasa la escena al estilo del modo (foto o render) sin rearmarla.
function applyStyle(map, view, layer, variant, longitude) {
  const style = STYLE[variant] ?? STYLE.satellite;
  const lite = isLiteDevice();
  // En gama baja el render va sin mapa de calles: las teselas vectoriales se
  // dibujan en el propio celular y en 3D son lo más caro de la escena. Queda
  // el suelo liso (surfaceColor) con los lotes, que sigue leyéndose bien.
  map.basemap = variant === 'render' && lite ? null : style.basemap;
  map.ground.surfaceColor = style.surfaceColor;
  view.environment = variant === 'render'
    ? {
      ...style.environment,
      lighting: {
        ...style.environment.lighting,
        date: renderSunDate(longitude),
        // Sin esto ArcGIS corre la hora cuando la cámara se mueve (para
        // mantener la hora local); acá queremos el sol quieto.
        cameraTrackingEnabled: false,
        // Las sombras obligan a dibujar la escena una vez más desde el sol
        // en cada cuadro: en gama baja se queda solo la luz.
        directShadowsEnabled: !lite,
      },
    }
    : style.environment;
  layer.renderer = style.renderer;
  layer.labelingInfo = style.labels;
}

// Free tier: World Imagery + World Elevation no requieren API key para uso
// básico, pero Esri viene exigiéndola cada vez más seguido para algunos
// basemaps. Si aparece bloqueada la carga, conseguir una key gratuita en
// https://developers.arcgis.com y setear VITE_ARCGIS_API_KEY.
const ARCGIS_API_KEY = import.meta.env.VITE_ARCGIS_API_KEY || '';

/**
 * Vista 3D interactiva del loteo, navegable con mouse: drag = pan, scroll =
 * zoom, ctrl+drag/drag secundario = rotar/inclinar cámara. Dibuja los
 * polígonos de lote (`annotations` con `geo_coordinates`) pegados al terreno.
 * `variant` es 'satellite' o 'render'. `selectedId` es el lote con la ficha
 * abierta: se resalta y la cámara vuela hasta él, venga del clic en el mapa,
 * de la lista o de un link directo. `usePanel`/`panelCollapsed` vienen de
 * usePanelLayout: solo se usan para recalcular cuánto tapa el panel.
 */
export default function SatelliteViewer({
  latitude, longitude, annotations, loteLabels, variant = 'satellite', selectedId, onMarkerSelect,
  usePanel, panelCollapsed,
}) {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);
  const onMarkerSelectRef = useRef(onMarkerSelect);
  onMarkerSelectRef.current = onMarkerSelect;

  // La SceneView vive dentro del efecto de la escena; selección y estilo se
  // aplican desde otros efectos (no queremos rehacer la escena por cada clic
  // o cambio de modo), así que comparten estas referencias.
  const sceneRef = useRef(null); // { map, view, layer, blockLayer, layerView, oidById, extentById, geometryById }
  const selectionHandleRef = useRef(null);
  const selectedIdRef = useRef(selectedId);
  const variantRef = useRef(variant);
  const growFrameRef = useRef(null); // requestAnimationFrame del bloque que crece
  // Estado de la órbita: frame en curso, centro del lote (en el sistema de la
  // cámara) y hasta cuándo está pausada por un toque del usuario.
  const orbitRef = useRef({ frame: null, pausedUntil: 0 });

  const stopOrbit = () => {
    cancelAnimationFrame(orbitRef.current.frame);
    orbitRef.current.frame = null;
  };

  // Gira la cámara alrededor del lote como una pieza rígida: corre su posición
  // sobre un círculo con centro en el lote y le suma lo mismo al rumbo. Así el
  // lote queda quieto en pantalla (también si está corrido por el panel) y
  // gira el mundo alrededor, igual que en panorama.
  const startOrbit = (id) => {
    stopOrbit();
    const scene = sceneRef.current;
    if (!scene || prefersReducedMotion()) return;
    const { view } = scene;
    const geoCenter = scene.extentById.get(id)?.center;
    // La escena global trabaja en Web Mercator (metros); en grados el círculo
    // saldría achatado. Si no fuera Mercator, mejor no girar.
    if (!geoCenter || !view.camera.position.spatialReference.isWebMercator) return;
    const center = webMercatorUtils.geographicToWebMercator(geoCenter);

    const orbit = orbitRef.current;
    const startedAt = performance.now();
    orbit.pausedUntil = 0;
    let last = startedAt;
    const step = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      // Mientras el usuario arrastra o hace zoom, se corre la pausa.
      if (view.interacting) orbit.pausedUntil = now + ORBIT_RESUME_MS;
      if (now > orbit.pausedUntil) {
        // Si el usuario se fue a mirar otra parte, no tiene sentido seguir
        // girando alrededor de un lote que ya no se ve.
        const sp = view.toScreen(center);
        if (!sp || sp.x < 0 || sp.y < 0 || sp.x > view.width || sp.y > view.height) {
          stopOrbit();
          return;
        }
        const ramp = Math.min(1, (now - Math.max(startedAt, orbit.pausedUntil)) / ORBIT_RAMP_MS);
        const deg = ORBIT_DEG_PER_S * ramp * dt;
        const a = (deg * Math.PI) / 180;
        const cam = view.camera.clone();
        const dx = cam.position.x - center.x;
        const dy = cam.position.y - center.y;
        // Rotación en sentido horario (el rumbo de ArcGIS crece en ese sentido).
        cam.position.x = center.x + dx * Math.cos(a) + dy * Math.sin(a);
        cam.position.y = center.y - dx * Math.sin(a) + dy * Math.cos(a);
        cam.heading += deg;
        view.camera = cam;
      }
      orbit.frame = requestAnimationFrame(step);
    };
    orbit.frame = requestAnimationFrame(step);
  };

  // Dibuja (o saca) el bloque del lote elegido. Solo en render: sobre la foto
  // satelital un volumen dorado tapa justo lo que el comprador quiere ver.
  // `grow` anima la altura desde 0; al cambiar de modo aparece ya armado.
  const applyBlock = (grow) => {
    cancelAnimationFrame(growFrameRef.current);
    const scene = sceneRef.current;
    if (!scene) return;
    scene.blockLayer.removeAll();
    const geometry = scene.geometryById.get(selectedIdRef.current);
    if (!geometry || variantRef.current !== 'render') return;

    const block = new Graphic({ geometry, symbol: blockSymbol(grow ? 0 : BLOCK_HEIGHT_M) });
    scene.blockLayer.add(block);
    if (!grow) return;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / BLOCK_GROW_MS);
      const eased = 1 - (1 - t) ** 3; // ease-out: arranca rápido y se asienta
      block.symbol = blockSymbol(BLOCK_HEIGHT_M * eased);
      if (t < 1) growFrameRef.current = requestAnimationFrame(step);
    };
    growFrameRef.current = requestAnimationFrame(step);
  };

  // Resalta el lote elegido y lleva la cámara hasta él. Si la escena todavía
  // no tiene su layerView (link directo apenas carga), no hace nada: se vuelve
  // a llamar cuando el layerView está listo. Solo lee refs, así que la versión
  // que captura el efecto de la escena sigue sirviendo en renders posteriores.
  const applySelection = (fly) => {
    stopOrbit();
    selectionHandleRef.current?.remove();
    selectionHandleRef.current = null;
    const scene = sceneRef.current;
    const id = selectedIdRef.current;
    if (!scene?.layerView || id == null) return;
    const oid = scene.oidById.get(id);
    if (oid == null) return; // lote sin geo_coordinates: abre la ficha y nada más
    selectionHandleRef.current = scene.layerView.highlight(oid, { name: 'selected' });
    if (!fly) return;
    const extent = scene.extentById.get(id);
    // goTo centra en la zona libre que marca view.padding (ver applyPadding),
    // así el lote no queda detrás del panel.
    scene.view
      .goTo(
        { target: extent.clone().expand(FOCUS_EXPAND), tilt: FOCUS_TILT },
        { duration: FOCUS_DURATION_MS, easing: 'in-out-cubic' }
      )
      // Al llegar empieza a girar, salvo que mientras volaba se haya elegido
      // otro lote o cerrado la ficha.
      .then(() => { if (selectedIdRef.current === id) startOrbit(id); })
      // goTo rechaza la promesa si el usuario interrumpe el vuelo arrastrando:
      // en ese caso tampoco se gira, el usuario ya tomó el control.
      .catch(() => {});
  };

  // view.padding le dice a ArcGIS qué parte del mapa está tapada: corre ahí
  // su barra de controles y centra los goTo en lo que queda libre. Tiene que
  // seguir al panel (abierto, colapsado, ficha en celular), no solo al clic.
  const applyPadding = () => {
    const view = sceneRef.current?.view;
    if (!view) return;
    setPanelPadding(view, () => selectedIdRef.current != null, () => sceneRef.current?.view === view);
  };

  // Va antes que el efecto de selección: el vuelo al lote ya sale con el
  // padding nuevo.
  useEffect(() => {
    selectedIdRef.current = selectedId;
    applyPadding();
  }, [selectedId, panelCollapsed, usePanel]);

  useEffect(() => {
    applySelection(true);
    applyBlock(true);
  }, [selectedId]);

  useEffect(() => {
    variantRef.current = variant;
    const scene = sceneRef.current;
    if (scene) applyStyle(scene.map, scene.view, scene.layer, variant, longitude);
    applyBlock(false);
  }, [variant, longitude]);

  useEffect(() => {
    if (latitude == null || longitude == null || !containerRef.current) return;

    setError(null);
    if (ARCGIS_API_KEY) esriConfig.apiKey = ARCGIS_API_KEY;

    // annId <-> objectId: la FeatureLayer trabaja con objectIds numéricos
    // (highlight, hitTest) y el resto del visor con el id del lote.
    const oidById = new Map();
    const idByOid = new Map();
    const extentById = new Map();
    const geometryById = new Map(); // para armar el bloque del lote elegido

    const source = (annotations || [])
      .filter((ann) => ann.type === 'polygon' && ann.geo_coordinates?.length >= 3)
      .map((ann, i) => {
        const id = annId(ann);
        const oid = i + 1;
        const geometry = new Polygon({
          // Se persiste [lat,lng] pero ArcGIS espera [lng,lat].
          rings: [ann.geo_coordinates.map(([lat, lng]) => [lng, lat])],
          spatialReference: { wkid: 4326 },
        });
        oidById.set(id, oid);
        idByOid.set(oid, id);
        extentById.set(id, geometry.extent);
        geometryById.set(id, geometry);
        return new Graphic({
          geometry,
          attributes: { oid, status: lotStatus(ann), label: loteLabels?.get(id) ?? '' },
        });
      });

    const layer = new FeatureLayer({
      source,
      objectIdField: 'oid',
      geometryType: 'polygon',
      spatialReference: { wkid: 4326 },
      fields: [
        { name: 'oid', type: 'oid' },
        { name: 'status', type: 'string' },
        { name: 'label', type: 'string' },
      ],
      outFields: ['*'],
      elevationInfo: { mode: 'on-the-ground' },
      popupEnabled: false,
      labelsVisible: true,
    });

    // El bloque va en una capa aparte: el hitTest solo mira `layer`, así que
    // clickear el bloque sigue pegándole al lote de abajo.
    const blockLayer = new GraphicsLayer({ elevationInfo: { mode: 'on-the-ground' } });

    const map = new EsriMap({ ground: 'world-elevation', layers: [layer, blockLayer] });

    const view = new SceneView({
      container: containerRef.current,
      map,
      camera: {
        position: { latitude, longitude, z: 350 },
        tilt: 60,
      },
      // Sin popup de ArcGIS: el clic abre la ficha propia del visor (la misma
      // que en panorama y plano), ver clickHandle más abajo.
      popupEnabled: false,
      // ArcGIS elige 'low' solo en iPhone; un Android de gama baja arrancaba
      // en 'medium' (más resolución en pantallas HiDPI y más memoria). En el
      // resto se deja el que ArcGIS elige.
      ...(isLiteDevice() && { qualityProfile: 'low' }),
      // Hover y selección se resuelven con el highlight nativo de ArcGIS
      // (layerView.highlight), que repinta bien polígonos pegados al terreno.
      // En ArcGIS 5 esto va en `highlights` (grupos con nombre); la vieja
      // `highlightOptions` se ignora sin aviso.
      highlights: [
        { name: 'default', color: [255, 255, 255], fillOpacity: 0.5, haloOpacity: 1 },
        // Dorado de la marca, igual que el lote elegido en panorama. Sin halo:
        // el anillo dorado alrededor sobraba (en render ya está el bloque).
        { name: 'selected', color: [197, 160, 89], fillOpacity: 0.55, haloOpacity: 0 },
      ],
    });

    applyStyle(map, view, layer, variantRef.current, longitude);

    // ArcGIS setea cursor "grab"/"default" inline sobre su propio canvas para
    // feedback de navegación; !important es la única forma de que nuestro
    // cursor de hover no quede pisado por esa asignación interna.
    const setCursor = (cursor) => {
      view.container.style.cursor = cursor;
      const surface = view.container.querySelector('canvas');
      if (surface) surface.style.setProperty('cursor', cursor, 'important');
    };

    // objectId del lote bajo el puntero, o null.
    const hitLot = (event) => view.hitTest(event, { include: layer }).then((response) => {
      const hit = response.results.find((r) => r.graphic);
      if (!hit) return null;
      const oid = hit.graphic.attributes?.oid ?? hit.graphic.getObjectId?.();
      return idByOid.has(oid) ? oid : null;
    });

    const clickHandle = view.on('click', (event) => {
      hitLot(event).then((oid) => {
        if (oid == null) return;
        const id = idByOid.get(oid);
        const ann = (annotations || []).find((a) => annId(a) === id);
        if (ann) onMarkerSelectRef.current?.(ann);
      });
    });

    let layerView = null;
    let highlightHandle = null;
    let hoveredOid = null;
    const setHovered = (oid) => {
      if (oid === hoveredOid) return;
      hoveredOid = oid;
      if (highlightHandle) {
        highlightHandle.remove();
        highlightHandle = null;
      }
      if (oid != null && layerView) highlightHandle = layerView.highlight(oid);
      setCursor(oid != null ? 'pointer' : 'default');
    };

    sceneRef.current = { map, view, layer, blockLayer, layerView: null, oidById, extentById, geometryById };
    applyPadding();
    // El bloque no depende del layerView: con link directo ya puede ir.
    applyBlock(false);
    view.whenLayerView(layer).then((lv) => {
      layerView = lv;
      sceneRef.current = { ...sceneRef.current, layerView: lv };
      // Si ya había un lote abierto (link directo, o se cambió de modo con la
      // ficha abierta), se aplica recién ahora que se puede resaltar.
      applySelection(true);
    });

    const hoverHandle = view.on('pointer-move', (event) => {
      hitLot(event).then(setHovered);
    });

    // Cualquier toque pausa la órbita un rato (view.interacting solo cubre
    // arrastres y zoom ya en curso, no el primer clic ni la rueda).
    const pauseOrbitHandle = view.on(['pointer-down', 'mouse-wheel'], () => {
      orbitRef.current.pausedUntil = performance.now() + ORBIT_RESUME_MS;
    });

    let cancelled = false;
    view.when(
      () => {},
      (err) => {
        if (cancelled) return;
        console.error('SatelliteViewer: error al inicializar ArcGIS SceneView', err);
        setError('No se pudo cargar la vista satelital.');
      }
    );

    return () => {
      cancelled = true;
      cancelAnimationFrame(growFrameRef.current);
      stopOrbit();
      sceneRef.current = null;
      selectionHandleRef.current?.remove();
      selectionHandleRef.current = null;
      if (highlightHandle) highlightHandle.remove();
      clickHandle.remove();
      hoverHandle.remove();
      pauseOrbitHandle.remove();
      view.destroy();
      layer.destroy();
    };
  }, [latitude, longitude, annotations, loteLabels]);

  if (latitude == null || longitude == null) return null;

  return (
    <div className="satellite-viewer">
      <div ref={containerRef} className="satellite-viewer__canvas" />
      {error && <div className="satellite-viewer__error">{error}</div>}
    </div>
  );
}
