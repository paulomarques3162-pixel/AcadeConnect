import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, Copy, Users, Power } from 'lucide-react';
import { activityApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, Pagination } from '../../components/DataTable';
import { Select, Field, StatusBadge, Spinner, ErrorState } from '../../components/ui';
import { ConfirmDialog } from '../../components/Overlay';
import { formatDate, formatNumber, ACTIVITY_TYPE_LABELS } from '../../utils/format';

export default function AdminAtividades() {
  const toast = useToast();
  const [eventId, setEventId] = useState('');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState(null);
  const [toClose, setToClose] = useState(null);
  const [busy, setBusy] = useState(false);

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const { data, loading, error, reload } = useApi(
    () => activityApi.list({ eventId, page, limit: 10 }).then((r) => r.data.activities),
    [eventId, page]
  );

  const allActivities = data || [];
  // Server list for admin is flat; filter pages are simulated client-side for simplicity.
  const filtered = eventId ? allActivities : allActivities;

  const duplicate = async (id) => {
    try { await activityApi.duplicate(id); toast.success('Atividade duplicada.'); reload(); }
    catch (e) { toast.error(e?.response?.data?.message); }
  };
  const remove = async () => {
    setBusy(true);
    try { await activityApi.remove(toDelete); toast.success('Atividade excluída.'); reload(); }
    catch (e) { toast.error(e?.response?.data?.message); }
    finally { setBusy(false); setToDelete(null); }
  };
  const close = async () => {
    setBusy(true);
    try { await activityApi.close(toClose); toast.success('Atividade encerrada.'); reload(); }
    catch (e) { toast.error(e?.response?.data?.message); }
    finally { setBusy(false); setToClose(null); }
  };

  const columns = [
    { header: 'Atividade', key: 'name', render: (r) => <strong>{r.name}</strong> },
    { header: 'Evento', key: 'event', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{r.event?.name}</span> },
    { header: 'Data', key: 'date', render: (r) => formatDate(r.date) },
    { header: 'Horário', key: 'time', render: (r) => `${r.startTime} - ${r.endTime}` },
    { header: 'Tipo', key: 'type', render: (r) => ACTIVITY_TYPE_LABELS[r.type] || r.type },
    { header: 'Inscritos', key: 'insc', render: (r) => formatNumber(r._count?.registrations) },
    { header: 'Presentes', key: 'pres', render: (r) => formatNumber(r._count?.attendance) },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    {
      header: 'Ações', key: 'actions', render: (r) => (
        <div className="flex">
          <Link className="icon-btn" to={`/admin/presencas/${r.id}`} title="Controle de presença" aria-label="Presença"><Users size={17} /></Link>
          <Link className="icon-btn" to={`/admin/atividades/${r.id}`} title="Editar" aria-label="Editar"><Pencil size={17} /></Link>
          {r.status !== 'FINISHED' && r.status !== 'CANCELLED' && (
            <button className="icon-btn" onClick={() => setToClose(r.id)} title="Encerrar atividade" aria-label="Encerrar atividade"><Power size={17} /></button>
          )}
          <button className="icon-btn" onClick={() => duplicate(r.id)} title="Duplicar" aria-label="Duplicar"><Copy size={17} /></button>
          <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => setToDelete(r.id)} title="Excluir" aria-label="Excluir"><Trash2 size={17} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Atividades</h1>
          <p>Gerencie palestras, minicursos, workshops e mais.</p>
        </div>
        <Link className="btn btn--primary" to="/admin/atividades/novo"><Plus size={18} /> Criar atividade</Link>
      </div>

      <div className="filters mb-3" style={{ maxWidth: 360 }}>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos os eventos</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando atividades..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={filtered} loading={loading} emptyTitle="Nenhuma atividade." emptyDescription="Crie atividades para seus eventos." />}
      <Pagination page={page} pages={Math.ceil(filtered.length / 10)} onPage={setPage} />

      <ConfirmDialog open={!!toDelete} title="Excluir atividade" message="Esta atividade e seus registros serão excluídos." confirmLabel="Excluir" danger loading={busy} onConfirm={remove} onClose={() => setToDelete(null)} />
      <ConfirmDialog open={!!toClose} title="Encerrar atividade" message="Deseja encerrar esta atividade? Ela passará a não aceitar novas inscrições nem registro de presença." confirmLabel="Encerrar" loading={busy} onConfirm={close} onClose={() => setToClose(null)} />
    </>
  );
}
