import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useLiveData } from '../../context/LiveDataContext';
import { Button, Card, Spinner, ErrorState, EmptyState, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

/**
 * Área de notificações do participante.
 *
 * Reaproveita o endpoint já existente (`GET /notifications`) e o store de tempo
 * real: ao marcar como lida, o sino do cabeçalho é atualizado localmente pelo
 * LiveDataContext (sem uma segunda chamada). Não há polling — a lista é
 * carregada uma única vez ao abrir a página.
 */
export default function Notificacoes() {
  const toast = useToast();
  const { markNotificationRead, refreshNotifications } = useLiveData();
  const [localRead, setLocalRead] = useState(() => new Set());
  const { data, loading, error, reload } = useApi(
    () => notificationApi.list({ limit: 50 }).then((r) => r.data.notifications),
    []
  );

  const markOne = async (n) => {
    if (n.read || localRead.has(n.id)) return;
    setLocalRead((prev) => new Set(prev).add(n.id));
    markNotificationRead(n.id); // atualiza o sino localmente + POST
  };

  const markAll = async () => {
    try {
      await notificationApi.markAllRead();
      setLocalRead(new Set((data || []).map((n) => n.id)));
      refreshNotifications({ force: true });
      toast.success('Notificações marcadas como lidas.');
    } catch {
      toast.error('Não foi possível marcar como lidas.');
    }
  };

  if (loading) return <Spinner text="Carregando notificações..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const items = data || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notificações</h1>
          <p>Avisos sobre inscrições, presenças, certificados e eventos.</p>
        </div>
        {items.some((n) => !n.read && !localRead.has(n.id)) && (
          <Button variant="secondary" icon={<CheckCheck size={17} />} onClick={markAll}>
            Marcar todas como lidas
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Bell size={28} />} title="Nenhuma notificação." description="Você está em dia." />
      ) : (
        <div className="list">
          {items.map((n) => {
            const unread = !n.read && !localRead.has(n.id);
            return (
              <Card
                className="card-pad"
                key={n.id}
                style={unread ? { borderLeft: '4px solid var(--brand)' } : undefined}
                onClick={() => markOne(n)}
              >
                <div className="flex-between flex-wrap mb-1">
                  <div className="flex" style={{ gap: 10 }}>
                    <strong>{n.title}</strong>
                    {unread && <StatusBadge status="NEW" label="Nova" tone="info" />}
                  </div>
                  <span className="text-muted" style={{ fontSize: '0.82rem' }}>{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="text-muted" style={{ margin: 0 }}>{n.message}</p>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
