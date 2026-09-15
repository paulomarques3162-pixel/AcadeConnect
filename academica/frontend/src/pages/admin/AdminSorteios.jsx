import { useState } from 'react';
import { Plus, Trophy, Users, Wand2 } from 'lucide-react';
import { raffleApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Roulette } from '../../components/Roulette';
import { Button, Field, Input, Select, Checkbox, Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { formatDateTime, formatNumber } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

const RAFFLE_LABELS = { OPEN: 'Aberto', CLOSED: 'Encerrado', CANCELLED: 'Cancelado' };

export default function AdminSorteios() {
  const toast = useToast();
  const [eventId, setEventId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ prize: '', allowRepeat: false });
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [spinKey, setSpinKey] = useState(0);
  const [targetIndex, setTargetIndex] = useState(null);
  const [winner, setWinner] = useState(null);
  const [drawing, setDrawing] = useState(false);

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const raffles = useApi(() => raffleApi.list({ eventId }).then((r) => r.data.raffles), [eventId]);
  const detail = useApi(() => (selectedId ? raffleApi.get(selectedId).then((r) => r.data.raffle) : Promise.resolve(null)), [selectedId]);
  const elig = useApi(() => (selectedId ? raffleApi.eligible(selectedId).then((r) => r.data) : Promise.resolve(null)), [selectedId]);

  const create = async (e) => {
    e.preventDefault();
    if (!eventId) return toast.error('Selecione o evento.');
    setSaving(true);
    try {
      const res = await raffleApi.create({ eventId, ...form });
      toast.success(`Sorteio criado (${res.data.eligibleCount} elegíveis).`);
      setModalOpen(false);
      setForm({ prize: '', allowRepeat: false });
      raffles.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const doDraw = async () => {
    if (!selectedId) return;
    setDrawing(true);
    setWinner(null);
    try {
      const res = await raffleApi.draw(selectedId);
      const list = elig.data?.eligible || [];
      const idx = list.findIndex((x) => x.userId === res.data.winner.userId);
      setTargetIndex(idx >= 0 ? idx : 0);
      setWinner(res.data.winner);
      setSpinKey((k) => k + 1);
      toast.success('Vencedor sorteado!');
      detail.reload();
      elig.reload();
      raffles.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDrawing(false);
    }
  };

  const closeRaffle = async (id) => {
    try {
      await raffleApi.setStatus(id, 'CLOSED');
      toast.success('Sorteio encerrado.');
      raffles.reload();
      detail.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const eligibleNames = elig.data?.eligible?.map((e) => e.name) || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sorteios</h1>
          <p>Realize sorteios apenas entre participantes presentes no evento.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} icon={<Plus size={17} />} disabled={!eventId}>
          Novo sorteio
        </Button>
      </div>

      <div className="filters mb-3" style={{ maxWidth: 420 }}>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => { setEventId(e.target.value); setSelectedId(null); setWinner(null); }}>
            <option value="">Selecione um evento</option>
            {(events.data || []).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </Select>
        </Field>
      </div>

      {!eventId && <p className="text-muted">Selecione um evento para ver/criar sorteios.</p>}
      {raffles.loading && eventId && <Spinner text="Carregando sorteios..." />}
      {raffles.error && <ErrorState onRetry={raffles.reload} />}

      {eventId && !raffles.loading && (
        <>
          {(raffles.data || []).length === 0 ? (
            <EmptyState icon={<Trophy size={28} />} title="Nenhum sorteio neste evento." description="Crie o primeiro sorteio." />
          ) : (
            <div className="grid mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
              {(raffles.data || []).map((r) => (
                <Card className="card-pad" key={r.id} style={{ cursor: 'pointer', borderColor: selectedId === r.id ? 'var(--brand)' : undefined }} onClick={() => { setSelectedId(r.id); setWinner(null); }}>
                  <div className="flex-between mb-1">
                    <strong>{r.prize}</strong>
                    <StatusBadge status={r.status} label={RAFFLE_LABELS[r.status] || r.status} tone={r.status === 'OPEN' ? 'success' : 'neutral'} />
                  </div>
                  <p className="text-muted" style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>{r.event?.name}</p>
                  <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                    <Users size={13} /> {formatNumber(r._count?.winners || 0)} vencedor(es) · {formatDateTime(r.createdAt)}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {selectedId && detail.data && (
        <Card className="card-pad">
          <div className="flex-between flex-wrap mb-3">
            <div>
              <h3>Roleta — {detail.data.prize}</h3>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                Elegíveis (presentes): <strong>{formatNumber(elig.data?.eligibleCount || 0)}</strong>
                {!detail.data.allowRepeat && ' · sem repetição de vencedor'}
              </p>
            </div>
            <div className="flex">
              {detail.data.status === 'OPEN' && (
                <Button loading={drawing} onClick={doDraw} icon={<Wand2 size={17} />} disabled={!(elig.data?.eligibleCount > 0)}>
                  SORTEAR
                </Button>
              )}
              {detail.data.status === 'OPEN' && (
                <Button variant="secondary" onClick={() => closeRaffle(detail.data.id)}>Encerrar</Button>
              )}
            </div>
          </div>

          {eligibleNames.length > 0 ? (
            <Roulette names={eligibleNames} targetIndex={targetIndex} spinKey={spinKey} onEnd={() => {}} />
          ) : (
            <p className="text-muted">Nenhum participante elegível (é necessário ter presença registrada).</p>
          )}

          {winner && (
            <div className="presence-success" style={{ flexDirection: 'column' }}>
              <Trophy size={40} color="var(--brand)" />
              <strong style={{ fontSize: '1.2rem' }}>🎉 {winner.name}</strong>
              <span className="text-muted">Vencedor(a) de "{winner.prize}"</span>
            </div>
          )}

          <div className="mt-3">
            <h4 style={{ marginBottom: 10 }}>Histórico</h4>
            {(detail.data.winners || []).length === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>Ainda não há vencedores.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Vencedor</th><th>Prêmio</th><th>Elegíveis</th><th>Data</th><th>Responsável</th></tr>
                  </thead>
                  <tbody>
                    {detail.data.winners.map((w) => (
                      <tr key={w.id}>
                        <td><strong>{w.user?.name}</strong></td>
                        <td>{w.prizeSnapshot}</td>
                        <td>{formatNumber(w.eligibleCountAtDraw)}</td>
                        <td>{formatDateTime(w.drawnAt)}</td>
                        <td>{w.drawnBy?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Novo sorteio">
        <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Prêmio" required>
            <Input value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="Ex.: Fone Bluetooth" required />
          </Field>
          <Checkbox label="Permitir que o mesmo participante ganhe mais de uma vez neste sorteio" checked={form.allowRepeat} onChange={(e) => setForm({ ...form, allowRepeat: e.target.checked })} />
          <Button type="submit" loading={saving}>Criar sorteio</Button>
        </form>
      </Modal>
    </>
  );
}
