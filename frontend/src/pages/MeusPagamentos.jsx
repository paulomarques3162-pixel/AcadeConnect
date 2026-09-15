import { CreditCard } from 'lucide-react';
import { paymentApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { Card, Spinner, ErrorState, EmptyState } from '../components/ui';
import { PixCard } from '../components/PixCard';

export default function MeusPagamentos() {
  const { data, loading, error, reload } = useApi(() => paymentApi.mine().then((r) => r.data.payments), []);

  if (loading) return <Spinner text="Carregando pagamentos..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const payments = data || [];

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Meus pagamentos</h1>
      <p className="text-muted mb-3">Acompanhe seus pagamentos de eventos e pedidos.</p>

      {payments.length === 0 ? (
        <EmptyState icon={<CreditCard size={28} />} title="Nenhum pagamento." description="Seus pagamentos aparecerão aqui." />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          {payments.map((p) => (
            <Card className="card-pad" key={p.id}>
              <p className="text-muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                {p.event?.name || (p.order ? `Pedido ${p.order.code}` : 'Pagamento')}
              </p>
              <PixCard payment={p} title={p.code} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
