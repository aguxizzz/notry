import Loader from './Loader';
import './FeedbackState.css';

export default function FeedbackState({
  icon,
  title,
  description,
  action,
  busy = false,
  tone = 'neutral',
  className = '',
  role = busy ? 'status' : undefined,
  ...rest
}) {
  const classes = [
    'feedback-state',
    busy && 'feedback-state--busy',
    `feedback-state--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role={role} aria-busy={busy || undefined} {...rest}>
      <span className="feedback-state__icon" aria-hidden="true">
        {busy ? <Loader /> : icon}
      </span>
      <div className="feedback-state__copy">
        {title && <strong>{title}</strong>}
        {description && <span>{description}</span>}
      </div>
      {action && <div className="feedback-state__action">{action}</div>}
    </div>
  );
}
