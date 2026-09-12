import { useState } from 'react';
import { Download } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { adminApi, eventApi, exportCsv, downloadBlob } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Select, Field, Input, Button, Spinner, ErrorState, Card } from '../../components/ui';
import { formatNumber } from '../../utils/format';

export default function AdminRelatorios() {
  const toast = useToast();
  const [eventId, setEventId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);

  const params = { eventId, activityId, from, to, status };
  const { data, loading, error, reload } = useApi(
    () => adminApi.reports(params).then((r) => r.data),
    [eventId, activityId, from, to, status]
  );

  const doExport = async () => {
    try {
      const blob = await exportCsv('inscricoes', { eventId, from, to, status });
      downloadBlob(blob, `relatorio-${new Date().toISOString().slice(0,10)}.csv`);
      toast.success('Exportação concluída.');
    } catch (e) { toast.error(e?.response?.data?.message || 'Erro ao exportar.'); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <p>Análise e exportação de dados.</p>
        </div>
        <Button variant="secondary" onClick={doExport} icon={<Download size={17} />}>Exportar CSV</Button>
      </div>

      <div className="filters mb-3">
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {['PENDING','CONFIRMED','CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      {loading && <Spinner text="Calculando relatório..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && data && (
        <>
          <div className="stat-grid mb-3">
            <Card className="card-pad"><strong style={{ fontSize: '1.7rem' }}>{formatNumber(data.totals.totalInscritos)}</strong><p className="text-muted" style={{ margin: 0 }}>Inscritos</p></Card>
            <Card className="card-pad"><strong style={{ fontSize: '1.7rem', color: 'var(--success)' }}>{formatNumber(data.totals.totalPresentes)}</strong><p className="text-muted" style={{ margin: 0 }}>Presentes</p></Card>
            <Card className="card-pad"><strong style={{ fontSize: '1.7rem', color: 'var(--danger)' }}>{formatNumber(data.totals.totalAusentes)}</strong><p className="text-muted" style={{ margin: 0 }}>Ausentes</p></Card>
            <Card className="card-pad"><strong style={{ fontSize: '1.7rem', color: 'var(--brand)' }}>{formatNumber(data.totals.percentualPresenca)}%</strong><p className="text-muted" style={{ margin: 0 }}>Presença</p></Card>
            <Card className="card-pad"><strong style={{ fontSize: '1.7rem' }}>{formatNumber(data.totals.totalCertificados)}</strong><p className="text-muted" style={{ margin: 0 }}>Certificados</p></Card>
          </div>

          <Card className="card-pad">
            <h3 className="mb-2">Participantes por atividade</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.participantesPorAtividade}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="activity" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#166534" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </>
  );
}
