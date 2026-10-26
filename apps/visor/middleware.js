// Preview de los links del visor (WhatsApp, Facebook, LinkedIn…): a los bots se les devuelve
// un HTML mínimo con og:title/description/image en vez de la SPA (que no ejecutan).
//   /<proyecto>[/<loteo>][?lote=…] → GET /public/projects/by-slug/…/preview (título, texto, imagen)
//   /?data=…/loteos/{uuid}/…        → formato viejo, solo el nombre del loteo
// Imagen: la que el cliente subió para compartir, o si no la tarjeta generada en /api/og.

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
const PUBLIC_API = `${BACKEND}/api/v1/public`;
const DEFAULT_TITLE = 'Recorrido 360°';
const DEFAULT_DESCRIPTION = 'Recorré el loteo en 360° y elegí tu lote.';

// Matches /loteos/{uuid}/visor_data and /loteos/{uuid}/group_visor_data in a URL string.
// Los links de compartir usan group_visor_data (agrupamiento por etapas), así que el prefijo
// group_ es opcional — sin esto el loteoId no se extrae y se pierde título e imagen del preview.
const LOTEO_ID_RE = /\/loteos\/([0-9a-f-]{36})\/(?:group_)?visor_data/i;
const SLUG_RE = /^[a-z0-9-]+$/i;
const RESERVED_SEGMENTS = new Set(['api', 'assets', 'design-lab']);

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

async function fetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.json() : null;
  } catch (_) {
    return null; // sin datos del proyecto: meta tags genéricos
  }
}

// /paseoberlin o /paseoberlin/mitte → slugs; null si el path no es un link del visor.
function slugsFromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  if (RESERVED_SEGMENTS.has(parts[0]) || !parts.every((p) => SLUG_RE.test(p))) return null;
  return { project: parts[0], loteo: parts[1] ?? null };
}

function ogCardUrl(origin, params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  return `${origin}/api/og?${query}`;
}

// @vercel/og solo genera PNG: con la foto de fondo pesa ~1 MB y WhatsApp la descarta (~600 KB máx).
// El back la re-sirve en JPEG.
function asJpeg(cardUrl) {
  return `${PUBLIC_API}/preview/card?src=${encodeURIComponent(cardUrl)}`;
}

async function previewFromSlugs(origin, { project, loteo }, lote) {
  const query = new URLSearchParams();
  if (loteo) query.set('loteo', loteo);
  if (lote) query.set('lote', lote);
  const data = await fetchJson(`${PUBLIC_API}/projects/by-slug/${project}/preview?${query}`);
  if (!data) return null;

  // Las imágenes pasan por el back, que las devuelve en JPEG/PNG (los previews y @vercel/og no leen webp).
  const imageBase = `${PUBLIC_API}/projects/by-slug/${project}/preview/image`;
  const loteoQuery = loteo ? `?loteo=${encodeURIComponent(loteo)}` : '';
  const image = data.image_url
    ? `${imageBase}/share`
    : asJpeg(ogCardUrl(origin, {
        title: data.title.replace(/ — Recorrido 360°$/, ''),
        bg: data.background_url ? `${imageBase}/background${loteoQuery}` : null,
        logo: data.logo_url ? `${imageBase}/logo` : null,
        accent: data.accent_color,
      }));
  return { title: data.title, description: data.description, siteName: data.site_name, image };
}

async function previewFromLegacyData(origin, dataParam) {
  const loteoId = dataParam.match(LOTEO_ID_RE)?.[1];
  const data = loteoId ? await fetchJson(`${PUBLIC_API}/loteos/${loteoId}/preview`) : null;
  const name = data?.name ?? null;
  return {
    title: name ? `${name} — ${DEFAULT_TITLE}` : DEFAULT_TITLE,
    description: name ? `Recorré ${name} en 360° y elegí tu lote.` : DEFAULT_DESCRIPTION,
    siteName: DEFAULT_TITLE,
    image: ogCardUrl(origin, { title: name ?? DEFAULT_TITLE }),
  };
}

export const config = { matcher: ['/', '/:project', '/:project/:loteo'] };

export default async function middleware(req) {
  if (!isBot(req)) return;

  const reqUrl = new URL(req.url);
  const slugs = slugsFromPath(reqUrl.pathname);
  const dataParam = reqUrl.searchParams.get('data');
  if (!slugs && reqUrl.pathname !== '/') return;

  const preview = (slugs && !dataParam
    ? await previewFromSlugs(reqUrl.origin, slugs, reqUrl.searchParams.get('lote'))
    : null) ?? await previewFromLegacyData(reqUrl.origin, dataParam ?? '');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(preview.title)}</title>
  <meta name="description" content="${escapeHtml(preview.description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(preview.siteName)}" />
  <meta property="og:url" content="${escapeHtml(req.url)}" />
  <meta property="og:title" content="${escapeHtml(preview.title)}" />
  <meta property="og:description" content="${escapeHtml(preview.description)}" />
  <meta property="og:image" content="${escapeHtml(preview.image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(preview.title)}" />
  <meta name="twitter:description" content="${escapeHtml(preview.description)}" />
  <meta name="twitter:image" content="${escapeHtml(preview.image)}" />
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
