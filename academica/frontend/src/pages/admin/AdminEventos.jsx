import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Eye, Pencil, Copy, Power, Trash2, Users } from 'lucide-react';
import { adminApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Button, StatusBadge, Spinner, ErrorState, Select, Field } from '../../components/ui';
import { ConfirmDialog, Modal } from '../../components/Overlay';
import { formatDate, formatDateTime, formatNumber } from '../../utils/format';

export default function AdminEventos() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState(null);
  const [toDeactivate, setToDeactivate] = useState(null);
  const [busy, setBusy] = useState(false);

  const [viewEvent, setViewEvent] = useState(null);
  const [regs, setRegs] = useState([]);
  const [regsLoading, setRegsLoading] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => eventApi.list({ search, status, page, limit: 10 }).then((r) => r),
    [search, status, page]
  );

  const duplicate = async (id) => {
    try {
      await eventApi.duplicate(id);
      toast.success('Evento duplicado.');
      reload();
    } catch (e) { toast.error(e?.response?.data?.message); }
  };
  const deactivate = async () => {
    setBusy(true);
    try { await eventApi.remove(toDeactivate.id); toast.success('Evento desativado.'); reload(); }
    catch (e) { toast.error(e?.response?.data?.message); }
    finally { setBusy(false); setToDeactivate(null); }
  };
  const hardDelete = async () => {
    setBusy(true);
    try { await eventApi.hardDelete(toDelete.id); toast.success('Evento excluído permanentemente.'); reload(); }
    catch (e) { toast.error(e?.response?.data?.message); }
    finally { setBusy(false); setToDelete(null); }
  };

  const viewRegistrations = async (ev) => {
    setViewEvent(ev);
    setRegsLoading(true);
    try {
      const r = await adminApi.registrations({ eventId: ev.id, limit: 500 });
      setRegs(r.registrations || r.data?.registrations || []);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Erro ao carregar inscritos.');
      setRegs([]);
    } finally {
      setRegsLoading(false);
    }
  };

  const columns = [
    { header: 'Evento', key: 'name', render: (r) => <strong>{r.name}</strong> },
    { header: 'Data', key: 'startDate', render: (r) => formatDate(r.startDate) },
    { header: 'Local', key: 'location', render: (r) => r.location || '—' },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { header: 'Inscritos', key: 'reg', render: (r) => r._count?.registrations ?? 0 },
    { header: 'Ações', key: 'actions', render: (r) => (
      <div className="row-actions">
        <button className="btn-icon" title="Ver inscritos" onClick={() => viewRegistrations(r)}><Users size={16} /></button>
        <Link to={`/admin/eventos/${r.id}`} className="btn-icon" title="Editar"><Pencil size={16} /></Link>
        <button className="btn-icon" title="Duplicar" onClick={() => duplicate(r.id)}><Copy size={16} /></button>
        <button className="btn-icon" title="Desativar" onClick={() => setToDeactivate(r)}><Power size={16} /></button>
        <button className="btn-icon btn-icon--danger" title="Excluir" onClick={() => setToDelete(r)}><Trash2 size={16} /></button>
      </div>
    ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Eventos</h1>
          <p>Gerencie os eventos da atlética.</p>
        </div>
        <Link to="/admin/eventos/novo"><Button icon={<Plus size={17} />}>Novo Evento</Button></Link>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Buscar eventos..." /></div>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="OPEN">Inscrições abertas</option>
            <option value="ONGOING">Em andamento</option>
            <option value="CLOSED">Encerrado</option>
            <option value="CANCELLED">Cancelado</option>
          </Select>
        </Field>
      </div>

      <DataTable
        columns={columns}
        rows={data?.data?.events || []}
        loading={loading}
        emptyTitle="Nenhum evento encontrado."
        emptyDescription={error ? undefined : 'Crie seu primeiro evento para começar.'}
      />
      <Pagination page={data?.meta?.page || 1} pages={data?.meta?.pages || 1} onPage={setPage} />

      <Modal open={!!viewEvent} onClose={() => setViewEvent(null)} title={`Inscritos — ${viewEvent?.name || ''}`} size="lg">
        {regsLoading ? (
          <Spinner text="Carregando inscritos..." />
        ) : regs.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>Nenhuma inscrição para este evento.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Participante</th>
                  <th>E-mail</th>
                  <th>Curso</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {regs.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.user?.name}</strong></td>
                    <td>{r.user?.email}</td>
                    <td>{r.user?.course || '—'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{formatDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>{formatNumber(regs.length)} inscrição(ões)</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDeactivate}
        title="Desativar evento"
        message={`Deseja desativar "${toDeactivate?.name}"?`}
        confirmLabel="Desativar"
        loading={busy}
        onConfirm={deactivate}
        onClose={() => setToDeactivate(null)}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Excluir evento permanentemente"
        message={`Isso excluirá "${toDelete?.name}" e seus dados associados. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        loading={busy}
        onConfirm={hardDelete}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
