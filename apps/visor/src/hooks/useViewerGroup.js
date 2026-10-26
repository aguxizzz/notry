import { useState, useEffect, useCallback } from 'react';
import {
  getBrandingSlugsFromPath, fetchProjectBranding, fetchViewerData, normalizeToGroup, normalizeLoadingGallery,
} from '../viewerData.js';

/**
 * Carga el grupo de etapas del visor (group_visor_data) y, en paralelo, el
 * branding liviano para la pantalla de carga. `retry` vuelve a pedir ambos.
 */
export function useViewerGroup() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ group: null, loading: true, error: null });
  const [early, setEarly] = useState({ logoUrl: null, gallery: [] });

  // Branding liviano (solo logo/galería) pedido en paralelo al fetch pesado
  // del group_visor_data: en un cold start del backend, este responde mucho
  // antes y permite mostrar el logo del proyecto durante toda la carga.
  useEffect(() => {
    let cancelled = false;
    const { projectSlug, loteoSlug } = getBrandingSlugsFromPath();
    fetchProjectBranding(projectSlug, loteoSlug).then((branding) => {
      if (cancelled) return;
      setEarly((prev) => ({
        logoUrl: branding?.logo_primary ?? prev.logoUrl,
        gallery: normalizeLoadingGallery(branding?.loading_gallery),
      }));
    });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    let cancelled = false; // StrictMode dispara este efecto 2 veces en dev.
    fetchViewerData()
      .then((data) => {
        if (!cancelled) setResult((prev) => ({ ...prev, group: data ? normalizeToGroup(data) : prev.group, loading: false }));
      })
      .catch((err) => {
        if (!cancelled) setResult((prev) => ({ ...prev, loading: false, error: err.message || 'No se pudo cargar el visor.' }));
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const retry = useCallback(() => {
    setResult((prev) => ({ ...prev, loading: true, error: null }));
    setAttempt((value) => value + 1);
  }, []);

  return {
    group: result.group,
    loading: result.loading,
    loadError: result.error,
    retry,
    earlyLogoUrl: early.logoUrl,
    earlyGallery: early.gallery,
  };
}

/** Colores y tipografía del proyecto como variables CSS en :root. */
export function useProjectTheme(project) {
  useEffect(() => {
    if (!project) return undefined;
    const root = document.documentElement;
    if (project.primary_color) root.style.setProperty('--accent', project.primary_color);
    if (project.accent_color) root.style.setProperty('--accent-hover', project.accent_color);
    if (project.font_family) root.style.setProperty('--font-body', `${project.font_family}, system-ui, sans-serif`);
    return () => {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-hover');
      root.style.removeProperty('--font-body');
    };
  }, [project]);
}

/**
 * `active`, pero sostenido `ms` milisegundos más después de apagarse: para
 * dejar montado algo mientras se desvanece (la pantalla de carga).
 */
export function useLingering(active, ms) {
  const [lingering, setLingering] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    setLingering(prevActive && !active);
  }
  useEffect(() => {
    if (!lingering) return undefined;
    const timer = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(timer);
  }, [lingering, ms]);
  return active || lingering;
}
