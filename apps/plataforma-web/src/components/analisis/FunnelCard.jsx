import { useMemo, useRef, useState } from 'react';
import { Panel, SectionHeader, Loader } from '../../ui/components';
import './FunnelCard.css';

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const fmt = (n) => n.toLocaleString('es-AR');

const NODE_W = 22;
const PAD = 14;
const PLOT_TOP = 40;
const COL_X = [90, 320, 550, 780];
const DIVIDER_X = 940;
const CALLOUT_CX = DIVIDER_X + 90;
// The trunk always renders at this height regardless of the actual session
// count, so the shape stays legible whether there were 3 sessions or 30,000 —
// only the proportions inside it change, never the pixel scale.
const TARGET_HEIGHT = 300;
// Below this many sessions a shape doesn't say much more than the raw
// numbers do, so the table is the more useful default (still one click away
// from the diagram either way).
const LOW_VOLUME_THRESHOLD = 10;

// The funnel branches into two shapes:
//  - total -> click / no-click: exhaustive (click + no-click === total).
//  - click -> form / whatsapp: NOT exhaustive — a session can open the form,
//    write on WhatsApp, both, or neither, so they're independent counts that
//    don't have to add up to "click". Their ribbons just claim part of
//    click's edge (or, defensively, get clamped if they'd overflow it).
function buildModel(stats) {
  const nodes = [
    { id: 'total', col: 0, value: stats.sessions_total, kind: 'trunk', label: 'Entraron al visor' },
    { id: 'click', col: 1, value: stats.lote_click, kind: 'trunk', label: 'Hicieron click en un lote' },
    { id: 'noclick', col: 1, value: Math.max(stats.sessions_total - stats.lote_click, 0), kind: 'lost', label: 'No hizo click' },
    { id: 'form', col: 2, value: stats.form_open, kind: 'form', label: 'Abrieron el formulario' },
    { id: 'whatsapp', col: 2, value: stats.whatsapp_click, kind: 'whatsapp', label: 'Escribieron por WhatsApp' },
    { id: 'submit', col: 3, value: stats.form_submit, kind: 'form', label: 'Enviaron la solicitud' },
    { id: 'nosubmit', col: 3, value: Math.max(stats.form_open - stats.form_submit, 0), kind: 'lost', label: 'No la enviaron' },
  ];
  const links = [
    { source: 'total', target: 'click' },
    { source: 'total', target: 'noclick' },
    { source: 'click', target: 'form' },
    { source: 'click', target: 'whatsapp' },
    { source: 'form', target: 'submit' },
    { source: 'form', target: 'nosubmit' },
  ];
  return { nodes, links };
}

function layout(nodes, links) {
  const byId = Object.fromEntries(nodes.map((n) => [n.id, { ...n }]));
  const byCol = [[], [], [], []];
  Object.values(byId).forEach((n) => byCol[n.col].push(n));

  // Normalize to a fixed target height instead of 1px-per-session: with a
  // literal 1:1 scale, a loteo with 1 session renders 1px-tall slivers
  // (illegible) and one with 50,000 renders a 50,000px-tall SVG (broken).
  const scale = byId.total.value > 0 ? TARGET_HEIGHT / byId.total.value : 1;

  // Top-aligned: the surviving path always starts where its parent started,
  // so it never reads as happening "before" it — only the lost flow cascades
  // further down.
  byCol.forEach((colNodes) => {
    let y = PLOT_TOP;
    colNodes.forEach((n) => {
      n.h = n.value * scale;
      n.y0 = y;
      n.y1 = y + n.h;
      n.x = COL_X[n.col];
      y = n.y1 + PAD;
    });
  });

  const resolvedLinks = links.map((l) => ({ ...l }));
  const outgoing = {};
  resolvedLinks.forEach((l) => {
    (outgoing[l.source] = outgoing[l.source] || []).push(l);
  });
  Object.keys(outgoing).forEach((sid) => {
    const src = byId[sid];
    let cursor = src.y0;
    outgoing[sid].forEach((l) => {
      const tgt = byId[l.target];
      l.sy0 = cursor;
      l.sy1 = Math.min(cursor + tgt.h, src.y1); // clamp: guards non-exhaustive forks
      cursor = l.sy1;
      l.ty0 = tgt.y0;
      l.ty1 = tgt.y1;
    });
  });

  const maxStack = Math.max(...byCol.map((col) => (col.length ? col[col.length - 1].y1 : PLOT_TOP)));
  return { byId, links: resolvedLinks, height: Math.max(maxStack, PLOT_TOP) + 40 };
}

function ribbonPath(x0, sy0, sy1, x1, ty0, ty1) {
  const cx = (x0 + x1) / 2;
  return `M ${x0},${sy0} C ${cx},${sy0} ${cx},${ty0} ${x1},${ty0} L ${x1},${ty1} C ${cx},${ty1} ${cx},${sy1} ${x0},${sy1} Z`;
}

function Pill({ x, y, text, lost }) {
  const w = text.length * 6.6 + 20;
  const h = 24;
  return (
    <g className="funnel-pill">
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} />
      <text x={x} y={y + 4} textAnchor="middle" className={lost ? 'lost' : ''}>{text}</text>
    </g>
  );
}

export default function FunnelCard({ selectedLoteo, funnelStats, analisisLastDays, isLoading = false }) {
  // The default view is derived from the dataset (low volume -> table,
  // otherwise diagram), but the toggle can override it for as long as this
  // exact dataset is showing. Resetting the override when funnelStats
  // changes reference is the "adjust state during render" pattern React
  // recommends instead of a setState-in-effect for derived state.
  const [manualView, setManualView] = useState(null);
  const [prevStats, setPrevStats] = useState(funnelStats);
  if (funnelStats !== prevStats) {
    setPrevStats(funnelStats);
    setManualView(null);
  }

  const [tip, setTip] = useState(null);
  const wrapRef = useRef(null);
  const hasData = !!funnelStats && funnelStats.sessions_total > 0;
  const lowVolume = hasData && funnelStats.sessions_total < LOW_VOLUME_THRESHOLD;
  const view = manualView ?? (lowVolume ? 'table' : 'diagram');

  const model = useMemo(() => {
    if (!hasData) return null;
    const { nodes, links } = buildModel(funnelStats);
    return layout(nodes, links);
  }, [hasData, funnelStats]);

  const showTip = (ev, html) => {
    const wrapRect = wrapRef.current.getBoundingClientRect();
    const targetRect = ev.currentTarget.getBoundingClientRect();
    setTip({
      x: targetRect.left + targetRect.width / 2 - wrapRect.left,
      y: targetRect.top - wrapRect.top,
      html,
    });
  };
  const hideTip = () => setTip(null);

  const contacted = hasData ? funnelStats.whatsapp_click + funnelStats.form_submit : 0;
  const convPct = hasData ? Math.round((contacted / funnelStats.sessions_total) * 1000) / 10 : 0;

  const tableRows = hasData
    ? [
        { label: 'Entraron al visor', value: funnelStats.sessions_total, pct: null },
        { label: 'Hicieron click en un lote', value: funnelStats.lote_click, pct: pct(funnelStats.lote_click, funnelStats.sessions_total) },
        { label: 'No hizo click', value: model.byId.noclick.value, pct: pct(model.byId.noclick.value, funnelStats.sessions_total), indent: 1, lost: true },
        { label: 'Abrieron el formulario', value: funnelStats.form_open, pct: pct(funnelStats.form_open, funnelStats.lote_click), indent: 1 },
        { label: 'Escribieron por WhatsApp', value: funnelStats.whatsapp_click, pct: pct(funnelStats.whatsapp_click, funnelStats.lote_click), indent: 1 },
        { label: 'Enviaron la solicitud', value: funnelStats.form_submit, pct: pct(funnelStats.form_submit, funnelStats.form_open), indent: 2 },
        { label: 'No la enviaron', value: model.byId.nosubmit.value, pct: pct(model.byId.nosubmit.value, funnelStats.form_open), indent: 2, lost: true },
      ]
    : [];

  return (
    <Panel as="section" className="funnel-card" flush>
      <SectionHeader
        className="funnel-card-header"
        eyebrow="Embudo de conversión"
        title="Del ingreso al visor a la solicitud"
        sub={`Sesiones distintas en los últimos ${analisisLastDays} días — ${selectedLoteo?.name ?? 'selecciona un loteo'}`}
        actions={
          hasData && (
            <button
              type="button"
              className="funnel-view-toggle"
              aria-pressed={view === 'table'}
              onClick={() => setManualView(view === 'diagram' ? 'table' : 'diagram')}
            >
              {view === 'diagram' ? 'Ver como tabla' : 'Ver como diagrama'}
            </button>
          )
        }
      />

      {lowVolume && (
        <p className="funnel-low-volume-note">
          Muy pocas sesiones ({fmt(funnelStats.sessions_total)}) en este período — el diagrama dice poco con tan
          bajo volumen, así que arrancamos en la tabla. Podés forzar el diagrama con el botón.
        </p>
      )}

      {isLoading ? (
        <div className="funnel-loading"><Loader /></div>
      ) : !hasData ? (
        <p className="funnel-empty">Sin actividad registrada para este loteo en el período.</p>
      ) : view === 'table' ? (
        <div className="funnel-table-wrap">
          <table className="funnel-table">
            <thead>
              <tr><th>Paso</th><th>Sesiones</th><th>% del paso anterior</th></tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.label} className={r.lost ? 'lost' : ''}>
                  <td className={r.indent ? 'indent' : ''} style={r.indent ? { paddingLeft: 10 + r.indent * 16 } : undefined}>
                    {r.label}
                  </td>
                  <td className="num">{fmt(r.value)}</td>
                  <td className="num">{r.pct == null ? '—' : `${r.pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="funnel-wrap" ref={wrapRef}>
          <svg
            className="funnel-sankey"
            viewBox={`0 0 1200 ${model.height}`}
            role="img"
            aria-label="Diagrama de flujo del embudo de conversión"
          >
            {model.links.map((l) => {
              const src = model.byId[l.source];
              const tgt = model.byId[l.target];
              const isLost = tgt.kind === 'lost';
              const p = pct(tgt.value, src.value);
              return (
                <path
                  key={`${l.source}-${l.target}`}
                  className="funnel-ribbon"
                  d={ribbonPath(src.x + NODE_W, l.sy0, l.sy1, tgt.x, l.ty0, l.ty1)}
                  fill={`var(--funnel-${tgt.kind})`}
                  opacity={isLost ? 0.4 : 0.68}
                  tabIndex={0}
                  onPointerEnter={(ev) => showTip(ev, `<strong>${fmt(tgt.value)} sesiones</strong><div>${p}% de "${src.label}"</div>`)}
                  onFocus={(ev) => showTip(ev, `<strong>${fmt(tgt.value)} sesiones</strong><div>${p}% de "${src.label}"</div>`)}
                  onPointerLeave={hideTip}
                  onBlur={hideTip}
                />
              );
            })}

            {Object.values(model.byId).map((n) => (
              <g
                key={n.id}
                className="funnel-node"
                tabIndex={0}
                onPointerEnter={(ev) => showTip(ev, `<strong>${fmt(n.value)} sesiones</strong><div>${n.label}</div>`)}
                onFocus={(ev) => showTip(ev, `<strong>${fmt(n.value)} sesiones</strong><div>${n.label}</div>`)}
                onPointerLeave={hideTip}
                onBlur={hideTip}
              >
                <rect
                  className="funnel-node-rect"
                  x={n.x}
                  y={n.y0}
                  width={NODE_W}
                  height={Math.max(n.h, 2)}
                  rx={3}
                  fill={`var(--funnel-${n.kind})`}
                  opacity={n.kind === 'lost' ? 0.75 : 1}
                />
              </g>
            ))}

            <Pill
              x={model.byId.total.x - 10 - (fmt(model.byId.total.value).length * 6.6 + 20) / 2}
              y={(model.byId.total.y0 + model.byId.total.y1) / 2}
              text={fmt(model.byId.total.value)}
            />
            {model.links.map((l) => {
              const src = model.byId[l.source];
              const tgt = model.byId[l.target];
              const midX = (src.x + NODE_W + tgt.x) / 2;
              const midY = ((l.sy0 + l.sy1) / 2 + (l.ty0 + l.ty1) / 2) / 2;
              return (
                <Pill
                  key={`pill-${l.source}-${l.target}`}
                  x={midX}
                  y={midY}
                  text={`${fmt(tgt.value)} · ${pct(tgt.value, src.value)}%`}
                  lost={tgt.kind === 'lost'}
                />
              );
            })}

            <line
              x1={DIVIDER_X} y1={PLOT_TOP - 6} x2={DIVIDER_X} y2={model.height - 30}
              className="funnel-callout-divider"
            />
            <g className="funnel-callout" transform={`translate(${CALLOUT_CX}, ${model.height / 2})`}>
              <text y={-32} textAnchor="middle" className="funnel-callout-eyebrow">Conversión total</text>
              <text y={4} textAnchor="middle" className="funnel-callout-value">{convPct}%</text>
              <text y={26} textAnchor="middle" className="funnel-callout-sub">Llegaron a un contacto</text>
              <text y={41} textAnchor="middle" className="funnel-callout-sub">(WhatsApp o formulario)</text>
            </g>
          </svg>

          {tip && (
            <div className="funnel-tooltip visible" style={{ left: tip.x, top: tip.y }} dangerouslySetInnerHTML={{ __html: tip.html }} />
          )}

          <div className="funnel-legend">
            <span className="funnel-legend-item"><span className="funnel-legend-swatch" style={{ background: 'var(--funnel-whatsapp)' }} />WhatsApp</span>
            <span className="funnel-legend-item"><span className="funnel-legend-swatch" style={{ background: 'var(--funnel-form)' }} />Formulario → solicitud</span>
            <span className="funnel-legend-item"><span className="funnel-legend-swatch" style={{ background: 'var(--funnel-lost)' }} />No continuó</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
