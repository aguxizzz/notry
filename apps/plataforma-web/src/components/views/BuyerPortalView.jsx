import { useState } from 'react';
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  Landmark,
  MapPin,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import './BuyerPortalView.css';

const installments = [
  { number: 12, date: '10 de agosto de 2026', amount: '$ 150.000', status: 'Próxima', tone: 'next' },
  { number: 11, date: 'Pagada el 10 de julio de 2026', amount: '$ 150.000', status: 'Pagada', tone: 'paid' },
  { number: 10, date: 'Pagada el 10 de junio de 2026', amount: '$ 150.000', status: 'Pagada', tone: 'paid' },
];

const documents = [
  { name: 'Boleto de compraventa', detail: 'Firmado · 14 de septiembre de 2025' },
  { name: 'Comprobante de cuota 11', detail: '10 de julio de 2026' },
];

function BrandMark() {
  return <span className="buyer-brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

export default function BuyerPortalView() {
  const [showAllInstallments, setShowAllInstallments] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);

  return (
    <main className="buyer-portal">
      <div className="buyer-portal__frame">
        <header className="buyer-portal__header">
          <div className="buyer-portal__brand" aria-label="Notry">
            <BrandMark />
            <span>Notry</span>
          </div>
          <button className="buyer-icon-button" type="button" aria-label="Notificaciones">
            <Bell size={19} strokeWidth={1.8} />
            <i className="buyer-notification-dot" />
          </button>
        </header>

        <section className="buyer-welcome" aria-labelledby="buyer-welcome-title">
          <p>Hola, Ana</p>
          <h1 id="buyer-welcome-title">Tu compra, al día.</h1>
          <span>Actualizado hoy, 9:30 h</span>
        </section>

        <section className="buyer-lot-card" aria-labelledby="buyer-lot-title">
          <div className="buyer-lot-card__topline">
            <span className="buyer-label">Tu lote</span>
            <span className="buyer-status"><Check size={13} strokeWidth={3} /> Al día</span>
          </div>
          <h2 id="buyer-lot-title">Lote 24</h2>
          <p><MapPin size={15} /> Loteo El Parque · Manzana B</p>
          <div className="buyer-lot-card__meta">
            <span>420 m²</span>
            <span>Contrato 04-2025</span>
          </div>
          <div className="buyer-lot-card__contour" aria-hidden="true"><i /><i /><i /><i /></div>
        </section>

        <section className="buyer-balance" aria-labelledby="buyer-balance-title">
          <div className="buyer-section-heading">
            <div>
              <p className="buyer-label">Estado del contrato</p>
              <h2 id="buyer-balance-title">Vas avanzando muy bien</h2>
            </div>
            <strong>33%</strong>
          </div>
          <div className="buyer-progress" role="progressbar" aria-label="Progreso del plan de cuotas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="33">
            <span />
          </div>
          <div className="buyer-balance__metrics">
            <div><span>Pagaste</span><strong>$ 1.800.000</strong></div>
            <div><span>Restan</span><strong>$ 3.600.000</strong></div>
          </div>
          <p className="buyer-balance__caption"><b>12 de 36 cuotas</b> abonadas</p>
        </section>

        <section className="buyer-payment" aria-labelledby="buyer-payment-title">
          <div className="buyer-payment__heading">
            <div className="buyer-payment__icon"><ReceiptText size={19} /></div>
            <div><p className="buyer-label">Próximo vencimiento</p><h2 id="buyer-payment-title">Cuota 13</h2></div>
          </div>
          <div className="buyer-payment__amount"><strong>$ 150.000</strong><span>Vence el 10 de septiembre</span></div>
          <button type="button" className="buyer-payment__action" disabled>
            <Landmark size={17} /> Pago online · Próximamente
          </button>
          <p className="buyer-payment__notice"><ShieldCheck size={15} /> Cuando habilitemos pagos online, vas a poder pagar desde acá de forma segura.</p>
        </section>

        <section className="buyer-activity" aria-labelledby="buyer-activity-title">
          <div className="buyer-section-heading buyer-section-heading--row">
            <div><p className="buyer-label">Tu plan</p><h2 id="buyer-activity-title">Últimas cuotas</h2></div>
            <button type="button" onClick={() => setShowAllInstallments(!showAllInstallments)}>
              {showAllInstallments ? 'Ver menos' : 'Ver plan'} <ChevronDown size={16} className={showAllInstallments ? 'is-open' : ''} />
            </button>
          </div>
          <div className="buyer-installments">
            {installments.map((installment) => (
              <article className="buyer-installment" key={installment.number}>
                <span className={`buyer-installment__mark buyer-installment__mark--${installment.tone}`}>{installment.tone === 'paid' ? <Check size={13} strokeWidth={3} /> : installment.number}</span>
                <div><strong>Cuota {installment.number}</strong><span>{installment.date}</span></div>
                <div><strong>{installment.amount}</strong><span className={`buyer-installment__status buyer-installment__status--${installment.tone}`}>{installment.status}</span></div>
              </article>
            ))}
            {showAllInstallments && <p className="buyer-installments__rest">Hay 24 cuotas más en tu plan. El detalle completo estará disponible con tu cuenta habilitada.</p>}
          </div>
        </section>

        <section className="buyer-documents" aria-labelledby="buyer-documents-title">
          <button className="buyer-documents__toggle" type="button" onClick={() => setShowDocuments(!showDocuments)} aria-expanded={showDocuments}>
            <span className="buyer-documents__icon"><FileText size={19} /></span>
            <span><strong id="buyer-documents-title">Documentación</strong><small>Contratos y comprobantes</small></span>
            <ChevronDown size={18} className={showDocuments ? 'is-open' : ''} />
          </button>
          {showDocuments && <div className="buyer-document-list">
            {documents.map((document) => <button type="button" key={document.name}><span><strong>{document.name}</strong><small>{document.detail}</small></span><Download size={17} /></button>)}
          </div>}
        </section>

        <aside className="buyer-help">
          <div className="buyer-help__icon"><CircleHelp size={19} /></div>
          <div><strong>¿Necesitás ayuda?</strong><span>Escribinos y te respondemos a la brevedad.</span></div>
          <button type="button" aria-label="Hablar con administración"><MessageCircle size={19} /></button>
        </aside>

        <footer className="buyer-footer"><Building2 size={14} /> Administración El Parque · Córdoba, Argentina</footer>
      </div>
    </main>
  );
}
