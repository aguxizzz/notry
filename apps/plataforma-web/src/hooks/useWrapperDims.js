import { useState, useEffect } from 'react';

export function useWrapperDims(wrapperRef) {
  const [wrapperDims, setWrapperDims] = useState(null);

  useEffect(() => {
    if (!wrapperRef.current) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWrapperDims({
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        });
      }
    });

    ro.observe(wrapperRef.current);
    setWrapperDims({
      w: wrapperRef.current.clientWidth,
      h: wrapperRef.current.clientHeight,
    });

    return () => ro.disconnect();
  }, [wrapperRef]);

  return wrapperDims;
}
