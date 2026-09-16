import { Trophy, Calendar, Medal } from 'lucide-react';
import { raffleApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../components/ui';
import { formatDateTime, formatNumber } from '../utils/format';
import '../styles/sorteio.css';

const RAFFLE_LABELS = { OPEN: 'Em andamento', CLOSED: 'Encerrado', CANCELLED: 'Cancelado' };

export default function Sorteios() {
  const { data, loading, error, reload } = useApi(() => raffleApi.results().then((r) => r.data.raffles), []);

  if (loading) return <Spinner text="Carregando resultados..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const raffles = data || [];

  return (
    <div className="raffle">
      <header className="raffle-hero">
        <span className="raffle-hero__eyebrow"><Trophy size={14} /> Resultados oficiais · Mustangs Atlética</span>
        <h1 className="raffle-hero__title">Sorteios</h1>
        <p className="raffle-hero__event"><Medal size={15} /> Acompanhe os vencedores dos sorteios dos eventos.</p>
      </header>

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
                    <div className="flex mb-1" style={{ gap: 10, alignItems: 'center' }}>
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
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                    {winners.map((w) => (
                      <div className="raffle-stat raffle-fade" key={w.id} style={{ textAlign: 'center' }}>
                        <Medal size={26} className="raffle-medal" aria-hidden="true" />
                        <div className="raffle-stat__value" style={{ fontSize: '1.15rem', marginTop: 6 }}>🏆 {w.user?.name}</div>
                        <div className="raffle-stat__hint">
                          {w.prizeSnapshot || r.prize}{w.drawnAt ? ` · ${formatDateTime(w.drawnAt)}` : ''}
                        </div>
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
    </div>
  );
}
