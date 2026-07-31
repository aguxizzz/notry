import { useState } from 'react';

export function useImageLoader() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageDims, setImageDims] = useState(null);

  const handleImageLoad = (e) => {
    const img = e.target;
    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
      setImageError(true);
      return;
    }
    setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  return {
    imageLoaded,
    imageError,
    imageDims,
    handleImageLoad,
    handleImageError,
  };
}
