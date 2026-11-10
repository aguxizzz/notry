// Hover tooltip for charts (Análisis): a dark label anchored at a point on
// screen. Each chart owns its hover state and decides x/y; this only handles
// look, edge alignment and rendering outside the card.
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ChartTooltip.css';

/**
 * `x`/`y` are viewport coords (clientX/clientY-style); the tooltip sits above
 * that point. It's portaled to <body> because the chart cards are `Panel flush`
 * (overflow: hidden) and would cut it off near their edges. `align` keeps it on
 * screen near the sides: 'start' grows to the right of x, 'end' to the left.
 * `onDismiss` is called on any scroll, so the chart can clear its hover state.
 */
export default function ChartTooltip({ x, y, align = 'center', onDismiss, children }) {
  // Coords are only recomputed on mousemove, and scrolling doesn't fire one:
  // without this the tooltip stayed frozen on screen while the chart moved away.
  // Capture phase so it also catches scrolls of inner containers (the app's
  // main area scrolls, not the window).
  useEffect(() => {
    if (!onDismiss) return;
    window.addEventListener('scroll', onDismiss, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', onDismiss, { capture: true });
  }, [onDismiss]);

  return createPortal(
    <div
      className={`chart-tooltip chart-tooltip--${align}`}
      style={{ left: `${x}px`, top: `${y}px` }}
      role="tooltip"
    >
      {children}
    </div>,
    document.body,
  );
}
