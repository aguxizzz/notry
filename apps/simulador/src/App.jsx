import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CircleCheck, Info, MapPinned, Minus, Plus } from 'lucide-react';
import { API_BASE, VISOR_URL, fetchSimulatorConfig, fetchSimulatorConfigBySlug } from './api/simulator.js';
import { computeSimulation, formatArs, formatMonthYear, formatUcb } from './simulator.js';

const MIN_MONTHLY = 80_000;
const MAX_MONTHLY = 500_000;
const STEP_MONTHLY = 10_000;
const PROJECT_ID = import.meta.env.VITE_NOTRY_PROJECT_ID;
// Deploy multi-proyecto: /<slug> resuelve el proyecto en runtime contra el backend.
// Sin slug en la URL, cae al proyecto fijo del deploy (compatibilidad con el modo mono-proyecto).
const PROJECT_SLUG = window.location.pathname.split('/').filter(Boolean)[0] || null;
const HAS_PROJECT_IDENTITY = Boolean(PROJECT_SLUG || PROJECT_ID);

function MonthInput({ value, onChange }) {
  return (
    <div className="money-input">
      <span>$</span>
      <input
        inputMode="numeric"
        aria-label="Anticipo en pesos"
        value={value.toLocaleString('es-AR')}
        onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, '')) || 0)}
      />
      <span>ARS</span>
    </div>
  );
}

function App() {
  const [monthlyArs, setMonthlyArs] = useState(180_000);
  const [downPaymentArs, setDownPaymentArs] = useState(0);
  const [planId, setPlanId] = useState(null);
  const [project, setProject] = useState(null);
  const [configurationError, setConfigurationError] = useState(HAS_PROJECT_IDENTITY ? null : 'Esta URL no tiene un proyecto asociado. Agregá el slug del proyecto o configurá VITE_NOTRY_PROJECT_ID.');
  const [isLoadingConfiguration, setIsLoadingConfiguration] = useState(HAS_PROJECT_IDENTITY);

  const simulation = useMemo(
    () => (project && planId ? computeSimulation(project, { monthlyArs, downPaymentArs, planId }) : null),
    [project, planId, monthlyArs, downPaymentArs],
  );
  const leadLot = simulation?.candidates[0] ?? null;
  const monthlyProgress = ((monthlyArs - MIN_MONTHLY) / (MAX_MONTHLY - MIN_MONTHLY)) * 100;
  const writingThresholdUcb = leadLot?.writingThresholdUcb ?? null;
  const writingProgress = simulation && leadLot
    ? Math.min(100, (simulation.downPaymentUcb / writingThresholdUcb) * 100)
    : null;
  const writingRemainingUcb = writingProgress == null ? null : Math.max(0, writingThresholdUcb - simulation.downPaymentUcb);
  const monthsToWritingThreshold = writingRemainingUcb != null && leadLot?.installmentUcb
    ? Math.ceil(writingRemainingUcb / leadLot.installmentUcb)
    : null;
  const estimatedWritingDate = monthsToWritingThreshold > 0
    ? new Date(new Date().setMonth(new Date().getMonth() + monthsToWritingThreshold))
    : null;

  useEffect(() => {
    if (!HAS_PROJECT_IDENTITY) {
      return undefined;
    }

    const controller = new AbortController();
    const loadConfig = PROJECT_SLUG
      ? fetchSimulatorConfigBySlug(PROJECT_SLUG, { signal: controller.signal })
      : fetchSimulatorConfig(PROJECT_ID, { signal: controller.signal });
    loadConfig
      .then((configuration) => {
        setProject(configuration);
        setPlanId(configuration.plans[0]?.id ?? null);
        window.parent?.postMessage({ type: 'notry:simulator-ready', projectId: configuration.id }, '*');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setConfigurationError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingConfiguration(false);
      });
    return () => controller.abort();
  }, []);

  if (isLoadingConfiguration) {
    return <main className="simulator-shell"><section className="simulator"><div className="panel empty-result"><h1>Preparando simulador…</h1><p>Estamos consultando la configuración comercial del proyecto.</p></div></section></main>;
  }

  if (configurationError || !project) {
    return <main className="simulator-shell"><section className="simulator"><div className="panel empty-result"><Info size={22} /><h1>No pudimos iniciar el simulador.</h1><p>{configurationError || 'El proyecto no está disponible.'}</p></div></section></main>;
  }

  const openLots = (lotIds = simulation?.candidates.map((lot) => lot.id) ?? []) => {
    if (!simulation) return;
    window.parent?.postMessage({
      type: 'notry:simulator-view-lots',
      projectId: project.id,
      eligibleLotIds: lotIds,
      monthlyUcb: simulation.monthlyUcb,
      downPaymentUcb: simulation.downPaymentUcb,
      planId,
    }, '*');

    if (!project.viewerLoteoId) return;
    const dataUrl = `${API_BASE}/loteos/${project.viewerLoteoId}/group_visor_data`;
    window.open(`${VISOR_URL}/?data=${dataUrl}&recommended=${lotIds.join(',')}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="simulator-shell">
      <section className="simulator" aria-labelledby="simulator-title">
        <header className="sim-page-header">
          <div>
            <p className="eyebrow">Operación comercial</p>
            <h1 id="simulator-title">Simulador de compra</h1>
            <p className="page-description">Configurá una alternativa de pago y encontrá lotes compatibles con tu capacidad mensual.</p>
          </div>
          <span className="project-chip"><MapPinned size={15} /> {project.name}</span>
        </header>

        <section className="sim-summary" aria-label="Contexto del proyecto">
          <div className="sim-summary-lead">
            <span>Proyecto seleccionado</span>
            <strong>{project.name}</strong>
            <p>Financiación en UCB</p>
          </div>
          <div className="summary-item">
            <span>Valor UCB vigente</span>
            <strong>{formatArs(project.cementRateArs)}</strong>
            <small>bolsa de cemento de 25 kg</small>
          </div>
          <div className="summary-item">
            <span>Dólar vigente</span>
            <strong>{formatArs(project.usdRateArs)}</strong>
            <small>precio de lista de los lotes, en USD</small>
          </div>
          <div className="summary-item">
            <span>Cuotas</span>
            <strong>Por plazo</strong>
            <small>elegí la duración que te resulte mejor</small>
          </div>
        </section>

        <div className="sim-grid">
          <section className="controls panel" aria-label="Configurá tu plan">
            <header className="section-heading">
              <div><p>Simulación</p><h2>Definí tu plan</h2></div>
            </header>
            <div className="step">
              <p className="step-number">01</p>
              <div className="step-content">
                <label htmlFor="monthly">¿Cuánto querés destinar por mes?</label>
                <div className="monthly-value">{formatArs(monthlyArs)} <span>/ mes</span></div>
                <div className="range-wrap">
                  <input
                    id="monthly"
                    className="range"
                    type="range"
                    min={MIN_MONTHLY}
                    max={MAX_MONTHLY}
                    step={STEP_MONTHLY}
                    value={monthlyArs}
                    style={{ '--range-progress': `${monthlyProgress}%` }}
                    onChange={(event) => setMonthlyArs(Number(event.target.value))}
                  />
                </div>
                <div className="range-labels"><span>{formatArs(MIN_MONTHLY)}</span><span>{formatArs(MAX_MONTHLY)}</span></div>
                <p className="unit-copy">{simulation ? <>Hoy equivale a <strong>{formatUcb(simulation.monthlyUcb)} UCB</strong> por mes.</> : 'Calculando capacidad en UCB…'}</p>
              </div>
            </div>

            <div className="step">
              <p className="step-number">02</p>
              <div className="step-content">
                <label>¿Querés sumar un anticipo?</label>
                <div className="downpayment-row">
                  <button type="button" className="icon-button" aria-label="Reducir anticipo" onClick={() => setDownPaymentArs(Math.max(0, downPaymentArs - 50_000))}><Minus size={16} /></button>
                  <MonthInput value={downPaymentArs} onChange={setDownPaymentArs} />
                  <button type="button" className="icon-button" aria-label="Aumentar anticipo" onClick={() => setDownPaymentArs(downPaymentArs + 50_000)}><Plus size={16} /></button>
                </div>
                {writingProgress != null ? (
                  <div className="writing-threshold">
                    <div><span>Avance hacia el umbral de escrituración</span><strong>{formatUcb(writingProgress)}%</strong></div>
                    <div className="writing-threshold__track" role="progressbar" aria-label="Avance hacia el umbral de escrituración" aria-valuenow={writingProgress} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${writingProgress}%` }} /></div>
                    <p>{writingRemainingUcb > 0 ? `Te faltan ${formatUcb(writingRemainingUcb)} UCB para alcanzar el umbral e iniciar el trámite.` : 'Alcanzás el umbral económico para iniciar el trámite.'}</p>
                  </div>
                ) : (
                  <p className="unit-copy">El anticipo reduce el monto a financiar y acerca el umbral para iniciar la escrituración. La condición final se confirma al concretar la compra.</p>
                )}
              </div>
            </div>

            <div className="step step--last">
              <p className="step-number">03</p>
              <div className="step-content">
                <span className="field-label" id="plan-label">¿En qué plazo querés financiar?</span>
                <div className="plans" role="radiogroup" aria-labelledby="plan-label">
                  {project.plans.map((plan) => {
                    const selected = plan.id === planId;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        className={`plan${selected ? ' is-selected' : ''}`}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPlanId(plan.id)}
                      >
                        <strong>{plan.installments} cuotas</strong>
                        <span>{plan.years} años de financiación</span>
                      </button>
                    );
                  })}
                </div>
                <p className="unit-copy unit-copy--prominent">Cada plazo cambia los lotes disponibles y el valor de la cuota.</p>
              </div>
            </div>
          </section>

          <aside className="result panel" aria-live="polite">
            <header className="section-heading result-heading">
              <div><p>Resultado</p><h2>Tu alternativa</h2></div>
            </header>
            {leadLot ? (
              <>
                <div className="write-milestone">
                  <p>Tu capacidad mensual · Plan {simulation.plan.installments} ({simulation.plan.years} años)</p>
                  <strong>{formatUcb(simulation.monthlyUcb)} UCB</strong>
                  <span>{formatArs(monthlyArs)} al valor vigente de hoy</span>
                </div>
                <div className="result-stats">
                  <div><span>Aporte inicial</span><strong>{formatArs(downPaymentArs)}</strong><small>{writingProgress == null ? 'referencia para tu consulta' : `${formatUcb(writingProgress)}% del umbral económico`}</small></div>
                  <div><span>Lotes disponibles</span><strong>{simulation.candidates.length}</strong><small>para conversar con un asesor</small></div>
                </div>
                {monthsToWritingThreshold != null && (
                  <div className="writing-estimate">
                    <span>Fecha estimada de escrituración</span>
                    {monthsToWritingThreshold > 0 ? (
                      <>
                        <strong>{formatMonthYear(estimatedWritingDate)}</strong>
                        <small>a este ritmo, en {monthsToWritingThreshold} {monthsToWritingThreshold === 1 ? 'mes' : 'meses'}</small>
                      </>
                    ) : (
                      <>
                        <strong>Ya alcanzado</strong>
                        <small>podés iniciar el trámite ahora</small>
                      </>
                    )}
                  </div>
                )}
                <button type="button" className="primary-action" onClick={() => openLots()}>Ver lotes compatibles <ArrowUpRight size={18} /></button>
              </>
            ) : (
              <div className="empty-result">
                <Info size={22} />
                <h2>Todavía no encontramos un lote compatible.</h2>
                <p>Probá aumentar la cuota mensual, sumar un anticipo o elegir otro plazo.</p>
              </div>
            )}
            <p className="legal-note"><CircleCheck size={15} /> La capacidad se expresa en UCB, al valor vigente de la bolsa de cemento. Alcanzar el umbral permite iniciar la escrituración, sujeto a las condiciones del contrato.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}

export default App;
