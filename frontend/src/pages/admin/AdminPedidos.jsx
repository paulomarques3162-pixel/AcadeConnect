import { useState } from 'react';
import { Eye, CheckCircle2, XCircle } from 'lucide-react';
import { orderApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, Pagination, SearchBar } from '../../components/DataTable';
import { Button, Field, Select, StatusBadge, Card, Spinner, ErrorState } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { PixCard } from '../../components/PixCard';
import { formatBRL } from '../../components/PixCard';
import { formatDateTime } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function AdminPedidos() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState(null);

  const { data, loading, error, reload } = useApi(
    () => orderApi.adminList({ status, search, page, limit: 15 }).then((r) => r),
    [status, search, page]
  );

  const setOrderStatus = async (id, s) => {
    try { await orderApi.setStatus(id, s); toast.success('Status atualizado.'); reload(); setViewing(null); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  const columns = [
    { header: 'Pedido', key: 'code', render: (r) => <strong>{r.code}</strong> },
    { header: 'Cliente', key: 'user', render: (r) => r.user?.name },
    { header: 'Itens', key: 'items', render: (r) => r.items?.length || 0 },
    { header: 'Total', key: 'total', render: (r) => formatBRL(r.totalCents) },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { header: 'Data', key: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
    { header: 'Ações', key: 'actions', render: (r) => (
      <div className="flex">
        <button className="icon-btn" title="Ver" onClick={() => setViewing(r)}><Eye size={16} /></button>
        {r.status === 'PENDING' && <button className="icon-btn" style={{ color: 'var(--success)' }} title="Marcar pago" onClick={() => setOrderStatus(r.id, 'PAID')}><CheckCircle2 size={16} /></button>}
        {r.status !== 'CANCELLED' && <button className="icon-btn" style={{ color: 'var(--danger)' }} title="Cancelar" onClick={() => setOrderStatus(r.id, 'CANCELLED')}><XCircle size={16} /></button>}
      </div>
    ) },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <p>Pedidos da loja e seus pagamentos.</p>
        </div>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Buscar por cliente ou código..." /></div>
        <Field label="Status">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando pedidos..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.orders || []} loading={loading} emptyTitle="Nenhum pedido." />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Pedido ${viewing?.code || ''}`} size="lg">
        {viewing && (
          <>
            <p className="text-muted" style={{ marginTop: 0 }}>{viewing.user?.name} · {viewing.user?.email}</p>
            <div className="table-wrap mb-2">
              <table className="table">
                <thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {(viewing.items || []).map((it) => (
                    <tr key={it.id}><td>{it.productName}</td><td>{it.quantity}</td><td>{formatBRL(it.unitPriceCents)}</td><td>{formatBRL(it.subtotalCents)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: 0 }}>Subtotal: {formatBRL(viewing.subtotalCents)}</p>
            <p style={{ margin: 0 }}>Desconto: -{formatBRL(viewing.discountCents)}{viewing.couponCode ? ` (${viewing.couponCode})` : ''}</p>
            <p style={{ margin: '0 0 10px' }}><strong>Total: {formatBRL(viewing.totalCents)}</strong></p>
            {viewing.payment ? <PixCard payment={viewing.payment} title="Pagamento do pedido" /> : <p className="text-muted">Sem pagamento gerado.</p>}
          </>
        )}
      </Modal>
    </>
  );
}
