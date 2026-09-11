import { Link } from 'react-router-dom';

export function Logo({ light = false }) {
  return (
    <Link to="/" className={`logo ${light ? 'logo--light' : ''}`} aria-label="Mustangs Atlética Anhanguera - Início">
      <span className="logo__mark">
        <img src="/mustangs-logo.png" alt="Mustangs Atlética Anhanguera" width="40" height="40" />
      </span>
      <span className="logo__text">Mustangs <strong>Atlética</strong></span>
    </Link>
  );
}
