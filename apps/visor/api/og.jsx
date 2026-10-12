import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const BACKEND = 'https://notry-back.vercel.app';

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  // Prefer inline params (passed by middleware) to avoid a second Render call
  let name = searchParams.get('name') ?? 'Visor de Loteo';
  let thumbnailUrl = searchParams.get('thumbnail') ?? null;

  if (id && name === 'Visor de Loteo') {
    try {
      const res = await fetch(`${BACKEND}/api/v1/public/loteos/${id}/preview`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        name = data.name ?? name;
        thumbnailUrl = data.thumbnail_url ?? null;
      }
    } catch (_) {}
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '48px 56px',
          background: '#0e0e0e',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.3,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '75%',
            background: 'linear-gradient(to top, #0e0e0e 55%, transparent)',
            display: 'flex',
          }}
        />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              width: 48,
              height: 3,
              background: '#c5a059',
              marginBottom: 20,
              display: 'flex',
            }}
          />
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.1,
              marginBottom: 18,
              display: 'flex',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#c5a059',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            Visor equirrectangular interactivo
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
