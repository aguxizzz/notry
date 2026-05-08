import { useRef, useEffect, useState } from 'react';
import { usePanZoom } from '../hooks/usePanZoom';
import { useImageLoader } from '../hooks/useImageLoader';
import { useWrapperDims } from '../hooks/useWrapperDims';
import BlueprintControls from './blueprint/BlueprintControls';
import BlueprintPolygonLayer from './blueprint/BlueprintPolygonLayer';
import BlueprintTooltip from './blueprint/BlueprintTooltip';
import BlueprintWarningBanner from './blueprint/BlueprintWarningBanner';
import './BlueprintHeatmap.css';

export default function BlueprintHeatmap({
  blueprintUrl,
  annotations,
  clicksData,
  missingCoordinatesCount,
}) {
  const [hoveredLoteId, setHoveredLoteId] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);

  const {
    zoom, panX, panY,
    handleWheel, handlePanStart, handlePanMove, handlePanEnd,
    zoomIn, zoomOut, resetView, isPanningRef,
  } = usePanZoom();

  const {
    imageLoaded, imageError, imageDims,
    handleImageLoad, handleImageError,
  } = useImageLoader(blueprintUrl);

  const wrapperDims = useWrapperDims(wrapperRef);

  const safeClicksData = clicksData ?? [];
  const clicksMap = Object.fromEntries(safeClicksData.map(item => [item.lote_uuid, item.clicks]));
  const maxClicks = safeClicksData.reduce((m, d) => Math.max(m, d.clicks ?? 0), 0);

  const renderableAnnotations = annotations.filter(
    ann => ann.blueprint_coordinates && ann.blueprint_coordinates.length > 0
  );

  const missingCount = missingCoordinatesCount ?? 0;

  const isHoveredRef = useRef(false);

  // Attach wheel and mouse events
  useEffect(() => {
    // Wheel on document so it works in fullscreen too — but only when hovering the wrapper
    const onWheel = (e) => {
      if (!isHoveredRef.current) return;
      handleWheel(e);
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('mouseup', handlePanEnd);
    window.addEventListener('mousemove', handlePanMove);

    return () => {
      document.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', handlePanEnd);
      window.removeEventListener('mousemove', handlePanMove);
    };
  }, [handleWheel, handlePanEnd, handlePanMove]);

  const handleMouseEnter = () => { isHoveredRef.current = true; };
  const handleMouseLeave = () => { isHoveredRef.current = false; };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const el = wrapperRef.current;
      if (el?.requestFullscreen) {
        el.requestFullscreen().catch(err => console.error('[BlueprintHeatmap] requestFullscreen failed:', err));
      } else if (el?.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else {
        console.warn('[BlueprintHeatmap] requestFullscreen not supported, el:', wrapperRef.current);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.error('[BlueprintHeatmap] exitFullscreen failed:', err));
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  const handleWrapperMouseMove = (e) => {
    if (isPanningRef.current) return;
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Compute image display size
  let imgDisplayW = imageDims?.w ?? 0;
  let imgDisplayH = imageDims?.h ?? 0;
  if (wrapperDims && wrapperDims.w > 0 && wrapperDims.h > 0 && imageDims) {
    const imageAspect = imageDims.w / imageDims.h;
    const wrapperAspect = wrapperDims.w / wrapperDims.h;
    if (imageAspect > wrapperAspect) {
      imgDisplayW = wrapperDims.w;
      imgDisplayH = wrapperDims.w / imageAspect;
    } else {
      imgDisplayH = wrapperDims.h;
      imgDisplayW = wrapperDims.h * imageAspect;
    }
  }

  const commonWrapperProps = {
    ref: wrapperRef,
    onMouseMove: handleWrapperMouseMove,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    style: { cursor: 'grab', position: 'relative' },
  };

  return (
    <div className="blueprint-heatmap-container">
      <BlueprintWarningBanner missingCount={missingCount} />

      {imageError ? (
        <div className="blueprint-heatmap-wrapper" {...commonWrapperProps}>
          <div className="blueprint-error">Error al cargar la imagen del blueprint</div>
          <img
            src={blueprintUrl}
            alt="Blueprint"
            className="blueprint-image"
            loading="lazy"
            onError={handleImageError}
            style={{ display: 'none' }}
          />
        </div>
      ) : !imageLoaded || !imageDims ? (
        <div className="blueprint-heatmap-wrapper" {...commonWrapperProps}>
          <img
            src={blueprintUrl}
            alt="Blueprint"
            className="blueprint-image"
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      ) : (
        <div
          className="blueprint-heatmap-wrapper"
          ref={wrapperRef}
          onMouseDown={handlePanStart}
          onMouseMove={handleWrapperMouseMove}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'grab', position: 'relative' }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: `${imgDisplayW}px`,
              height: `${imgDisplayH}px`,
              transform: `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`,
              transformOrigin: '50% 50%',
              pointerEvents: 'none',
            }}
          >
            <img
              src={blueprintUrl}
              alt="Blueprint"
              className="blueprint-image"
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'none', userSelect: 'none' }}
            />

            <BlueprintPolygonLayer
              annotations={renderableAnnotations}
              clicksMap={clicksMap}
              maxClicks={maxClicks}
              imgDisplayW={imgDisplayW}
              imgDisplayH={imgDisplayH}
              onHoverChange={setHoveredLoteId}
            />
          </div>

          <BlueprintTooltip
            hoveredLoteId={hoveredLoteId}
            annotations={renderableAnnotations}
            clicksMap={clicksMap}
            tooltipPos={tooltipPos}
          />

          <BlueprintControls
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onReset={resetView}
            onFullscreen={toggleFullscreen}
          />
        </div>
      )}
    </div>
  );
}