import { useState, useRef, useEffect, useCallback } from 'react';

export function usePanZoom() {
  const [zoom, setZoomState] = useState(1);
  const [panX, setPanXState] = useState(0);
  const [panY, setPanYState] = useState(0);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  const rafRef = useRef(null);
  const pendingZoomRef = useRef(null);

  const scheduleUpdate = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      if (pendingZoomRef.current !== null) {
        setZoomState(pendingZoomRef.current);
        pendingZoomRef.current = null;
      }
      setPanXState(panXRef.current);
      setPanYState(panYRef.current);
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    panXRef.current = panX;
    panYRef.current = panY;
  }, [panX, panY]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    if (pendingZoomRef.current === null) {
      pendingZoomRef.current = zoom;
    }
    pendingZoomRef.current = Math.max(0.2, Math.min(10, pendingZoomRef.current * delta));
    scheduleUpdate();
  }, [zoom, scheduleUpdate]);

  const handlePanStart = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - panXRef.current, y: e.clientY - panYRef.current };
  }, []);

  const handlePanMove = useCallback((e) => {
    if (!isPanningRef.current) return;
    panXRef.current = e.clientX - panStartRef.current.x;
    panYRef.current = e.clientY - panStartRef.current.y;
    scheduleUpdate();
  }, [scheduleUpdate]);

  const handlePanEnd = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  const zoomIn = () => setZoomState(z => Math.min(10, z * 1.2));
  const zoomOut = () => setZoomState(z => Math.max(0.2, z / 1.2));
  const resetView = () => {
    setZoomState(1);
    setPanXState(0);
    setPanYState(0);
  };

  return {
    zoom,
    panX,
    panY,
    handleWheel,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    zoomIn,
    zoomOut,
    resetView,
    isPanningRef,
  };
}