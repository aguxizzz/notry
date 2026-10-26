import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// Tarjeta 1200x630 del preview de links cuando el proyecto no subió una imagen para compartir.
// Todo llega por query desde el middleware (sin consultas al back acá):
//   title   nombre del proyecto/lote
//   bg      foto de fondo (JPEG, ya convertida por el back)
//   logo    logo del proyecto (PNG)
//   accent  color de acento (#hex)
// `name` es el parámetro de los links viejos, equivalente a title.

const DEFAULT_ACCENT = '#c5a059';
const HEX_RE = /^#[0-9a-f]{3,8}$/i;

// Sin JSX: Vercel solo compila funciones .js/.ts/.tsx (un .jsx en api/ no se deploya → 404),
// y @vercel/og acepta elementos como objetos { type, props } sin React.
function h(type, props, ...children) {
  const kids = children.filter((c) => c !== null && c !== false && c !== undefined);
  return { type, props: { ...props, children: kids.length === 1 ? kids[0] : kids } };
}

const box = (style, ...children) => h('div', { style }, ...children);

// Outfit (la fuente del visor) en TTF: sin User-Agent de navegador, Google Fonts devuelve TTF,
// que es lo que lee @vercel/og (no woff2). `text` limita el archivo a los caracteres usados.
async function loadFont(weight, text) {
  try {
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=Outfit:wght@${weight}&text=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(2000) },
    )).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return { name: 'Outfit', weight, style: 'normal', data: await (await fetch(url)).arrayBuffer() };
  } catch (_) {
    return null; // sin red a Google Fonts: queda la fuente por defecto
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get('title') ?? searchParams.get('name') ?? 'Recorrido 360°';
  const bg = searchParams.get('bg');
  const logo = searchParams.get('logo');
  const accentParam = searchParams.get('accent');
  const accent = accentParam && HEX_RE.test(accentParam) ? accentParam : DEFAULT_ACCENT;
  const tagline = 'Recorrelo y elegí tu lote';
  const fonts = (await Promise.all([
    loadFont(600, title),
    loadFont(500, `360°${tagline}${tagline.toUpperCase()}`),
  ])).filter(Boolean);

  const fill = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' };

  return new ImageResponse(
    box({
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '48px 56px',
      background: '#0e0e0e',
      fontFamily: fonts.length ? 'Outfit' : 'sans-serif',
      position: 'relative',
      overflow: 'hidden',
    },
      bg && h('img', { src: bg, style: { ...fill, objectFit: 'cover' } }),
      box({
        ...fill,
        display: 'flex',
        background: bg
          ? 'linear-gradient(to top, rgba(10,10,10,0.92) 0%, rgba(10,10,10,0.55) 45%, rgba(10,10,10,0.05) 100%)'
          : `linear-gradient(135deg, #0e0e0e 55%, ${accent}33 100%)`,
      }),

      box({ position: 'relative', display: 'flex' },
        logo && box({
          display: 'flex',
          padding: '14px 20px',
          background: 'rgba(255,255,255,0.94)',
          borderRadius: 14,
        },
          h('img', { src: logo, style: { height: 56, objectFit: 'contain' } }),
        ),
      ),

      box({ position: 'relative', display: 'flex', flexDirection: 'column' },
        box({ width: 56, height: 4, background: accent, marginBottom: 22, display: 'flex' }),
        box({
          fontSize: title.length > 32 ? 54 : 68,
          fontWeight: 600,
          color: '#ffffff',
          lineHeight: 1.08,
          marginBottom: 20,
          display: 'flex',
        }, title),
        box({
          display: 'flex',
          alignItems: 'center',
          fontSize: 24,
          color: '#ffffff',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        },
          box({
            display: 'flex',
            padding: '6px 14px',
            marginRight: 16,
            borderRadius: 999,
            background: accent,
            color: '#0e0e0e',
          }, '360°'),
          tagline,
        ),
      ),
    ),
    { width: 1200, height: 630, fonts: fonts.length ? fonts : undefined }
  );
}
