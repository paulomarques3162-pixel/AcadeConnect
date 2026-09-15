import { useEffect, useState } from 'react';
import { Copy, CheckCircle2, RefreshCw } from 'lucide-react';
import { QRCodeCard } from './Cards';
import { Button, Card, StatusBadge } from './ui';
import { useToast } from '../context/ToastContext';

export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Contagem regressiva sincronizada com o expiresAt vindo do backend. */
function useCountdown(expiresAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const remain = Math.max(0, new Date(expiresAt).getTime() - now);
  const total = Math.floor(remain / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    expired: remain <= 0,
    label: `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`,
  };
}

/**
 * Cartão de pagamento PIX: QR (do payload EMV), PIX Copia e Cola, status,
 * contagem regressiva de validade e opção de gerar novo PIX quando expirar.
 */
export function PixCard({ payment, title = 'Pagamento via PIX', onRegenerate = null }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const countdown = useCountdown(payment?.expiresAt);

  if (!payment) return null;
  const paid = payment.status === 'PAID';
  const expired = !paid && (payment.status === 'EXPIRED' || (countdown && countdown.expired));
  const showQr = !paid && !expired && payment.pixPayload;

  const copy = async () => {
    try {
      // Copia SOMENTE o payload PIX (nunca URL/data URL/HTML).
      await navigator.clipboard.writeText(payment.pixPayload || '');
      setCopied(true);
      toast.success('PIX Copia e Cola copiado!');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  const regenerate = async () => {
    if (!onRegenerate) return;
    setRegenerating(true);
    try {
      await onRegenerate();
      toast.success('Novo PIX gerado.');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Não foi possível gerar um novo PIX.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <Card className="card-pad">
      <div className="flex-between mb-2">
        <strong>{title}</strong>
        <StatusBadge status={paid ? 'PAID' : expired ? 'EXPIRED' : payment.status} />
      </div>
      <p className="text-muted" style={{ margin: '0 0 10px' }}>
        Valor: <strong>{formatBRL(payment.amountCents)}</strong>{payment.code ? ` · ${payment.code}` : ''}
      </p>

      {paid ? (
        <div className="flex" style={{ color: 'var(--success)' }}>
          <CheckCircle2 size={20} /> Pagamento confirmado.
        </div>
      ) : expired ? (
        <div>
          <p style={{ margin: '0 0 10px', color: 'var(--danger)', fontWeight: 700 }}>PIX expirado</p>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Este QR Code não é mais válido. Gere um novo para pagar.</p>
          {onRegenerate && (
            <Button onClick={regenerate} loading={regenerating} icon={<RefreshCw size={16} />}>Gerar novo PIX</Button>
          )}
        </div>
      ) : (
        <>
          {countdown && !paid && (
            <p style={{ margin: '0 0 10px', fontWeight: 700 }}>
              PIX disponível por: <span style={{ color: 'var(--brand)' }}>{countdown.label}</span>
            </p>
          )}
          {showQr && <QRCodeCard value={payment.pixPayload} label="Escaneie o QR PIX para pagar" />}
          {payment.pixPayload && (
            <div className="mt-2">
              <span className="field__label">PIX Copia e Cola</span>
              <textarea className="input textarea" readOnly value={payment.pixPayload} rows={3} onFocus={(e) => e.target.select()} />
              <Button className="btn--block mt-1" variant="secondary" onClick={copy} icon={copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}>
                {copied ? 'PIX Copia e Cola copiado!' : 'Copiar PIX Copia e Cola'}
              </Button>
            </div>
          )}
          <p className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
            Após pagar, aguarde a confirmação da organização.
          </p>
        </>
      )}
    </Card>
  );
}
