import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Settings2 } from 'lucide-react';
import { adminApi, eventApi, registrationApi, exportCsv, downloadBlob } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Select, Field, Input, Checkbox, StatusBadge, Spinner, ErrorState, Button, Card } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { formatDateTime } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function AdminInscricoes() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);

  const [managing, setManaging] = useState(null);
  const [manageForm, setManageForm] = useState({ status: 'CONFIRMED', activityIds: [] });
  const [eventActivities, setEventActivities] = useState([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const openManage = async (row) => {
    setManaging(row);
    setManageLoading(true);
    try {
      const [regRes, evRes] = await Promise.all([
        registrationApi.get(row.id),
        eventApi.get(row.event?.id),
      ]);
      const reg = regRes.data?.registration;
      const ev = evRes.data;
      setManageForm({
        status: reg?.status || 'CONFIRMED',
        activityIds: (reg?.activityRegistrations || []).map((ar) => ar.activityId),
      });
      setEventActivities(ev?.activities || []);
    } catch (e) {
      toast.error(getErrorMessage(e));
      setManaging(null);
    } finally {
      setManageLoading(false);
    }
  };

  const toggleActivity = (aid) => {
    setManageForm((f) => ({
      ...f,
      activityIds: f.activityIds.includes(aid) ? f.activityIds.filter((x) => x !== aid) : [...f.activityIds, aid],
    }));
  };

  const saveManage = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await registrationApi.adminUpdate(managing.id, {
        status: manageForm.status,
        activityIds: manageForm.activityIds,
      });
      toast.success('Inscrição atualizada.');
      setManaging(null);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
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
    {
      header: 'Ações', key: 'actions', render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => openManage(r)} icon={<Settings2 size={15} />}>Gerenciar</Button>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inscrições</h1>
          <p>Todas as inscrições da plataforma. Restaure inscrições canceladas e ajuste atividades.</p>
        </div>
        <Button variant="secondary" onClick={doExport} icon={<Download size={17} />}>Exportar CSV</Button>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar participante..." /></div>
        <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {['PENDING', 'CONFIRMED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando inscrições..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.registrations || []} loading={loading} emptyTitle="Nenhuma inscrição." />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />

      <Modal open={!!managing} onClose={() => setManaging(null)} title={`Gerenciar inscrição ${managing?.code || ''}`}>
        {manageLoading ? (
          <Spinner text="Carregando..." />
        ) : (
          <form onSubmit={saveManage} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="text-muted" style={{ margin: 0 }}>{managing?.user?.name} · {managing?.event?.name}</p>
            <Field label="Status da inscrição">
              <Select value={manageForm.status} onChange={(e) => setManageForm({ ...manageForm, status: e.target.value })}>
                <option value="CONFIRMED">Inscrito (CONFIRMED)</option>
                <option value="CANCELLED">Cancelado (CANCELLED)</option>
                <option value="PENDING">Pendente (PENDING)</option>
              </Select>
            </Field>
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              <legend>Atividades</legend>
              {eventActivities.length === 0 && <p className="text-muted" style={{ margin: 0 }}>Este evento não possui atividades.</p>}
              <div className="list">
                {eventActivities.map((a) => (
                  <Checkbox key={a.id} label={a.name} checked={manageForm.activityIds.includes(a.id)} onChange={() => toggleActivity(a.id)} />
                ))}
              </div>
            </fieldset>
            <Button type="submit" loading={saving}>Salvar alterações</Button>
          </form>
        )}
      </Modal>
    </>
  );
}
