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

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="flex-between flex-wrap mb-3">
        <div className="flex" style={{ gap: 14 }}>
          <div className="empty-state__icon" style={{ color: 'var(--brand)' }}><Award size={28} /></div>
          <div>
            <h1 style={{ fontSize: '1.6rem' }}>{data.event?.name}</h1>
            <p className="text-muted">{data.code}</p>
          </div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <Card className="card-pad mb-3">
        <div className="flex mb-2" style={{ color: 'var(--success)' }}><ShieldCheck size={20} /><strong>Certificado emitido</strong></div>
        <div className="sidebox__row"><dt>Participante</dt><dd>{data.user?.name}</dd></div>
        <div className="sidebox__row"><dt>Evento</dt><dd>{data.event?.name}</dd></div>
        <div className="sidebox__row"><dt>Atividade</dt><dd>{data.activity?.name || 'Participação no evento'}</dd></div>
        <div className="sidebox__row"><dt>Carga horária</dt><dd>{formatNumber(data.hours)} horas</dd></div>
        <div className="sidebox__row"><dt>Data do evento</dt><dd>{formatDate(data.event?.startDate)}</dd></div>
        <div className="sidebox__row"><dt>Emitido em</dt><dd>{formatDateTime(data.issueDate)}</dd></div>
        <div className="sidebox__row"><dt>Código de validação</dt><dd>{data.code}</dd></div>
      </Card>

      <div className="flex flex-wrap">
        <Button onClick={download} icon={<Download size={18} />}>Baixar PDF</Button>
        <Link className="btn btn--secondary" to="/validar-certificado">Validar certificado</Link>
        <Link className="btn btn--ghost" to="/certificados">Voltar</Link>
      </div>
    </div>
  );
}
