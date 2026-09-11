import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, CalendarDays } from 'lucide-react';
import { registrationApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, StatusBadge, Spinner, ErrorState, EmptyState } from '../../components/ui';
import { ConfirmDialog } from '../../components/Overlay';
import { formatDate } from '../../utils/format';

export default function MinhasInscricoes() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => registrationApi.mine().then((r) => r.data.registrations), []);
  const [cancelId, setCancelId] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const doCancel = async () => {
    setCancelling(true);
    try {
      await registrationApi.cancel(cancelId);
      toast.success('Inscrição cancelada.');
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Não foi possível cancelar.');
    } finally {
      setCancelling(false);
      setCancelId(null);
    }
  };

  if (loading) return <Spinner text="Carregando inscrições..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const registrations = data || [];

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Minhas inscrições</h1>
      <p className="text-muted mb-3">Gerencie suas inscrições em eventos.</p>

      {registrations.length === 0 ? (
        <EmptyState icon={<Ticket size={28} />} title="Você ainda não possui inscrições." description="Explore os eventos e inscreva-se." action={<Link className="btn btn--primary" to="/eventos">Explorar eventos</Link>} />
      ) : (
        <div className="list">
          {registrations.map((r) => (
            <div className="card card-pad" key={r.id}>
              <div className="flex-between flex-wrap">
                <div>
                  <div className="flex mb-1" style={{ gap: 10 }}>
                    <h3 style={{ fontSize: '1.1rem' }}>{r.event?.name}</h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-muted" style={{ margin: 0 }}>
                    Inscrição #{r.code} · {formatDate(r.event?.startDate)} — {formatDate(r.event?.endDate)}
                  </p>
                </div>
                <div className="flex">
                  <Link className="btn btn--secondary btn--sm" to={`/inscricao/${r.id}`}>Ver inscrição</Link>
                  {r.event?.allowCancellation && r.status === 'CONFIRMED' && (
                    <Button variant="ghost" size="sm" onClick={() => setCancelId(r.id)}>Cancelar</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!cancelId}
        title="Cancelar inscrição"
        message="Tem certeza que deseja cancelar esta inscrição? Esta ação não pode ser desfeita."
        confirmLabel="Cancelar inscrição"
        danger
        loading={cancelling}
        onConfirm={doCancel}
        onClose={() => setCancelId(null)}
      />
    </>
  );
}
