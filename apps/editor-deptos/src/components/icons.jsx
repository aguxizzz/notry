// Íconos de línea (24×24, trazo con currentColor). El estilo común vive en `.icon`.
const PATHS = {
  select: 'M5 3l13 7.5-5.5 1.5L10 17.5z M12.5 12l5 5',
  draw: 'M4 18l4-12 9 3 3 9z M4 18h0 M8 6h0 M17 9h0 M20 18h0',
  align: 'M12 3v18 M3 12h18 M12 3l-2.5 2.5M12 3l2.5 2.5 M12 21l-2.5-2.5M12 21l2.5-2.5 M3 12l2.5-2.5M3 12l2.5 2.5 M21 12l-2.5-2.5M21 12l-2.5 2.5',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M10 6l6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  copy: 'M9 9h10v10H9z M5 15V5h10',
  settings: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 4v6 M8 14v6',
  image: 'M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M15 9h0',
  layers: 'M12 4l8 4-8 4-8-4z M4 12l8 4 8-4 M4 16l8 4 8-4',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  trash:'M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13',
};

export default function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
