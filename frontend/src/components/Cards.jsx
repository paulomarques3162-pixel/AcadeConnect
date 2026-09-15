import QRCode from 'react-qr-code';
import { Calendar, MapPin, Users, ArrowRight, Clock, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusBadge, SmartImage } from './ui';
import { formatDate, ACTIVITY_TYPE_LABELS, formatNumber, calendarDayKey, todayKey } from '../utils/format';

/** Dias (calendário) entre hoje e uma data-alvo. */
function daysUntil(value) {
  if (!value) return null;
  const diff = new Date(`${calendarDayKey(value)}T00:00:00Z`).getTime() - new Date(`${todayKey()}T00:00:00Z`).getTime();
  return Math.round(diff / 86400000);
}

export function EventCard({ event }) {
  const banner = event.bannerUrl || null;
  const startKey = calendarDayKey(event.startDate);
  const endKey = calendarDayKey(event.endDate);
  const isToday = startKey === todayKey();
  const isEnded = event.status === 'CLOSED' || (endKey && endKey < todayKey());
  const closingDays = daysUntil(event.registrationEnd);
  const closingSoon = !isEnded && closingDays !== null && closingDays >= 0 && closingDays <= 3;
  return (
    <article className="event-card">
      <div className="event-card__banner">
        {banner ? (
          <SmartImage src={banner} alt={event.name} className="event-card__banner-img" fallbackLetter={event.name.charAt(0)} loading="lazy" />
        ) : (
          <div className="event-card__banner-fallback">{event.name.charAt(0)}</div>
        )}
        <div className="event-card__status">
          <StatusBadge status={event.status} />
        </div>
      </div>
      <div className="event-card__body">
        <h3 className="event-card__title">{event.name}</h3>
        {(isToday || isEnded || closingSoon) && (
          <div className="flex flex-wrap mb-1" style={{ gap: 6 }}>
            {isToday && !isEnded && <span className="badge badge--danger">Evento hoje</span>}
            {closingSoon && <span className="badge badge--warning">Inscrição encerrando</span>}
            {isEnded && <span className="badge badge--neutral">Evento encerrado</span>}
          </div>
        )}
        <p className="event-card__desc">{event.shortDescription || 'Evento acadêmico.'}</p>
        <div className="event-card__meta">
          <span><Calendar size={15} /> {formatDate(event.startDate)} — {formatDate(event.endDate)}</span>
          <span><MapPin size={15} /> {event.location || 'A definir'}</span>
        </div>
        <div className="event-card__footer">
          <span className="event-card__activities"><Users size={15} /> {event._count?.activities ?? 0} atividades</span>
          <Link className="btn btn--primary btn--sm" to={`/eventos/${event.slug || event.id}`}>
            Ver evento <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function ActivityCard({ activity }) {
  const regs = activity._count?.registrations ?? 0;
  const cap = activity.capacity;
  return (
    <div className="activity-card">
      <div className="activity-card__head">
        <span className="activity-card__type">{ACTIVITY_TYPE_LABELS[activity.type] || activity.type}</span>
        <StatusBadge status={activity.status} />
      </div>
      <h4>{activity.name}</h4>
      {activity.speaker && <p className="activity-card__speaker">{activity.speaker.name}{activity.speaker.specialty ? ` · ${activity.speaker.specialty}` : ''}</p>}
      <div className="activity-card__meta">
        <span><Calendar size={14} /> {formatDate(activity.date)}</span>
        <span><Clock size={14} /> {activity.startTime} - {activity.endTime}</span>
        {activity.location && <span><MapPin size={14} /> {activity.location}</span>}
      </div>
      {cap && (
        <div className="activity-card__cap">
          <span>{formatNumber(regs)}/{formatNumber(cap)} inscritos</span>
          <div className="progress"><div className="progress__bar" style={{ width: `${Math.min(100, (regs / cap) * 100)}%` }} /></div>
        </div>
      )}
    </div>
  );
}

export function QRCodeCard({ value, label }) {
  // `value` must be the raw opaque token (what the backend validates). When a
  // pre-rendered PNG data URL is supplied instead, display it as an <img> —
  // never feed the data URL into the QR encoder, or the QR would contain the
  // base64 image instead of the token and scanning would fail.
  const isImage = typeof value === 'string' && value.startsWith('data:image');
  const hasValue = typeof value === 'string' && value.trim().length > 0;
  return (
    <div className="qr-card">
      {hasValue && (isImage
        ? <img src={value} alt={label || 'QR Code'} width={220} height={220} />
        : <QRCode value={value} size={220} />)}
      {label && <p>{label}</p>}
    </div>
  );
}

export function CertificateCard({ certificate }) {
  const cancelled = certificate.status === 'CANCELLED';
  return (
    <div className="cert-card" style={cancelled ? { opacity: 0.85, borderStyle: 'dashed' } : undefined}>
      <div className="cert-card__icon"><Award size={28} /></div>
      <div className="cert-card__body">
        <h4>{certificate.eventName || certificate.event?.name || 'Evento'}</h4>
        <p>{certificate.activity?.name ? `Atividade: ${certificate.activity.name}` : 'Participação no evento'}</p>
        <p className="cert-card__meta">Código: <strong>{certificate.code}</strong> · {formatNumber(certificate.hours)}h</p>
        {cancelled && (
          <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>
            Versão cancelada (correção de dados) — utilize a versão válida mais recente.
          </p>
        )}
      </div>
      <StatusBadge status={certificate.status} />
    </div>
  );
}

export function DashboardCard({ title, value, icon, tone = 'primary' }) {
  return (
    <div className={`dash-card dash-card--${tone}`}>
      <div className="dash-card__icon">{icon}</div>
      <div className="dash-card__value">{formatNumber(value)}</div>
      <div className="dash-card__title">{title}</div>
    </div>
  );
}

export function AttendanceCard({ row }) {
  return (
    <div className="attendance-row">
      <div className="attendance-row__name">{row.participant?.name}</div>
      <div className="attendance-row__code">{row.code}</div>
      <StatusBadge status={row.status} />
      <span className="attendance-row__time">{row.recordedAt ? new Date(row.recordedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
    </div>
  );
}
