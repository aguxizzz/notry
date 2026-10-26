import { useMemo } from 'react';
import { annotationsToMarkers, styleLotMarkers } from '../annotations.js';
import { renderSurfacesToMarkers } from '../renderSurfaces.js';
import { annotationsToOrbitLots, markersToOrbitPins, markersToOrbitSurfaces } from '../lotOrbit.js';
import { getLoteLabels } from '../loteLabels.js';
import { annId } from '../lotData.js';

const NO_ANNOTATIONS = [];

const isCallout = (a) => a.variant === 'callout' || a.marker_variant === 'callout';
// Lo que tiene geometría en el plano (y también se usa en la vista satelital).
const isOnBlueprint = (a) => (a.type === 'polygon' && a.blueprint_coordinates?.length >= 3)
  || (a.type === 'poi' && (isCallout(a)
    ? (a.blueprint_anchor ?? a.blueprint_coordinates?.[0])
    : a.blueprint_coordinates?.length >= 3));

/**
 * Todo lo que se dibuja de una etapa a partir de sus anotaciones: markers de
 * PSV, lotes/superficies/pines de la órbita, anotaciones del plano y códigos
 * de lote.
 *
 * @param {object|null} visor - currentStage.visor
 * @param {object|null} project - group.project (estilos de badge)
 * @param {{ recommendedIds: Set, focusMode: boolean, lotFilter: Set|null }} filters
 */
export function useStageMarkers(visor, project, { recommendedIds, focusMode, lotFilter }) {
  const annotations = visor?.annotations ?? NO_ANNOTATIONS;

  const annotationsById = useMemo(
    () => Object.fromEntries(annotations.map((a) => [annId(a), a])),
    [annotations]
  );
  const blueprintAnnotations = useMemo(() => annotations.filter(isOnBlueprint), [annotations]);
  const lotIds = useMemo(
    () => new Set(annotations.filter((a) => a.type === 'polygon').map(annId)),
    [annotations]
  );

  // Prototipo client-only de códigos de lote (ver loteLabels.js): sin backend,
  // se prueba visualmente antes de conectarlo a un campo real.
  const loteLabels = useMemo(() => getLoteLabels(annotations), [annotations]);
  const badgeStyle = project?.lote_badge_style ?? 'default';
  const badgeColors = project?.lote_badge_colors ?? false;
  // Estilo de los lotes en el plano: 'inherit' (o ausente) = igual que panorama.
  const planoStyle = project?.lote_plano_style;
  const blueprintBadgeStyle = planoStyle && planoStyle !== 'inherit' ? planoStyle : badgeStyle;

  // Las superficies de manzana/calle van primero en el array: los markers
  // "poly" de PSV pintan en orden de inserción (no por zIndex), así quedan
  // detrás de los polígonos de lote.
  const surfaceMarkers = useMemo(
    () => renderSurfacesToMarkers(visor?.renderSurfaces),
    [visor?.renderSurfaces]
  );
  // Geometría (cambia con los datos) separada del estilo (cambia con cada
  // click en recomendados/filtros): así un filtro solo restila los markers
  // afectados y no rehace bordes, elementos HTML ni los lotes de la órbita.
  const snapThreshold = visor?.snapThreshold;
  const baseMarkers = useMemo(
    () => [
      ...surfaceMarkers,
      ...annotationsToMarkers(annotations, snapThreshold, loteLabels, badgeStyle, badgeColors),
    ],
    [surfaceMarkers, annotations, snapThreshold, loteLabels, badgeStyle, badgeColors]
  );
  const markers = useMemo(
    () => styleLotMarkers(baseMarkers, { lotIds, recommendedIds, focusMode, visibleIds: lotFilter }),
    [baseMarkers, lotIds, recommendedIds, focusMode, lotFilter]
  );

  const orbitLots = useMemo(
    () => annotationsToOrbitLots(annotations, { badgeStyle }),
    [annotations, badgeStyle]
  );
  const orbitFocus = useMemo(
    () => ({ recommendedIds, focusMode, visibleIds: lotFilter }),
    [recommendedIds, focusMode, lotFilter]
  );
  const orbitSurfaces = useMemo(() => markersToOrbitSurfaces(surfaceMarkers), [surfaceMarkers]);
  const orbitPins = useMemo(() => markersToOrbitPins(markers), [markers]);

  return {
    annotations,
    annotationsById,
    blueprintAnnotations,
    loteLabels,
    badgeColors,
    blueprintBadgeStyle,
    markers,
    orbitLots,
    orbitFocus,
    orbitSurfaces,
    orbitPins,
  };
}
