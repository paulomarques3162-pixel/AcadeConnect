import { useParams, Link } from 'react-router-dom';
import { Download, Award, ShieldCheck } from 'lucide-react';
import { certificateApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { Button, StatusBadge, Spinner, ErrorState, Card } from '../../components/ui';
import { formatDate, formatDateTime, formatNumber } from '../../utils/format';

export default function CertificadoDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi(() => certificateApi.get(id).then((r) => r.data), [id]);

  const download = async () => {
    const res = await fetch(certificateApi.downloadUrl(id), { headers: { Authorization: `Bearer ${localStorage.getItem('acadeconnect_token')}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${data.code}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Spinner text="Carregando certificado..." />;
  if (error || !data) return <ErrorState title="Certificado não encontrado." onRetry={reload} />;

  const cancelled = data.status === 'CANCELLED';
  const eventName = data.eventName || data.event?.name;
  const participantName = data.participantName || data.user?.name;

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="flex-between flex-wrap mb-3">
        <div className="flex" style={{ gap: 14 }}>
          <div className="empty-state__icon" style={{ color: cancelled ? 'var(--danger)' : 'var(--brand)' }}><Award size={28} /></div>
          <div>
            <h1 style={{ fontSize: '1.6rem' }}>{eventName}</h1>
            <p className="text-muted">{data.code}</p>
          </div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {cancelled && (
        <Card className="card-pad mb-3" style={{ borderColor: 'var(--danger)' }}>
          <div className="flex mb-2" style={{ color: 'var(--danger)' }}>
            <ShieldCheck size={20} />
            <strong>Certificado cancelado</strong>
          </div>
          <p className="text-muted" style={{ margin: '0 0 6px' }}>
            Esta versão foi cancelada por uma correção de dados e não é mais válida.
          </p>
          {data.correctionReason && (
            <p style={{ margin: '0 0 6px' }}><strong>Motivo:</strong> {data.correctionReason}</p>
          )}
          {data.invalidatedAt && (
            <p className="text-muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
              Cancelado em {formatDateTime(data.invalidatedAt)}
            </p>
          )}
          <Link className="btn btn--primary btn--sm" to="/certificados">Ver versão válida</Link>
        </Card>
      )}

      <Card className="card-pad mb-3">
        <div className="flex mb-2" style={{ color: cancelled ? 'var(--danger)' : 'var(--success)' }}>
          <ShieldCheck size={20} />
          <strong>{cancelled ? 'Versão cancelada' : 'Certificado válido'}</strong>
        </div>
        <div className="sidebox__row"><dt>Participante</dt><dd>{participantName}</dd></div>
        <div className="sidebox__row"><dt>Evento</dt><dd>{eventName}</dd></div>
        <div className="sidebox__row"><dt>Atividade</dt><dd>{data.activity?.name || 'Participação no evento'}</dd></div>
        <div className="sidebox__row"><dt>Carga horária</dt><dd>{formatNumber(data.hours)} horas</dd></div>
        <div className="sidebox__row"><dt>Data do evento</dt><dd>{formatDate(data.event?.startDate)}</dd></div>
        <div className="sidebox__row"><dt>Emitido em</dt><dd>{formatDateTime(data.issueDate)}</dd></div>
        <div className="sidebox__row"><dt>Código de validação</dt><dd>{data.code}</dd></div>
      </Card>

      <div className="flex flex-wrap">
        {!cancelled && <Button onClick={download} icon={<Download size={18} />}>Baixar PDF</Button>}
        {!cancelled && <Link className="btn btn--secondary" to="/validar-certificado">Validar certificado</Link>}
        <Link className="btn btn--ghost" to="/certificados">Voltar</Link>
      </div>
    </div>
  );
}
