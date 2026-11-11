import React, { useMemo } from 'react';
import { BadgePercent, Boxes, CheckCircle2, Users } from 'lucide-react';
import KanbanBoard from '../KanbanBoard';
import ActivityFeed from '../ActivityFeed';
import ShellLayout from '../ShellLayout';
import {
  ErrorBoundary,
  PageHeader,
  PageLayout,
  Panel,
  SectionHeader,
  SummaryBand,
  SummaryMetric,
} from '../../ui/components';
import { daysSinceContact, NEGLECTED_THRESHOLD_DAYS } from '../../utils/prospects';
import './InicioView.css';

// Counts for the summary metrics. "activos" leaves sold prospects out,
// since they no longer need follow-up.
function computePipeline(prospects = []) {
  let vendidos = 0;
  let negociacion = 0;
  for (const p of prospects) {
    if (p.category === 'vendido') vendidos++;
    else if (p.category === 'negociacion') negociacion++;
  }
  return { total: prospects.length, activos: prospects.length - vendidos, vendidos, negociacion };
}

// Unsold prospects that need action today: never contacted, or last contact
// older than the threshold. Most overdue first.
function computePending(prospects = []) {
  const overdue = [];
  let uncontacted = 0;
  for (const p of prospects) {
    if (p.category === 'vendido') continue;
    const days = daysSinceContact(p.last_contact);
    if (days == null) uncontacted++;
    else if (days >= NEGLECTED_THRESHOLD_DAYS) overdue.push({ id: p.id, name: p.name, days });
  }
  overdue.sort((a, b) => b.days - a.days);
  return { overdue, uncontacted };
}

// "Para hoy" block on the left of the summary band; shows an all-clear state when nothing is pending.
function TodayLead({ pending }) {
  const { overdue, uncontacted } = pending;
  const total = overdue.length + uncontacted;

  if (total === 0) {
    return (
      <div className="inicio-today inicio-today--clear">
        <span className="inicio-today-eyebrow">Para hoy</span>
        <strong className="inicio-today-title">
          <CheckCircle2 size={22} aria-hidden="true" />
          Seguimiento al día
        </strong>
        <p className="inicio-today-sub">
          Ningún prospecto lleva más de {NEGLECTED_THRESHOLD_DAYS} días sin contacto.
        </p>
      </div>
    );
  }

  return (
    <div className="inicio-today">
      <span className="inicio-today-eyebrow">Para hoy</span>
      <strong className="inicio-today-title">
        <span className="inicio-today-count">{total}</span>
        {total === 1 ? 'prospecto para contactar' : 'prospectos para contactar'}
      </strong>
      <p className="inicio-today-sub">
        {[
          overdue.length > 0 && `${overdue.length} sin contacto hace +${NEGLECTED_THRESHOLD_DAYS} días`,
          uncontacted > 0 && `${uncontacted} todavía sin contactar`,
        ].filter(Boolean).join(' · ')}
      </p>
      {overdue.length > 0 && (
        <p className="inicio-today-oldest">
          Más demorado: <span className="inicio-today-name">{overdue[0].name}</span>
          <span className="inicio-today-days"> · hace {overdue[0].days} días</span>
        </p>
      )}
    </div>
  );
}

export default function InicioView({
  dashboardSummary,
  allProspectosList,
  inventoryLoteos,
  advisorsList,
  onUpdateProspectCategory,
  activities = [],
  apiFetch,
  loteOwnerId,
  addActivity,
}) {
  const pipeline = useMemo(() => computePipeline(allProspectosList), [allProspectosList]);
  const pending = useMemo(() => computePending(allProspectosList), [allProspectosList]);

  return (
    <ShellLayout className="inicio-shell">
      <PageLayout className="inicio-page">
        <PageHeader
          eyebrow="Operación comercial"
          title="Inicio"
          description="El pulso de inventario, cartera y seguimiento para decidir qué mover hoy."
        />

        <SummaryBand
          className="inicio-summary"
          aria-label="Resumen operativo"
          lead={<TodayLead pending={pending} />}
        >
          <SummaryMetric
            className="inicio-summary-metric--available"
            icon={<Boxes size={20} />}
            label="Lotes disponibles"
            hint={
              dashboardSummary
                ? `de ${dashboardSummary.total_lotes} · ${dashboardSummary.lotes_reservados} reservados`
                : null
            }
            value={dashboardSummary?.lotes_disponibles ?? '—'}
          />
          <SummaryMetric
            className="inicio-summary-metric--prospects"
            icon={<Users size={20} />}
            label="Prospectos activos"
            hint={`${pipeline.negociacion} en negociación`}
            value={pipeline.activos}
          />
          <SummaryMetric
            icon={<BadgePercent size={20} />}
            label="Conversión"
            hint={`${pipeline.vendidos} de ${pipeline.total} vendidos`}
            value={pipeline.total > 0 ? `${((pipeline.vendidos / pipeline.total) * 100).toFixed(1)}%` : '—'}
          />
        </SummaryBand>

        <div className="inicio-grid">
          <Panel className="kanban-section">
            <SectionHeader
              className="kanban-header"
              eyebrow="Pipeline"
              title="Gestión de prospectos"
              sub="Arrastrá prospectos entre etapas para actualizar su seguimiento"
            />
            <ErrorBoundary label="Error en el tablero Kanban">
              <KanbanBoard
                prospectosList={allProspectosList}
                loteos={inventoryLoteos}
                advisorsList={advisorsList}
                onUpdateProspectCategory={onUpdateProspectCategory}
                apiFetch={apiFetch}
                loteOwnerId={loteOwnerId}
                addActivity={addActivity}
              />
            </ErrorBoundary>
          </Panel>

          <Panel className="inicio-activity">
            <ActivityFeed
              activities={activities}
              sectionTitle="Actividad reciente"
              sectionSubtitle="Últimos movimientos del equipo"
            />
          </Panel>
        </div>
      </PageLayout>
    </ShellLayout>
  );
}
