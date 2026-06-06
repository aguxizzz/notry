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
];

const BACKEND = 'https://notry-back.onrender.com';

// Matches /loteos/{uuid}/visor_data in a URL string
const LOTEO_ID_RE = /\/loteos\/([0-9a-f-]{36})\/visor_data/i;

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

  const ogImageUrl = loteoId
    ? `${reqUrl.origin}/api/og?id=${loteoId}`
    : `${reqUrl.origin}/api/og`;

  let title = 'Visor 360°';
  let description = 'Experiencia interactiva equirrectangular';

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
      }
    } catch (_) {}
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
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
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
