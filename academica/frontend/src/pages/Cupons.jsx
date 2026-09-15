import { useState } from 'react';
import { Tag, Copy, CheckCircle2 } from 'lucide-react';
import { couponApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Button, Card, Spinner, ErrorState, EmptyState } from '../components/ui';
import { formatBRL } from '../components/PixCard';
import { formatDate } from '../utils/format';

export default function Cupons() {
  const toast = useToast();
  const [copied, setCopied] = useState(null);
  const { data, loading, error, reload } = useApi(() => couponApi.publicList().then((r) => r.data.coupons), []);

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast.success('Cupom copiado.');
    } catch {
      toast.error('Não foi possível copiar.');
    }
  };

  if (loading) return <Spinner text="Carregando cupons..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const coupons = data || [];

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Cupons</h1>
      <p className="text-muted mb-3">Use um cupom no checkout da loja.</p>

      {coupons.length === 0 ? (
        <EmptyState icon={<Tag size={28} />} title="Nenhum cupom disponível." description="Volte mais tarde para conferir novas promoções." />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
          {coupons.map((c) => (
            <Card className="card-pad" key={c.id}>
              <div className="flex mb-2" style={{ color: 'var(--brand)' }}><Tag size={18} /><strong>{c.code}</strong></div>
              <p style={{ margin: '0 0 4px' }}>
                {c.type === 'PERCENT' ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`}
              </p>
              {c.minOrderValueCents ? <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>Pedido mínimo: {formatBRL(c.minOrderValueCents)}</p> : null}
              {c.validUntil ? <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>Válido até {formatDate(c.validUntil)}</p> : null}
              <Button className="btn--block mt-2" variant="secondary" onClick={() => copy(c.code)} icon={copied === c.code ? <CheckCircle2 size={16} /> : <Copy size={16} />}>
                {copied === c.code ? 'Copiado' : 'Copiar código'}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
