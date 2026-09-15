import { useMemo, useState } from 'react';
import { ShoppingCart, Tag, Trash2 } from 'lucide-react';
import { productApi, orderApi, couponApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Button, Input, Card, Spinner, ErrorState, EmptyState, SmartImage } from '../components/ui';
import { PixCard, formatBRL } from '../components/PixCard';
import { getErrorMessage } from '../api/client';

export default function Loja() {
  const toast = useToast();
  const [cart, setCart] = useState({});
  const [couponCode, setCouponCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [payment, setPayment] = useState(null);

  const { data, loading, error, reload } = useApi(() => productApi.list().then((r) => r.data.products), []);
  const products = data || [];

  const items = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity })),
    [cart]
  );
  const subtotalCents = useMemo(
    () => items.reduce((acc, it) => {
      const p = products.find((x) => x.id === it.productId);
      return acc + (p ? p.priceCents * it.quantity : 0);
    }, 0),
    [items, products]
  );
  const totalCents = preview ? preview.totalCents : subtotalCents;

  const setQty = (id, q) => setCart((c) => ({ ...c, [id]: Math.max(0, q) }));
  const removeItem = (id) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });

  const applyCoupon = async () => {
    if (!couponCode.trim()) return setPreview(null);
    try {
      const res = await couponApi.validate(couponCode.trim(), subtotalCents);
      setPreview(res.data);
      toast.success('Cupom aplicado.');
    } catch (e) {
      setPreview(null);
      toast.error(getErrorMessage(e));
    }
  };

  const finish = async () => {
    if (items.length === 0) return toast.error('Adicione produtos ao pedido.');
    setCreating(true);
    try {
      const res = await orderApi.create({ items, couponCode: couponCode.trim() || null });
      const order = res.data.order;
      setCart({});
      setCouponCode('');
      setPreview(null);
      const pay = await orderApi.pay(order.id);
      setPayment(pay.data.payment);
      toast.success('Pedido criado! Pague com PIX para concluir.');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Loja</h1>
          <p>Produtos da Mustangs Atlética.</p>
        </div>
      </div>

      {loading && <Spinner text="Carregando produtos..." />}
      {error && <ErrorState onRetry={reload} />}

      {!loading && !error && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
          {products.length === 0 && <EmptyState icon={<ShoppingCart size={28} />} title="Nenhum produto disponível." />}
          {products.map((p) => (
            <Card className="card-pad" key={p.id}>
              <SmartImage src={p.imageUrl} alt={p.name} className="event-card__banner-img" fallbackLetter={p.name.charAt(0)} />
              <h4 style={{ margin: '10px 0 4px' }}>{p.name}</h4>
              <p className="text-muted" style={{ margin: '0 0 8px', fontSize: '0.85rem' }}>{p.description || 'Sem descrição'}</p>
              <p style={{ margin: '0 0 8px' }}><strong>{formatBRL(p.priceCents)}</strong>{p.stock !== null && p.stock !== undefined ? ` · ${p.stock} disponível(is)` : ''}</p>
              <div className="flex">
                <Button size="sm" variant="secondary" onClick={() => setQty(p.id, (cart[p.id] || 0) - 1)}>-</Button>
                <span style={{ minWidth: 26, textAlign: 'center', fontWeight: 700 }}>{cart[p.id] || 0}</span>
                <Button size="sm" variant="secondary" onClick={() => setQty(p.id, (cart[p.id] || 0) + 1)} disabled={p.stock !== null && p.stock !== undefined && (cart[p.id] || 0) >= p.stock}>+</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {(items.length > 0 || payment) && (
        <Card className="card-pad mt-3">
          <h3 className="mb-2">Seu pedido</h3>
          {items.map((it) => {
            const p = products.find((x) => x.id === it.productId);
            if (!p) return null;
            return (
              <div className="flex-between" key={it.productId} style={{ borderBottom: '1px solid var(--border)', padding: '6px 0' }}>
                <span>{p.name} x{it.quantity}</span>
                <div className="flex">
                  <span>{formatBRL(p.priceCents * it.quantity)}</span>
                  <button className="icon-btn" onClick={() => removeItem(it.productId)} aria-label="Remover"><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}

          <div className="flex mt-2">
            <Tag size={16} />
            <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Cupom de desconto" />
            <Button variant="secondary" onClick={applyCoupon}>Aplicar</Button>
          </div>

          <div className="mt-2">
            <p style={{ margin: 0 }}>Subtotal: <strong>{formatBRL(subtotalCents)}</strong></p>
            {(preview || 0) && <p style={{ margin: 0, color: 'var(--success)' }}>Desconto: -{formatBRL(preview.discountCents)}</p>}
            <p style={{ margin: '4px 0 12px', fontSize: '1.1rem' }}>Total: <strong>{formatBRL(totalCents)}</strong></p>
          </div>

          {!payment && <Button className="btn--lg" loading={creating} onClick={finish} icon={<ShoppingCart size={18} />}>Finalizar pedido e gerar PIX</Button>}
          {payment && (
            <div className="mt-2">
              <PixCard payment={payment} title="Pagamento do pedido" />
            </div>
          )}
        </Card>
      )}
    </>
  );
}
