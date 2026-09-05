import React from 'react';
import { BadgePercent, Boxes, Users } from 'lucide-react';
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
import './InicioView.css';

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
          lead={
            <div className="inicio-summary-lead">
              <span className="inicio-summary-eyebrow">Panorama comercial</span>
              <strong>Todo lo esencial, al día.</strong>
              <p>Disponibilidad, contactos y conversión de tu operación.</p>
            </div>
          }
        >
          <SummaryMetric
            className="inicio-summary-metric--available"
            icon={<Boxes size={17} />}
            label="Lotes disponibles"
            hint="listos para venta"
            value={dashboardSummary?.lotes_disponibles ?? '—'}
          />
          <SummaryMetric
            className="inicio-summary-metric--prospects"
            icon={<Users size={17} />}
            label="Total prospectos"
            hint="en seguimiento"
            value={dashboardSummary?.total_prospectos ?? '—'}
          />
          <SummaryMetric
            icon={<BadgePercent size={17} />}
            label="Conversión"
            hint="prospectos vendidos"
            value={
              allProspectosList && allProspectosList.length > 0
                ? `${((allProspectosList.filter(p => p.category === 'vendido').length / allProspectosList.length) * 100).toFixed(1)}%`
                : '—'
            }
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
