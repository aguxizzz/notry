const IconSwipe = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 8L2 12L8 16" />
    <path d="M16 8L22 12L16 16" />
    <path d="M2 12H22" strokeOpacity="0.45" />
  </svg>
);

const IconSwitch = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconLayers = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.5 3 7l9 4.5 9-4.5-9-4.5Z" />
    <path d="m3 12 9 4.5 9-4.5" />
    <path d="m3 16.5 9 4.5 9-4.5" />
  </svg>
);

const IconTap = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M12 10.5V5a1.5 1.5 0 0 1 3 0v6" />
    <path d="M15 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 3.3-2.2 6-6 6-2.4 0-3.6-.8-4.6-2.2L4.8 14a1.4 1.4 0 0 1 2-2l2.2 2" />
  </svg>
);

const IconMessage = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H9l-5 4v-4.2A2.5 2.5 0 0 1 4 13.5v-8Z" />
    <circle cx="8.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="9.5" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Onboarding que se muestra una sola vez (por proyecto, guardado en
 * localStorage) apenas el panorama termina de cargar, para explicar los
 * controles básicos del visor 360°. Los pasos de vista plano/panorama y
 * cambio de etapa solo aparecen si el proyecto realmente los tiene.
 */
export function OnboardingOverlay({ visible, onDismiss, projectName, hasViewToggle = false, hasStages = false }) {
  if (!visible) return null;

  const steps = [
    {
      icon: <IconSwipe />,
      title: 'Visualizar',
      text: 'Deslizá la pantalla de un lado a otro para explorar el desarrollo desde el aire.',
    },
    hasViewToggle && {
      icon: <IconSwitch />,
      title: 'Vista plano / panorama',
      text: 'Usá el botón de la esquina para alternar entre la foto 360° y el plano del desarrollo.',
    },
    {
      icon: <IconTap />,
      title: 'Interactuar',
      text: 'Tocá los iconos de lotes y de información para acceder a contenido y detalles.',
    },
    hasStages && {
      icon: <IconLayers />,
      title: 'Cambiar de etapa',
      text: 'Elegí otra etapa o sector del desarrollo desde el selector inferior.',
    },
    {
      icon: <IconMessage />,
      title: 'Contacto',
      text: 'Contactate con el propietario o el desarrollador desde la ficha de cada lote.',
    },
  ].filter(Boolean);

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Cómo usar el visor 360">
      <div className="onboarding-card">
        <p className="onboarding-card__heading">
          Podés usar estos controles para explorar{projectName ? ` ${projectName}` : ' el desarrollo'} en 360°
        </p>

        <ul className="onboarding-card__steps">
          {steps.map((step) => (
            <li className="onboarding-card__step" key={step.title}>
              <span className="onboarding-card__icon">{step.icon}</span>
              <span className="onboarding-card__step-text">
                <strong>{step.title}</strong>
                <span>{step.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <button type="button" className="onboarding-card__cta" onClick={onDismiss}>
          Continuar
        </button>
      </div>
    </div>
  );
}
