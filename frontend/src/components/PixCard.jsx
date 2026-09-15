import { useState } from 'react';
import { Copy, CheckCircle2 } from 'lucide-react';
import { QRCodeCard } from './Cards';
import { Button, Card, StatusBadge } from './ui';
import { useToast } from '../context/ToastContext';

export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Cartão de pagamento PIX: QR (do payload) + copia e cola + status. */
export function PixCard({ payment, title = 'Pagamento via PIX' }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  if (!payment) return null;
  const paid = payment.status === 'PAID';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payment.pixPayload || '');
      setCopied(true);
      toast.success('Código PIX copiado.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  return (
    <Card className="card-pad">
      <div className="flex-between mb-2">
        <strong>{title}</strong>
        <StatusBadge status={payment.status} />
      </div>
      <p className="text-muted" style={{ margin: '0 0 10px' }}>
        Valor: <strong>{formatBRL(payment.amountCents)}</strong>{payment.code ? ` · ${payment.code}` : ''}
      </p>

      {paid ? (
        <div className="flex" style={{ color: 'var(--success)' }}>
          <CheckCircle2 size={20} /> Pagamento confirmado. QR Code de entrada liberado.
        </div>
      ) : (
        <>
          {payment.pixPayload && <QRCodeCard value={payment.pixPayload} label="Escaneie o QR PIX para pagar" />}
          {payment.pixPayload && (
            <div className="mt-2">
              <span className="field__label">PIX Copia e Cola</span>
              <textarea className="input textarea" readOnly value={payment.pixPayload} rows={3} onFocus={(e) => e.target.select()} />
              <Button className="btn--block mt-1" variant="secondary" onClick={copy} icon={copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}>
                {copied ? 'Copiado' : 'Copiar código PIX'}
              </Button>
            </div>
          )}
          <p className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
            Após pagar, aguarde a confirmação da organização para liberar o QR Code de entrada.
          </p>
        </>
      )}
    </Card>
  );
}
