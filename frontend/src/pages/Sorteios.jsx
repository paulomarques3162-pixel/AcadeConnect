import { Trophy, Calendar } from 'lucide-react';
import { raffleApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../components/ui';
import { formatDateTime } from '../utils/format';

const RAFFLE_LABELS = { OPEN: 'Em andamento', CLOSED: 'Encerrado', CANCELLED: 'Cancelado' };

export default function Sorteios() {
  const { data, loading, error, reload } = useApi(() => raffleApi.results().then((r) => r.data.raffles), []);

  if (loading) return <Spinner text="Carregando resultados..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const raffles = data || [];

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Sorteios / Resultados</h1>
      <p className="text-muted mb-3">Acompanhe os resultados dos sorteios dos eventos.</p>

      {raffles.length === 0 ? (
        <EmptyState icon={<Trophy size={28} />} title="Nenhum sorteio disponível." description="Os resultados dos sorteios aparecerão aqui." />
      ) : (
        <div className="list">
          {raffles.map((r) => {
            const winners = r.winners || [];
            return (
              <Card className="card-pad" key={r.id}>
                <div className="flex-between flex-wrap mb-2">
                  <div>
                    <div className="flex mb-1" style={{ gap: 10 }}>
                      <strong>{r.prize}</strong>
                      <StatusBadge
                        status={r.status}
                        label={RAFFLE_LABELS[r.status] || r.status}
                        tone={r.status === 'CLOSED' ? 'success' : 'info'}
                      />
                    </div>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                      <Calendar size={13} /> {r.event?.name}
                    </p>
                  </div>
                </div>

                {winners.length > 0 ? (
                  <div className="list">
                    {winners.map((w) => (
                      <div className="presence-success" key={w.id} style={{ flexDirection: 'column' }}>
                        <Trophy size={30} color="var(--brand)" />
                        <strong style={{ fontSize: '1.05rem' }}>🏆 {w.user?.name}</strong>
                        <span className="text-muted">
                          Vencedor(a) de "{w.prizeSnapshot || r.prize}"{w.drawnAt ? ` · ${formatDateTime(w.drawnAt)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted" style={{ margin: 0 }}>Resultado ainda não divulgado.</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
