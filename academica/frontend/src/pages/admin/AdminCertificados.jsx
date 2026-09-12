import { useState } from 'react';
import { Download, Wand2, Award } from 'lucide-react';
import { certificateApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Select, Field, StatusBadge, Spinner, ErrorState, Button } from '../../components/ui';
import { formatDate, formatNumber } from '../../utils/format';

export default function AdminCertificados() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [autoEvent, setAutoEvent] = useState('');
  const [autoBusy, setAutoBusy] = useState(false);
  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);

  const { data, loading, error, reload } = useApi(
    () => certificateApi.adminList({ search, eventId, status, page, limit: 15 }).then((r) => r),
    [search, eventId, status, page]
  );

  const runAuto = async () => {
    if (!autoEvent) return toast.error('Selecione o evento.');
    setAutoBusy(true);
    try {
      const res = await certificateApi.auto(autoEvent);
      toast.success(`Geração automática concluída (${res.data.issued} certificados).`);
      reload();
    } catch (e) { toast.error(e?.response?.data?.message); }
    finally { setAutoBusy(false); }
  };

  const download = async (id, code) => {
    const res = await fetch(certificateApi.downloadUrl(id), { headers: { Authorization: `Bearer ${localStorage.getItem('acadeconnect_token')}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${code}.pdf`; a.click();
  };

  const columns = [
    { header: 'Código', key: 'code', render: (r) => <strong>{r.code}</strong> },
    { header: 'Participante', key: 'participant', render: (r) => r.user?.name },
    { header: 'Evento', key: 'event', render: (r) => r.event?.name },
    { header: 'Atividade', key: 'activity', render: (r) => r.activity?.name || 'Evento' },
    { header: 'Horas', key: 'hours', render: (r) => formatNumber(r.hours) },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { header: 'Emissão', key: 'issueDate', render: (r) => formatDate(r.issueDate) },
    {
      header: 'Ações', key: 'actions', render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => download(r.id, r.code)} icon={<Download size={15} />}>PDF</Button>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Certificados</h1>
          <p>Gerencie e emita certificados.</p>
        </div>
        <div className="flex">
          <Select value={autoEvent} onChange={(e) => setAutoEvent(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">Evento p/ geração automática</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Button variant="primary" loading={autoBusy} onClick={runAuto} icon={<Wand2 size={17} />}>Gerar automáticos</Button>
        </div>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar participante..." /></div>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {['PENDING','AVAILABLE','ISSUED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando certificados..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.certificates || []} loading={loading} emptyTitle={<><Award size={28} /> Nenhum certificado.</>} />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />
    </>
  );
}
