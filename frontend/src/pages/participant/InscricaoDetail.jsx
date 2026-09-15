import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QrCode, Download, Award, Plus, X, CreditCard } from 'lucide-react';
import { registrationApi, certificateApi, eventApi } from '../../api/services';
import { getErrorMessage } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button, StatusBadge, Spinner, ErrorState } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { QRCodeCard } from '../../components/Cards';
import { PixCard } from '../../components/PixCard';
import { formatDateTime, formatNumber, ACTIVITY_TYPE_LABELS, fullNameInitials } from '../../utils/format';

export default function InscricaoDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [showQr, setShowQr] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [busyActivity, setBusyActivity] = useState(null);
  const [busyPayment, setBusyPayment] = useState(false);
  const { data, loading, error, reload } = useApi(() => registrationApi.get(id).then((r) => r.data), [id]);
  const cert = data?.registration?.certificates?.[0];

  const regEventId = data?.registration?.event?.id;
  const eventActivities = useApi(
    () => (regEventId ? eventApi.get(regEventId).then((r) => r.data.activities) : Promise.resolve([])),
    [regEventId],
    { immediate: Boolean(regEventId) }
  );

  const enrollActivity = async (activityId) => {
    setBusyActivity(activityId);
    try {
      await registrationApi.registerForActivity(id, activityId);
      toast.success('Inscrição na atividade realizada.');
      reload();
      eventActivities.reload();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Não foi possível se inscrever na atividade.'));
    } finally {
      setBusyActivity(null);
    }
  };

  const leaveActivity = async (activityId) => {
    setBusyActivity(activityId);
    try {
      await registrationApi.unregisterFromActivity(id, activityId);
      toast.success('Participação encerrada.');
      reload();
      eventActivities.reload();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Não foi possível encerrar a participação.'));
    } finally {
      setBusyActivity(null);
    }
  };

  const generatePayment = async () => {
    setBusyPayment(true);
    try {
      await registrationApi.generatePayment(id);
      toast.success('PIX gerado. Após pagar, aguarde a confirmação.');
      reload();
    } catch (e) {
      toast.error(getErrorMessage(e, 'Não foi possível gerar o PIX.'));
    } finally {
      setBusyPayment(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!cert) return;
    setDownloading(true);
    try {
      const res = await fetch(certificateApi.downloadUrl(cert.id), { headers: { Authorization: `Bearer ${localStorage.getItem('acadeconnect_token')}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${cert.code}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <Spinner text="Carregando inscrição..." />;
  if (error || !data) return <ErrorState title="Inscrição não encontrada." onRetry={reload} />;
  const { registration } = data;
  const payment = registration.payment;
  const isPaidEvent = !!registration.event?.isPaid;
  const qrAllowed = !isPaidEvent || payment?.status === 'PAID';
  const enrolledIds = new Set((registration.activityRegistrations || []).map((ar) => ar.activityId));
  const canManageActivities = registration.status === 'CONFIRMED' && registration.event?.allowRegistration !== false;
  const availableActivities = (eventActivities.data || []).filter((a) => !enrolledIds.has(a.id) && a.allowsRegistration);

  return (
    <>
      <div className="flex-between flex-wrap mb-3">
        <div>
          <h1 style={{ fontSize: '1.6rem' }}>Inscrição #{registration.code}</h1>
          <p className="text-muted">{registration.event?.name} · {formatDateTime(registration.createdAt)}</p>
        </div>
        <StatusBadge status={registration.status} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <div className="card card-pad">
          <h3 className="mb-2">Participante</h3>
          <div className="flex">
            <span className="avatar" style={{ width: 44, height: 44 }}>{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : fullNameInitials(registration.user?.name || user?.name)}</span>
            <div>
              <strong>{registration.user?.name || user?.name}</strong>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>{registration.user?.course || user?.course}</p>
            </div>
          </div>
          <div className="sidebox__row mt-2"><dt>Evento</dt><dd>{registration.event?.name}</dd></div>
          <div className="sidebox__row"><dt>Data de inscrição</dt><dd>{formatDateTime(registration.registeredAt)}</dd></div>
          <div className="sidebox__row"><dt>Atividades</dt><dd>{(registration.activityRegistrations || []).length}</dd></div>
          <div className="sidebox__row"><dt>Presenças</dt><dd>{(registration.attendance || []).filter((a) => a.status === 'PRESENT').length}</dd></div>

          {registration.qrActive === false && isPaidEvent && payment?.status !== 'PAID' && (
            <p className="text-muted mt-2" style={{ fontSize: '0.82rem' }}>Este QR Code está temporariamente bloqueado.</p>
          )}
          {qrAllowed && registration.qrActive !== false ? (
            <Button className="btn--block mt-2" onClick={() => setShowQr(true)} icon={<QrCode size={18} />}>Exibir QR Code</Button>
          ) : (
            <Button className="btn--block mt-2" disabled icon={<QrCode size={18} />}>QR liberado após o pagamento</Button>
          )}
        </div>

        {isPaidEvent && (
          <div className="card card-pad">
            <h3 className="mb-2"><CreditCard size={18} /> Pagamento</h3>
            {payment ? (
              payment.status === 'PAID' ? (
                <div className="flex" style={{ color: 'var(--success)' }}>
                  <strong>Pagamento confirmado. QR Code de entrada liberado.</strong>
                </div>
              ) : (
                <PixCard payment={payment} title="PIX da inscrição" onRegenerate={generatePayment} />
              )
            ) : (
              <>
                <p className="text-muted" style={{ marginTop: 0 }}>Este é um evento pago. Gere o PIX para efetuar o pagamento.</p>
                <Button loading={busyPayment} onClick={generatePayment} icon={<CreditCard size={16} />}>Gerar PIX</Button>
              </>
            )}
          </div>
        )}

        <div className="card card-pad">
          <h3 className="mb-2">Atividades selecionadas</h3>
          {(registration.activityRegistrations || []).length === 0 && <p className="text-muted">Nenhuma atividade específica selecionada.</p>}
          <div className="list">
            {(registration.activityRegistrations || []).map((ar) => {
              const att = (registration.attendance || []).find((a) => a.activityId === ar.activityId);
              return (
                <div className="flex-between" key={ar.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem' }}>{ar.activity?.name}</strong>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                      {ACTIVITY_TYPE_LABELS[ar.activity?.type] || ''} · {ar.activity ? formatDateTime(ar.activity.date) : ''}
                    </p>
                  </div>
                  <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                    <StatusBadge status={att?.status || 'PENDING'} />
                    {canManageActivities && att?.status !== 'PRESENT' && (
                      <Button variant="ghost" size="sm" loading={busyActivity === ar.activityId} onClick={() => leaveActivity(ar.activityId)} icon={<X size={15} />}>
                        Encerrar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {canManageActivities && availableActivities.length > 0 && (
            <div className="mt-3">
              <h4 style={{ marginBottom: 8, fontSize: '0.95rem' }}>Inscrever em atividades</h4>
              <div className="list">
                {availableActivities.map((a) => (
                  <div className="flex-between" key={a.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div>
                      <strong style={{ fontSize: '0.9rem' }}>{a.name}</strong>
                      <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                        {ACTIVITY_TYPE_LABELS[a.type] || ''} · {formatDateTime(a.date)}
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" loading={busyActivity === a.id} onClick={() => enrollActivity(a.id)} icon={<Plus size={15} />}>
                      Inscrever
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <h3 className="mb-1">Certificado</h3>
            {cert ? (
              <div className="flex flex-wrap">
                <StatusBadge status={cert.status} />
                <Button variant="secondary" size="sm" loading={downloading} onClick={handleDownloadPdf} icon={<Download size={16} />}>Baixar PDF</Button>
                <Link className="btn btn--secondary btn--sm" to={`/certificados/${cert.id}`}>Detalhes</Link>
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.88rem' }}>Disponível quando os critérios de presença forem cumpridos.</p>
            )}
          </div>
        </div>
      </div>

      <Modal open={showQr} onClose={() => setShowQr(false)} title="Meu QR Code" footer={<Link className="btn btn--primary btn--block" to={`/inscricao/${registration.id}`}>Confirmar</Link>}>
        <div style={{ textAlign: 'center' }}>
          <p className="text-muted mb-2">Apresente este QR Code na entrada das atividades para registrar presença.</p>
          {/* Encode the raw opaque token so scanners send the token (not the PNG data URL). */}
          <QRCodeCard value={registration.qrToken} label={`Inscrição #${registration.code}`} />
        </div>
      </Modal>
    </>
  );
}
