import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { adminApi, eventApi, exportCsv, downloadBlob } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Select, Field, Input, StatusBadge, Spinner, ErrorState, Button } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function AdminInscricoes() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);

  const { data, loading, error, reload } = useApi(
    () => adminApi.registrations({ search, eventId, status, from, to, page, limit: 15 }).then((r) => r),
    [search, eventId, status, from, to, page]
  );

  const doExport = async () => {
    try {
      const blob = await exportCsv('inscricoes', { eventId, status, from, to, search });
      downloadBlob(blob, `inscricoes-${new Date().toISOString().slice(0,10)}.csv`);
      toast.success('Exportação concluída.');
    } catch (e) { toast.error(e?.response?.data?.message || 'Erro ao exportar.'); }
  };

  const columns = [
    { header: 'Inscrição', key: 'code', render: (r) => <strong>{r.code}</strong> },
    { header: 'Participante', key: 'participant', render: (r) => <Link to="/admin/participantes">{r.user?.name}</Link> },
    { header: 'E-mail', key: 'email', render: (r) => r.user?.email },
    { header: 'Curso', key: 'course', render: (r) => r.user?.course || '—' },
    { header: 'Evento', key: 'event', render: (r) => r.event?.name },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { header: 'Presenças', key: 'att', render: (r) => r._count?.attendance ?? 0 },
    { header: 'Data', key: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inscrições</h1>
          <p>Todas as inscrições da plataforma.</p>
        </div>
        <Button variant="secondary" onClick={doExport} icon={<Download size={17} />}>Exportar CSV</Button>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar participante..." /></div>        <Field label="De">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Até">
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>

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
      </div>

      {loading && <Spinner text="Carregando inscrições..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.registrations || []} loading={loading} emptyTitle="Nenhuma inscrição." />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />
    </>
  );
}
