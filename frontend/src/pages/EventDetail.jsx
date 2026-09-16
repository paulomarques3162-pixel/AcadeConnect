import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Calendar, MapPin, Clock, Users, Award, CheckCircle2, Ticket, AlertCircle, Share2, Copy } from 'lucide-react';
import { eventApi, registrationApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Spinner, ErrorState, StatusBadge, Checkbox, SmartImage } from '../components/ui';
import { QRCodeCard } from '../components/Cards';
import { Modal } from '../components/Overlay';
import { PixCard, formatBRL } from '../components/PixCard';
import { formatDate, formatNumber, ACTIVITY_TYPE_LABELS, MODALITY_LABELS, fullNameInitials, calendarDayKey } from '../utils/format';

export default function EventDetail() {
  const { idOrSlug } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [formError, setFormError] = useState(null);
  const [myReg, setMyReg] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const { data, loading, error } = useApi(() => eventApi.get(idOrSlug).then((r) => r.data), [idOrSlug]);
  const event = data;

  // Sabe se o usuário já está inscrito neste evento (para destaque).
  useEffect(() => {
    let active = true;
    if (user && event?.id) {
      registrationApi
        .mine()
        .then((r) => { if (active) setMyReg((r.data.registrations || []).find((x) => x.eventId === event.id && x.status === 'CONFIRMED') || null); })
        .catch(() => {});
    } else {
      setMyReg(null);
    }
    return () => { active = false; };
  }, [user, event?.id]);

  const grouped = (event?.activities || []).reduce((acc, a) => {
    // Group by CALENDAR DAY (UTC day for UTC-midnight dates). Using
    // new Date(a.date).toDateString() grouped by the local day and could split
    // or merge days differently from the date actually displayed.
    const key = calendarDayKey(a.date);
    (acc[key] = acc[key] || []).push(a);
    return acc;
  }, {});

  const eventPath = `/eventos/${event?.slug || event?.id || ''}`;
  const shareUrl = `${window.location.origin}${eventPath}`;

  const shareEvent = async () => {
    const payload = {
      title: event.name,
      text: `Confira o evento "${event.name}" no AcadeConnect!`,
      url: shareUrl,
    };
    // Web Share API (mobile/modern browsers): native share sheet.
    if (navigator.share) {
      try { await navigator.share(payload); return; }
      catch (e) { if (e?.name === 'AbortError') return; /* fall through to manual options */ }
    }
    setShareOpen(true);
  };

  const copyShareLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast.success('Link copiado!');
      setShareOpen(false);
    } catch { toast.error('Não foi possível copiar o link.'); }
  };

  const shareTo = (network) => {
    const text = encodeURIComponent(`Confira o evento "${event.name}" no AcadeConnect!`);
    const url = encodeURIComponent(shareUrl);
    const targets = {
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`${event.name} - ${shareUrl}`)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      x: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    };
    window.open(targets[network], '_blank', 'noopener,noreferrer');
  };

  const toggleActivity = (id) => {
    setFormError(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const handleSubscribe = async () => {
    if (!user) {
      navigate('/login', { state: { from: `/eventos/${event.slug || event.id}` } });
      return;
    }
    // Validação antes de enviar: não perde dados e destaca o que falta.
    if (event.requireActivityRegistration && selected.length === 0) {
      setFormError('Falta selecionar uma atividade obrigatória. Revise os itens destacados antes de concluir sua inscrição.');
      return;
    }
    setFormError(null);
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
  const todayK = calendarDayKey(new Date());
  const isToday = calendarDayKey(event.startDate) === todayK;
  const isEnded = event.status === 'CLOSED' || (event.endDate && calendarDayKey(event.endDate) < todayK);
  const closingSoon = (() => {
    if (!event.registrationEnd || isEnded) return false;
    const d = Math.round((new Date(`${calendarDayKey(event.registrationEnd)}T00:00:00Z`) - new Date(`${todayK}T00:00:00Z`)) / 86400000);
    return d >= 0 && d <= 3;
  })();

  return (
    <>
      <section className="event-hero">
        {event.bannerUrl && <SmartImage src={event.bannerUrl} alt="" className="event-hero__img" />}
        <div className="event-hero__inner">
          <div className="flex flex-wrap" style={{ gap: 6 }}>
            <StatusBadge status={event.status} />
            {isToday && !isEnded && <span className="badge badge--danger">Evento hoje</span>}
            {closingSoon && <span className="badge badge--warning">Inscrição encerrando</span>}
            {isEnded && <span className="badge badge--neutral">Evento encerrado</span>}
            {myReg && <span className="badge badge--success">Você já está inscrito</span>}
          </div>
          <h1 style={{ marginTop: 12 }}>{event.name}</h1>
          <div className="event-hero__meta">
            <span><Calendar size={18} /> {formatDate(event.startDate)} — {formatDate(event.endDate)}</span>
            <span><MapPin size={18} /> {event.location || 'A definir'}</span>
            <span><Users size={18} /> {formatNumber(event._count?.registrations || 0)} inscritos</span>
          </div>
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={shareEvent} icon={<Share2 size={16} />}>
              Compartilhar evento
            </Button>
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
              <div className="flex" style={{ gap: 10, marginBottom: 16 }}>
                <h2 style={{ margin: 0 }}>Programação</h2>
                {formError && <span className="badge badge--danger">Falta selecionar atividade</span>}
              </div>
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
                <div className="sidebox__row"><dt>Pagamento</dt><dd>{event.isPaid ? `PIX · ${formatBRL(event.priceCents)}` : 'Gratuito'}</dd></div>
              </dl>

              <div className="sidebox__actions">
                {confirmation ? (
                  <div className="presence-success" style={{ flexDirection: 'column' }}>
                    <CheckCircle2 size={40} color="var(--success)" />
                    <strong>Inscrição realizada com sucesso!</strong>
                    <span>Inscrição #{confirmation.registration.code}</span>
                    {confirmation.requiresPayment ? (
                      <>
                        <span className="text-muted">Pagamento pendente. O QR Code de entrada será liberado após a confirmação da organização.</span>
                        {confirmation.payment && <PixCard payment={confirmation.payment} title="Pagamento da inscrição" />}
                        {confirmation.paymentWarning && <span className="text-muted">{confirmation.paymentWarning}</span>}
                      </>
                    ) : (
                      <QRCodeCard value={confirmation.registration?.qrToken} label="Apresente este QR Code no evento" />
                    )}
                    <Link className="btn btn--primary btn--block" to={`/inscricao/${confirmation.registration.id}`}>Ver minha inscrição</Link>
                  </div>
                ) : myReg ? (
                  <Link className="btn btn--primary btn--block" to={`/inscricao/${myReg.id}`}>Ver minha inscrição</Link>
                ) : canRegister ? (
                  <>
                    <Button className="btn--lg btn--block" loading={submitting} onClick={handleSubscribe}>
                      <Ticket size={20} /> INSCREVER-SE
                    </Button>
                    {event.requireActivityRegistration && (
                      <div style={{ fontSize: '0.82rem' }}>
                        <div className="flex" style={{ color: selected.length > 0 ? 'var(--success)' : 'var(--warning)', gap: 6 }}>
                          <CheckCircle2 size={14} />
                          <span>Evento selecionado</span>
                        </div>
                        <div className="flex" style={{ color: selected.length > 0 ? 'var(--success)' : 'var(--danger)', gap: 6 }}>
                          <AlertCircle size={14} />
                          <span>Atividade obrigatória: {selected.length > 0 ? `selecionada (${selected.length})` : 'não selecionada'}</span>
                        </div>
                      </div>
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
                {formError && (
                  <p className="field__error" style={{ marginTop: 8 }}>{formError}</p>
                )}
              </div>

              {event.automaticCertificate && (
                <p className="text-muted mt-2 flex"><Award size={16} /> Certificado automático ao cumprir {event.minimumAttendancePercentage}% de presença.</p>
              )}
            </div>
          </aside>
        </div>
      </div>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Compartilhar evento">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>Envie este evento para amigos ou copie o link direto.</p>
          <Button variant="secondary" onClick={() => shareTo('whatsapp')}>WhatsApp</Button>
          <Button variant="secondary" onClick={() => shareTo('facebook')}>Facebook</Button>
          <Button variant="secondary" onClick={() => shareTo('x')}>X / Twitter</Button>
          <Button variant="primary" onClick={copyShareLink} icon={<Copy size={16} />}>Copiar link</Button>
          <code style={{ fontSize: '0.75rem', wordBreak: 'break-all', color: 'var(--text-muted)' }}>{shareUrl}</code>
        </div>
      </Modal>
    </>
  );
}
