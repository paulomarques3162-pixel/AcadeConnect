import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCheck, Download, X, ScanLine } from 'lucide-react';
import { eventApi, attendanceApi, exportCsv, downloadBlob } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar } from '../../components/DataTable';
import { Select, Field, Button, StatusBadge, Spinner, ErrorState, Card } from '../../components/ui';
import { formatDate, formatNumber } from '../../utils/format';

export default function AdminPresencas() {
  const { activityId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const summary = useApi(() => (eventId ? attendanceApi.summary(eventId).then((r) => r.data.summary) : Promise.resolve(null)), [eventId]);
  const detail = useApi(() => (activityId ? attendanceApi.activityRows(activityId, {}).then((r) => r.data) : Promise.resolve(null)), [activityId]);

  const togglePresence = async (row) => {
    setBusy(true);
    try {
      const present = row.status !== 'PRESENT';
      await attendanceApi.manual(row.registrationId, activityId, present);
      toast.success(present ? 'Presença registrada.' : 'Presença removida.');
      detail.reload();
    } catch (e) { toast.error(e?.response?.data?.message); }
    finally { setBusy(false); }
  };

  const doExport = async () => {
    try {
      const blob = await exportCsv('presencas', { activityId, eventId, status });
      downloadBlob(blob, `presencas-${new Date().toISOString().slice(0,10)}.csv`);
      toast.success('Exportação concluída.');
    } catch (e) { toast.error(e?.response?.data?.message || 'Erro ao exportar.'); }
  };

  // ----- Activity detail view -----
  if (activityId) {
    if (detail.loading) return <Spinner text="Carregando presenças..." />;
    if (detail.error) return <ErrorState onRetry={detail.reload} />;
    const { activity, rows, summary: sm } = detail.data || { rows: [], summary: {} };
    const filtered = rows.filter((r) => (!search || r.participant?.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search)) && (!status || r.status === status));

    const columns = [
      { header: 'Nome', key: 'name', render: (r) => <strong>{r.participant?.name}</strong> },
      { header: 'Inscrição', key: 'code', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.code}</span> },
      { header: 'Horário', key: 'time', render: (r) => r.recordedAt ? new Date(r.recordedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—' },
      { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
      {
        header: 'Ação', key: 'action', render: (r) => (
          <Button size="sm" variant={r.status === 'PRESENT' ? 'secondary' : 'primary'} loading={busy} onClick={() => togglePresence(r)}>
            {r.status === 'PRESENT' ? <><X size={15} /> Remover</> : <><CheckCheck size={15} /> Marcar presente</>}
          </Button>
        ),
      },
    ];

    return (
      <>
        <button className="btn btn--ghost mb-2" onClick={() => navigate('/admin/presencas')}><ArrowLeft size={17} /> Voltar para resumo</button>
        <div className="page-head">
          <div>
            <h1>{activity?.name}</h1>
            <p>{activity ? `${formatDate(activity.date)} · ${activity.startTime} - ${activity.endTime}` : ''}</p>
          </div>
          <div className="flex">
            <Button variant="secondary" onClick={doExport} icon={<Download size={17} />}>Exportar</Button>
            <Link className="btn btn--primary" to="/admin/operador"><ScanLine size={17} /> Modo operador</Link>
          </div>
        </div>

        <div className="stat-grid mb-3">
          <Card className="card-pad"><strong style={{ fontSize: '1.6rem' }}>{formatNumber(sm?.inscritos)}</strong><p className="text-muted" style={{ margin: 0 }}>Inscritos</p></Card>
          <Card className="card-pad"><strong style={{ fontSize: '1.6rem', color: 'var(--success)' }}>{formatNumber(sm?.presentes)}</strong><p className="text-muted" style={{ margin: 0 }}>Presentes</p></Card>
          <Card className="card-pad"><strong style={{ fontSize: '1.6rem', color: 'var(--danger)' }}>{formatNumber(sm?.ausentes)}</strong><p className="text-muted" style={{ margin: 0 }}>Ausentes</p></Card>
          <Card className="card-pad"><strong style={{ fontSize: '1.6rem', color: 'var(--brand)' }}>{formatNumber(sm?.percentual)}%</strong><p className="text-muted" style={{ margin: 0 }}>Presença</p></Card>
        </div>

        <div className="filters mb-3">
          <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar participante..." /></div>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {['PRESENT','ABSENT','PENDING'].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>

        <DataTable columns={columns} rows={filtered} loading={detail.loading} emptyTitle="Nenhum participante nesta atividade." />
      </>
    );
  }

  // ----- Summary view -----
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Presenças</h1>
          <p>Resumo de presença por atividade.</p>
        </div>
        <Link className="btn btn--primary" to="/admin/operador"><ScanLine size={17} /> Controle de presença</Link>
      </div>

      <div className="filters mb-3" style={{ maxWidth: 360 }}>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Selecione um evento</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </div>

      {!eventId && <p className="text-muted">Selecione um evento para ver o resumo de presença.</p>}
      {summary.loading && eventId && <Spinner text="Carregando resumo..." />}
      {summary.error && <ErrorState onRetry={summary.reload} />}
      {!summary.loading && !summary.error && eventId && (
        <div className="list">
          {(summary.data || []).map((s) => (
            <Card className="card-pad" key={s.activityId}>
              <div className="flex-between flex-wrap">
                <div>
                  <strong>{s.activityName}</strong>
                  <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.88rem' }}>
                    {formatDate(s.date)} · {s.startTime} - {s.endTime}
                  </p>
                </div>
                <div className="flex">
                  <span className="badge badge--info">Inscritos: {formatNumber(s.inscritos)}</span>
                  <span className="badge badge--success">Presentes: {formatNumber(s.presentes)}</span>
                  <span className="badge badge--danger">Ausentes: {formatNumber(s.ausentes)}</span>
                  <span className="badge badge--neutral">Presença: {formatNumber(s.percentual)}%</span>
                </div>
                <Link className="btn btn--secondary btn--sm" to={`/admin/presencas/${s.activityId}`}>Ver participantes</Link>
              </div>
              <div className="progress mt-2"><div className="progress__bar" style={{ width: `${s.percentual}%`, background: s.percentual >= 75 ? 'var(--success)' : 'var(--warning)' }} /></div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
