// Fotos de la unidad arriba de la ficha (UnitPanel). Una tira con scroll-snap: en el
// celular se pasa con el dedo y en desktop con las flechas; el contador sigue al scroll.
import { useRef, useState } from 'react';

export default function UnitGallery({ images }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);

  // Cada foto ocupa todo el ancho de la tira, así que la posición sale de dividir el scroll.
  const onScroll = () => {
    const el = track.current;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const go = (to) => {
    const el = track.current;
    el.scrollTo({ left: to * el.clientWidth, behavior: 'smooth' });
  };

  const many = images.length > 1;

  return (
    <div className="unit-gallery">
      <div className="unit-gallery__track" ref={track} onScroll={many ? onScroll : undefined}>
        {images.map((src, i) => (
          // Solo la primera carga de entrada; el resto cuando se acerca al pasar.
          <img key={src} src={src} alt={`Foto ${i + 1} de ${images.length}`} loading={i === 0 ? 'eager' : 'lazy'} draggable="false" />
        ))}
      </div>

      {many && (
        <>
          <button type="button" className="unit-gallery__nav is-prev" aria-label="Foto anterior" disabled={index === 0} onClick={() => go(index - 1)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="unit-gallery__nav is-next" aria-label="Foto siguiente" disabled={index === images.length - 1} onClick={() => go(index + 1)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <span className="unit-gallery__count">{index + 1} / {images.length}</span>
        </>
      )}
    </div>
  );
}
