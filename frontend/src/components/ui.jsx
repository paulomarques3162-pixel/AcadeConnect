import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { statusLabel } from '../utils/format';

// ---------- Button ----------
export function Button({ variant = 'primary', size = 'md', loading = false, icon, children, className = '', ...props }) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${loading ? 'btn--loading' : ''} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 className="spin" size={18} /> : icon || null}
      {children}
    </button>
  );
}

// ---------- Inputs ----------
export function Field({ label, error, hint, children, required }) {
  return (
    <label className="field">
      {label && (
        <span className="field__label">
          {label}
          {required && <span className="field__req">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  );
}

export function Input({ invalid, className = '', ...props }) {
  return <input className={`input ${invalid ? 'input--invalid' : ''} ${className}`} {...props} />;
}

export function Textarea({ invalid, className = '', ...props }) {
  return <textarea className={`input textarea ${invalid ? 'input--invalid' : ''} ${className}`} {...props} />;
}

export function Select({ invalid, children, className = '', ...props }) {
  return (
    <select className={`input select ${invalid ? 'input--invalid' : ''} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

// ---------- Card ----------
export function Card({ className = '', children, ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

// ---------- Status badge ----------
const STATUS_TONE = {
  DRAFT: 'neutral', PUBLISHED: 'info', OPEN: 'success', ONGOING: 'info', CLOSED: 'neutral', CANCELLED: 'danger',
  PENDING: 'warning', CONFIRMED: 'success', PRESENT: 'success', ABSENT: 'danger',
  AVAILABLE: 'success', ISSUED: 'success', SCHEDULED: 'info', FULL: 'warning', FINISHED: 'neutral',
  PAID: 'success', EXPIRED: 'danger', REFUNDED: 'neutral',
  ACTIVE: 'success', INACTIVE: 'neutral', RESOLVED: 'neutral',
};
export function StatusBadge({ status, label, tone }) {
  const t = tone || STATUS_TONE[status] || 'neutral';
  return <span className={`badge badge--${t}`}>{label || statusLabel(status)}</span>;
}

// ---------- Loading ----------
export function Spinner({ text = 'Carregando...' }) {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" size={28} />
      <span>{text}</span>
    </div>
  );
}

export function Skeleton({ lines = 3, height = 16 }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton__line" style={{ height, width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

// ---------- Empty / Error ----------
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

/**
 * Image with a graceful fallback when the src fails to load (404/broken).
 * Prevents the ugly broken-image icon; falls back to a neutral tile.
 */
export function SmartImage({ src, alt = '', fallbackLetter, className = '', ...imgProps }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`img-fallback ${className}`} role="img" aria-label={alt}>
        {fallbackLetter ? <span>{fallbackLetter}</span> : null}
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} {...imgProps} />;
}

export function ErrorState({ title = 'Não foi possível carregar.', description, action, onRetry }) {
  return (
    <div className="error-state">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action || (onRetry && <Button onClick={onRetry}>Tentar novamente</Button>)}
    </div>
  );
}
