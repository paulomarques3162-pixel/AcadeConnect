import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calendar, MapPin, Clock, Users, Award, CheckCircle2, Ticket } from 'lucide-react';
import { eventApi, registrationApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Spinner, ErrorState, StatusBadge, Checkbox, SmartImage } from '../components/ui';
import { QRCodeCard } from '../components/Cards';
import { formatDate, formatNumber, ACTIVITY_TYPE_LABELS, MODALITY_LABELS, fullNameInitials, calendarDayKey } from '../utils/format';

export default function EventDetail() {
  const { idOrSlug } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const { data, loading, error } = useApi(() => eventApi.get(idOrSlug).then((r) => r.data), [idOrSlug]);
  const event = data;

  const grouped = (event?.activities || []).reduce((acc, a) => {
    // Group by CALENDAR DAY (UTC day for UTC-midnight dates). Using
    // new Date(a.date).toDateString() grouped by the local day and could split
    // or merge days differently from the date actually displayed.
    const key = calendarDayKey(a.date);
    (acc[key] = acc[key] || []).push(a);
    return acc;
  }, {});

  const toggleActivity = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/login', { state: { from: `/eventos/${event.slug || event.id}` } });
      return;
    }
    setSubmitting(true);
    try {
      const res = await registrationApi.registerForEvent(event.id, selected);
      setConfirmation(res.data);
      toast.success('Inscrição realizada com sucesso!');
    } catch (e) {
      const status = e?.response?.status;
      const message = e?.response?.data?.message || 'Não foi possível concluir a inscrição.';
      // 409 "Você já está inscrito neste evento": em vez de repetir o erro,
      // levamos o participante para a inscrição que ele já possui.
      if (status === 409 && /já está inscrito/i.test(message)) {
        try {
          const mine = await registrationApi.mine();
          const existing = (mine.data.registrations || []).find((r) => r.eventId === event.id);
          if (existing) {
            toast.info ? toast.info(message) : toast.error(message);
            navigate(`/inscricao/${existing.id}`);
            return;
          }
        } catch {
          /* mantém a mensagem original abaixo */
        }
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="container"><Spinner text="Carregando evento..." /></div>;
  if (error || !event) return <div className="container"><ErrorState title="Evento não encontrado." onRetry={() => navigate('/eventos')} /></div>;

  const canRegister = event.allowRegistration && ['PUBLISHED', 'OPEN', 'ONGOING'].includes(event.status);

  return (
    <>
      <section className="event-hero">
        {event.bannerUrl && <SmartImage src={event.bannerUrl} alt="" className="event-hero__img" />}
        <div className="event-hero__inner">
          <StatusBadge status={event.status} />
          <h1 style={{ marginTop: 12 }}>{event.name}</h1>
          <div className="event-hero__meta">
            <span><Calendar size={18} /> {formatDate(event.startDate)} — {formatDate(event.endDate)}</span>
            <span><MapPin size={18} /> {event.location || 'A definir'}</span>
            <span><Users size={18} /> {formatNumber(event._count?.registrations || 0)} inscritos</span>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="event-layout">
          <div>
            <section className="mb-3">
              <h2 style={{ marginBottom: 10 }}>Sobre o evento</h2>
              <p className="text-muted" style={{ whiteSpace: 'pre-line' }}>{event.description || 'Sem descrição.'}</p>
            </section>

            <section className="mb-3">
              <h2 style={{ marginBottom: 16 }}>Programação</h2>
              {Object.keys(grouped).length === 0 && <p className="text-muted">A programação ainda não foi publicada.</p>}
              {Object.entries(grouped).map(([key, acts]) => (
                <div className="schedule-day" key={key}>
                  <div className="schedule-day__date">{formatDate(acts[0].date, { weekday: 'long', day: '2-digit', month: 'long' })}</div>
                  {acts.map((a) => (
                    <div className="schedule-item" key={a.id}>
                      <div className="schedule-item__time">{a.startTime}</div>
                      <div className="schedule-item__info">
                        <h4>{a.name}</h4>
                        <p>{ACTIVITY_TYPE_LABELS[a.type] || a.type}{a.speaker ? ` · ${a.speaker.name}` : ''}</p>
                        {canRegister && a.allowsRegistration && (
                          <label className="checkbox mt-1">
                            <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleActivity(a.id)} />
                            <span>Selecionar para minha inscrição</span>
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            {event.activities?.some((a) => a.speaker) && (
              <section>
                <h2 style={{ marginBottom: 16 }}>Palestrantes</h2>
                <div className="speaker-grid">
                  {[...new Map(event.activities.filter((a) => a.speaker).map((a) => [a.speaker.id, a.speaker])).values()].map((sp) => (
                    <div className="speaker" key={sp.id}>
                      <div className="speaker__avatar">
                        {sp.photoUrl ? <img src={sp.photoUrl} alt={sp.name} /> : fullNameInitials(sp.name)}
                      </div>
                      <h4>{sp.name}</h4>
                      <p>{sp.specialty || 'Palestrante'}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside>
            <div className="sidebox">
              <dl>
                <div className="sidebox__row"><dt>Organização</dt><dd>{event.institution?.name || 'Mustangs Atlética Anhanguera'}</dd></div>
                <div className="sidebox__row"><dt>Categoria</dt><dd>{event.category || '—'}</dd></div>
                <div className="sidebox__row"><dt>Modalidade</dt><dd>{MODALITY_LABELS[event.modality] || event.modality}</dd></div>
                <div className="sidebox__row"><dt>Início</dt><dd>{formatDate(event.startDate)}</dd></div>
                <div className="sidebox__row"><dt>Fim</dt><dd>{formatDate(event.endDate)}</dd></div>
                <div className="sidebox__row"><dt>Local</dt><dd>{event.location || '—'}</dd></div>
                <div className="sidebox__row"><dt>Capacidade</dt><dd>{event.capacity ? formatNumber(event.capacity) : 'Ilimitada'}</dd></div>
                <div className="sidebox__row"><dt>Atividades</dt><dd>{event._count?.activities ?? 0}</dd></div>
              </dl>

              <div className="sidebox__actions">
                {confirmation ? (
                  <div className="presence-success" style={{ flexDirection: 'column' }}>
                    <CheckCircle2 size={40} color="var(--success)" />
                    <strong>Inscrição realizada com sucesso!</strong>
                    <span>Inscrição #{confirmation.registration.code}</span>
                    <QRCodeCard value={confirmation.qrCode} label="Apresente este QR Code no evento" />
                    <Link className="btn btn--primary btn--block" to={`/inscricao/${confirmation.registration.id}`}>Ver minha inscrição</Link>
                  </div>
                ) : canRegister ? (
                  <>
                    <Button className="btn--lg btn--block" loading={submitting} onClick={handleSubscribe}>
                      <Ticket size={20} /> INSCREVER-SE
                    </Button>
                    {event.requireActivityRegistration && (
                      <p className="text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
                        Selecione as atividades desejadas acima. Inscrito(s): {selected.length}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                    {user ? 'As inscrições para este evento estão fechadas.' : 'Entre ou crie uma conta para se inscrever.'}
                  </p>
                )}
                {!user && !confirmation && (
                  <Link className="btn btn--secondary btn--block" to="/login">Entrar para se inscrever</Link>
                )}
              </div>

              {event.automaticCertificate && (
                <p className="text-muted mt-2 flex"><Award size={16} /> Certificado automático ao cumprir {event.minimumAttendancePercentage}% de presença.</p>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
