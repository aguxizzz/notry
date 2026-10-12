const BOT_USER_AGENTS = [
  'facebookexternalhit',
  'facebot',
  'whatsapp',
  'twitterbot',
  'linkedinbot',
  'slackbot',
  'telegrambot',
  'discordbot',
  'vkshare',
  'ia_archiver',
  'googlebot',
  'bingbot',
  'opengraph',
  'preview',
  'crawler',
  'spider',
  'bot/',
  'iframely',
  'rogerbot',
  'embedly',
];

const BACKEND = 'https://notry-back.vercel.app';

// Matches /loteos/{uuid}/visor_data and /loteos/{uuid}/group_visor_data in a URL string.
// Los links de compartir usan group_visor_data (agrupamiento por etapas), así que el prefijo
// group_ es opcional — sin esto el loteoId no se extrae y se pierde título e imagen del preview.
const LOTEO_ID_RE = /\/loteos\/([0-9a-f-]{36})\/(?:group_)?visor_data/i;

function isBot(req) {
  const ua = (req.headers.get('user-agent') ?? '').toLowerCase();
  return BOT_USER_AGENTS.some((b) => ua.includes(b));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const config = { matcher: '/' };

export default async function middleware(req) {
  if (!isBot(req)) return;

  const reqUrl = new URL(req.url);
  const dataParam = reqUrl.searchParams.get('data') ?? '';
  const match = dataParam.match(LOTEO_ID_RE);
  const loteoId = match?.[1] ?? null;

  let title = 'Visor 360°';
  let description = 'Experiencia interactiva equirrectangular';
  let thumbnailUrl = null;

  if (loteoId) {
    try {
      const res = await fetch(`${BACKEND}/api/v1/public/loteos/${loteoId}/preview`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.name) {
          title = `${data.name} — Visor 360°`;
          description = `Explorá ${data.name} en nuestro visor equirrectangular interactivo`;
        }
        thumbnailUrl = data.thumbnail_url ?? null;
      }
    } catch (_) {}
  }

  // Use the Cloudflare thumbnail directly when available — avoids the /api/og function entirely
  // Fall back to the generated image only when there's no thumbnail
  let ogImageUrl;
  if (thumbnailUrl) {
    ogImageUrl = thumbnailUrl;
  } else {
    const ogParams = new URLSearchParams();
    if (loteoId) ogParams.set('id', loteoId);
    if (title !== 'Visor 360°') ogParams.set('name', title.replace(' — Visor 360°', ''));
    ogImageUrl = `${reqUrl.origin}/api/og?${ogParams}`;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(req.url)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
