import { useState } from 'react';
import { CheckCircle2, XCircle, Eye } from 'lucide-react';
import { paymentApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Button, Field, Select, StatusBadge, Card, Spinner, ErrorState } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
import { PixCard, formatBRL } from '../../components/PixCard';
import { formatDateTime } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function AdminPagamentos() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [eventId, setEventId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);
  const [toCancel, setToCancel] = useState(null);

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const { data, loading, error, reload } = useApi(
    () => paymentApi.adminList({ status, eventId, search, page, limit: 15 }).then((r) => r),
    [status, eventId, search, page]
  );

  const confirm = async (id) => {
    try { await paymentApi.confirm(id); toast.success('Pagamento confirmado.'); reload(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };
  const cancel = async () => {
    try { await paymentApi.setStatus(toCancel, 'CANCELLED'); toast.success('Pagamento cancelado.'); reload(); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setToCancel(null); }
  };

  const columns = [
    { header: 'Código', key: 'code', render: (r) => <strong>{r.code}</strong> },
    { header: 'Participante', key: 'user', render: (r) => r.user?.name },
    { header: 'Destino', key: 'dest', render: (r) => r.event?.name || (r.order ? `Pedido ${r.order.code}` : '—') },
    { header: 'Valor', key: 'amount', render: (r) => formatBRL(r.amountCents) },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { header: 'Data', key: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
    {
      header: 'Ações', key: 'actions', render: (r) => (
        <div className="flex">
          <button className="icon-btn" title="Ver" onClick={() => setViewing(r)}><Eye size={16} /></button>
          {r.status !== 'PAID' && r.status !== 'CANCELLED' && r.status !== 'REFUNDED' && (
            <button className="icon-btn" style={{ color: 'var(--success)' }} title="Confirmar pagamento" onClick={() => confirm(r.id)}><CheckCircle2 size={16} /></button>
          )}
          {r.status === 'PENDING' && (
            <button className="icon-btn" style={{ color: 'var(--danger)' }} title="Cancelar" onClick={() => setToCancel(r.id)}><XCircle size={16} /></button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pagamentos</h1>
          <p>Confirme os pagamentos PIX manualmente após verificar o recebimento.</p>
        </div>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou código..." /></div>
        <Field label="Status">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {['PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => { setEventId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {(events.data || []).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando pagamentos..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.payments || []} loading={loading} emptyTitle="Nenhum pagamento." />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Pagamento ${viewing?.code || ''}`}>
        {viewing && (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>{viewing.user?.name} · {viewing.user?.email}</p>
            <PixCard payment={viewing} title="Detalhes do PIX" />
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!toCancel} title="Cancelar pagamento" message="O participante perderá o acesso até um novo pagamento ser confirmado." confirmLabel="Cancelar pagamento" danger onConfirm={cancel} onClose={() => setToCancel(null)} />
    </>
  );
}
