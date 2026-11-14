#!/usr/bin/env node
// MCP server for notry: exposes the auto-detected lots of a loteo (drafts) and the data of
// its real lots, so an assistant can fill the drafts in with names, prices and sizes that
// match the rest. Talks to notry-back over HTTP; runs over stdio (Claude Code starts it).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { api, apiBase, listAll } from './api.js';
import { bbox, centroid, distance, median, polygonArea, round } from './geometry.js';

const server = new McpServer({ name: 'notry', version: '0.1.0' });

// Tool results are JSON as text: the model reads it fine and it keeps every field.
const json = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const num = value => (value == null ? null : Number(value));

/** Real lot → what's useful to imitate it: its data plus where it sits on the plano. */
function summarizeLot(lot) {
  const coords = lot.blueprint_coordinates?.length >= 3 ? lot.blueprint_coordinates : null;
  return {
    id: lot.id,
    name: lot.name,
    status: lot.status,
    price: num(lot.price),
    area_m2: num(lot.area_m2),
    manzana: lot.manzana,
    frente: num(lot.frente),
    fondo: num(lot.fondo),
    orientation: lot.orientation,
    comments: lot.comments,
    centroid: coords ? centroid(coords).map(v => round(v)) : null,
    plano_area: coords ? round(polygonArea(coords), 6) : null,
  };
}

function summarizeDraft(draft) {
  const coords = draft.blueprint_coordinates;
  const box = bbox(coords);
  return {
    id: draft.id,
    label: draft.label,
    centroid: centroid(coords).map(v => round(v)),
    bbox: Object.fromEntries(Object.entries(box).map(([k, v]) => [k, round(v)])),
    plano_area: round(polygonArea(coords), 6),
    vertices: coords.length,
  };
}

const loteoLots = async loteoId => (await listAll(`/lots?loteo_id=${loteoId}`)).map(summarizeLot);

server.registerTool('list_loteos', {
  title: 'Listar loteos',
  description: 'Loteos the account can access, with id and name. Start here to get a loteo_id.',
  annotations: { readOnlyHint: true },
}, async () => {
  const loteos = await listAll('/loteos');
  return json(loteos.map(l => ({ id: l.id, name: l.name, slug: l.slug, has_plano: Boolean(l.blueprint_url) })));
});

server.registerTool('list_pending_lots', {
  title: 'Listar lotes pendientes',
  description:
    'Auto-detected lot polygons of a loteo that still have no data (drafts). Positions are '
    + 'normalized to the plano image: x grows to the right, y grows downwards, both in [0, 1]. '
    + 'Sorted in reading order (top to bottom, then left to right).',
  inputSchema: { loteo_id: z.string().uuid() },
  annotations: { readOnlyHint: true },
}, async ({ loteo_id }) => {
  const drafts = (await api(`/loteos/${loteo_id}/drafts`)).map(summarizeDraft);
  // Rows of about 2% of the plano height count as the same row, so lots side by side read left to right.
  drafts.sort((a, b) => Math.round(a.centroid[1] * 50) - Math.round(b.centroid[1] * 50) || a.centroid[0] - b.centroid[0]);
  return json({ count: drafts.length, drafts });
});

server.registerTool('get_loteo_context', {
  title: 'Contexto del loteo',
  description:
    'Real lots of a loteo with their data and plano position, plus derived figures to fill '
    + 'drafts consistently: m2 per plano-area unit (to estimate area_m2 from a draft\'s '
    + 'plano_area), median USD per m2, the manzanas in use and how lots are named. '
    + 'Use it before create_lots_from_drafts.',
  inputSchema: { loteo_id: z.string().uuid() },
  annotations: { readOnlyHint: true },
}, async ({ loteo_id }) => {
  const lots = await loteoLots(loteo_id);
  const measured = lots.filter(l => l.area_m2 && l.plano_area);
  return json({
    lot_count: lots.length,
    // Same plano → same scale, so the median ratio converts a draft's plano_area to m2.
    m2_per_plano_area: round(median(measured.map(l => l.area_m2 / l.plano_area)), 2),
    usd_per_m2_median: round(median(lots.filter(l => l.area_m2).map(l => l.price / l.area_m2)), 2),
    price_median: median(lots.map(l => l.price)),
    manzanas: [...new Set(lots.map(l => l.manzana).filter(Boolean))].sort(),
    status_counts: lots.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] ?? 0) + 1 }), {}),
    name_examples: lots.slice(0, 15).map(l => l.name),
    lots,
  });
});

server.registerTool('get_draft_neighbors', {
  title: 'Vecinos de un pendiente',
  description:
    'For one draft, the nearest real lots on the plano with all their data and the distance '
    + 'in plano units. Neighbors usually share manzana, size and price range, and their names '
    + 'show the numbering to continue.',
  inputSchema: {
    loteo_id: z.string().uuid(),
    draft_id: z.string().uuid(),
    k: z.number().int().min(1).max(20).default(6),
  },
  annotations: { readOnlyHint: true },
}, async ({ loteo_id, draft_id, k }) => {
  const drafts = await api(`/loteos/${loteo_id}/drafts`);
  const draft = drafts.find(d => d.id === draft_id);
  if (!draft) throw new Error(`No hay un pendiente ${draft_id} en ese loteo`);
  const here = centroid(draft.blueprint_coordinates);
  const neighbors = (await loteoLots(loteo_id))
    .filter(l => l.centroid)
    .map(l => ({ ...l, distance: round(distance(here, l.centroid)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
  return json({ draft: summarizeDraft(draft), neighbors });
});

const lotInput = z.object({
  draft_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  price: z.number().positive(),
  area_m2: z.number().positive().optional(),
  manzana: z.string().max(20).optional(),
  frente: z.number().positive().optional(),
  fondo: z.number().positive().optional(),
  orientation: z.string().max(30).optional(),
  status: z.enum(['available', 'reserved', 'sold', 'unavailable']).default('available'),
  comments: z.string().max(2000).optional(),
});

server.registerTool('create_lots_from_drafts', {
  title: 'Crear lotes desde pendientes',
  description:
    'Turns drafts into real lots (up to 50 per call). Each one keeps its draft polygon and the '
    + 'draft is deleted in the same transaction. Only drafts can be created here: existing lots '
    + 'are never touched. Items are independent: one failing does not stop the rest, and the '
    + 'result says which ones failed and why.',
  inputSchema: { loteo_id: z.string().uuid(), lots: z.array(lotInput).min(1).max(50) },
  annotations: { destructiveHint: false, idempotentHint: false },
}, async ({ loteo_id, lots }) => {
  const results = [];
  // One by one on purpose: a bad item (duplicate slug, a draft already used) only fails itself.
  for (const { draft_id, ...fields } of lots) {
    try {
      const lot = await api('/lots', { method: 'POST', body: { ...fields, loteo_id, draft_id } });
      results.push({ draft_id, ok: true, lot_id: lot.id, name: lot.name });
    } catch (error) {
      results.push({ draft_id, ok: false, error: error.message });
    }
  }
  return json({ created: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results });
});

server.registerTool('discard_drafts', {
  title: 'Descartar pendientes',
  description:
    'Deletes drafts that are not lots (a street, a green space, a polygon the detector got '
    + 'wrong). Cannot be undone.',
  inputSchema: { loteo_id: z.string().uuid(), draft_ids: z.array(z.string().uuid()).min(1).max(100) },
  annotations: { destructiveHint: true },
}, async ({ loteo_id, draft_ids }) => {
  const results = [];
  for (const id of draft_ids) {
    try {
      await api(`/loteos/${loteo_id}/drafts/${id}`, { method: 'DELETE' });
      results.push({ draft_id: id, ok: true });
    } catch (error) {
      results.push({ draft_id: id, ok: false, error: error.message });
    }
  }
  return json(results);
});

// stdout is the protocol channel: anything for humans goes to stderr.
await server.connect(new StdioServerTransport());
console.error(`notry-mcp listo, API: ${apiBase}`);
