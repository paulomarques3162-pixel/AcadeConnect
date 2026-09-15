import { useState } from 'react';
import { Download, FileText, ShoppingBag } from 'lucide-react';
import { orderApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Button, Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../components/ui';
import { PixCard, formatBRL } from '../components/PixCard';
import { formatDateTime } from '../utils/format';
import { getErrorMessage } from '../api/client';

export default function MeusPedidos() {
  const toast = useToast();
  const [payment, setPayment] = useState(null);
  const [busy, setBusy] = useState(null);
  const { data, loading, error, reload } = useApi(() => orderApi.mine().then((r) => r.data.orders), []);

  const pay = async (id) => {
    setBusy(id);
    try {
      const res = await orderApi.pay(id);
      setPayment(res.data.payment);
      reload();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setBusy(null); }
  };

  const downloadReceipt = async (id, code) => {
    try {
      const res = await fetch(orderApi.receiptUrl(id), { headers: { Authorization: `Bearer ${localStorage.getItem('acadeconnect_token')}` } });
      if (!res.ok) throw new Error('Falha ao baixar comprovante.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `comprovante-${code}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e.message || 'Erro ao baixar comprovante.'); }
  };

  if (loading) return <Spinner text="Carregando pedidos..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const orders = data || [];

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Meus pedidos</h1>
      <p className="text-muted mb-3">Acompanhe seus pedidos e pagamentos.</p>

      {orders.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={28} />} title="Você ainda não fez pedidos." description="Visite a loja para comprar produtos." />
      ) : (
        <div className="list">
          {orders.map((o) => (
            <Card className="card-pad" key={o.id}>
              <div className="flex-between flex-wrap mb-2">
                <div>
                  <div className="flex mb-1" style={{ gap: 10 }}>
                    <strong>{o.code}</strong>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>{formatDateTime(o.createdAt)}</p>
                </div>
                <div className="flex">
                  {o.status === 'PENDING' && <Button size="sm" loading={busy === o.id} onClick={() => pay(o.id)}>Pagar com PIX</Button>}
                  <Button size="sm" variant="secondary" onClick={() => downloadReceipt(o.id, o.code)} icon={<Download size={15} />}>Comprovante</Button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Subtotal</th></tr></thead>
                  <tbody>
                    {(o.items || []).map((it) => (
                      <tr key={it.id}><td>{it.productName}</td><td>{it.quantity}</td><td>{formatBRL(it.unitPriceCents)}</td><td>{formatBRL(it.subtotalCents)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '8px 0 0', textAlign: 'right' }}>
                Subtotal {formatBRL(o.subtotalCents)} · Desconto -{formatBRL(o.discountCents)} · <strong>Total {formatBRL(o.totalCents)}</strong>
              </p>
            </Card>
          ))}
        </div>
      )}

      {payment && (
        <div className="mt-3">
          <PixCard payment={payment} title="Pagamento do pedido" />
        </div>
      )}
    </>
  );
}
