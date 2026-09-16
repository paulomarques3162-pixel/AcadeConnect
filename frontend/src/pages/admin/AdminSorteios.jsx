import { useState } from 'react';
import { Plus, Trophy, Users, Wand2, Sparkles, CalendarDays, UserCheck, Medal } from 'lucide-react';
import { raffleApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Roulette } from '../../components/Roulette';
import { Button, Field, Input, Select, Checkbox, Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { formatDateTime, formatNumber } from '../../utils/format';
import { getErrorMessage } from '../../api/client';
import '../../styles/sorteio.css';

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
  // V9.5: o vencedor só é revelado DEPOIS da animação terminar.
  const [phase, setPhase] = useState('idle'); // idle | spinning | done
  const [pendingWinner, setPendingWinner] = useState(null);
  const [winner, setWinner] = useState(null);
  const [drawing, setDrawing] = useState(false);

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const raffles = useApi(() => raffleApi.list({ eventId }).then((r) => r.data.raffles), [eventId]);
  const detail = useApi(() => (selectedId ? raffleApi.get(selectedId).then((r) => r.data.raffle) : Promise.resolve(null)), [selectedId]);
  const elig = useApi(() => (selectedId ? raffleApi.eligible(selectedId).then((r) => r.data) : Promise.resolve(null)), [selectedId]);

  const resetDraw = () => {
    setWinner(null);
    setPendingWinner(null);
    setPhase('idle');
    setTargetIndex(null);
  };

  const selectRaffle = (id) => {
    setSelectedId(id);
    resetDraw();
  };

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
    if (!selectedId || drawing || phase === 'spinning') return;
    setDrawing(true);
    resetDraw();
    try {
      const res = await raffleApi.draw(selectedId);
      const list = elig.data?.eligible || [];
      const idx = list.findIndex((x) => x.userId === res.data.winner.userId);
      setTargetIndex(idx >= 0 ? idx : 0);
      setPendingWinner(res.data.winner);
      setPhase('spinning');
      setSpinKey((k) => k + 1);
      detail.reload();
      elig.reload();
      raffles.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setDrawing(false);
    }
  };

  // Chamado pela roleta quando a animação termina (ou pelo fallback interno).
  const revealWinner = () => {
    setWinner((current) => current || pendingWinner);
    setPhase((p) => (p === 'spinning' ? 'done' : p));
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
  const raffle = detail.data;
  const winnerCount = raffle?.winners?.length || 0;
  const eligibleCount = elig.data?.eligibleCount || 0;
  const busy = drawing || phase === 'spinning';

  return (
    <div className="raffle">
      <div className="page-head">
        <div>
          <h1>Sorteios</h1>
          <p>Realize sorteios apenas entre participantes presentes no evento.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} icon={<Plus size={17} />} disabled={!eventId}>
          Novo sorteio
        </Button>
      </div>

      {/* 1. Cabeçalho do sorteio */}
      <header className="raffle-hero">
        <span className="raffle-hero__eyebrow"><Sparkles size={14} /> Sorteio oficial · Mustangs Atlética</span>
        <h2 className="raffle-hero__title">{raffle ? raffle.prize : 'Mesa de sorteio'}</h2>
        <p className="raffle-hero__event">
          <CalendarDays size={15} />
          {raffle?.event?.name || 'Selecione um evento e um sorteio para começar'}
        </p>
        <div className="raffle-hero__badges">
          {raffle && <span className="raffle-chip raffle-chip--gold"><Trophy size={14} /> {RAFFLE_LABELS[raffle.status] || raffle.status}</span>}
          {raffle && <span className="raffle-chip"><UserCheck size={14} /> {formatNumber(eligibleCount)} elegíveis</span>}
          {raffle && <span className="raffle-chip"><Medal size={14} /> {formatNumber(winnerCount)} vencedor(es)</span>}
          {raffle && !raffle.allowRepeat && <span className="raffle-chip">Sem repetição</span>}
        </div>
      </header>

      <div className="filters" style={{ maxWidth: 460 }}>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => { setEventId(e.target.value); setSelectedId(null); resetDraw(); }}>
            <option value="">Selecione um evento</option>
            {(events.data || []).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </Select>
        </Field>
      </div>

      {!eventId && <p className="text-muted">Selecione um evento para ver/criar sorteios.</p>}
      {raffles.loading && eventId && <Spinner text="Carregando sorteios..." />}
      {raffles.error && <ErrorState onRetry={raffles.reload} />}

      {eventId && !raffles.loading && (raffles.data || []).length === 0 && (
        <EmptyState icon={<Trophy size={28} />} title="Nenhum sorteio neste evento." description="Crie o primeiro sorteio." />
      )}

      {eventId && !raffles.loading && (raffles.data || []).length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
          {(raffles.data || []).map((r) => (
            <Card
              className="card-pad"
              key={r.id}
              style={{ cursor: 'pointer', borderColor: selectedId === r.id ? 'var(--brand)' : undefined, boxShadow: selectedId === r.id ? 'var(--shadow)' : undefined }}
              onClick={() => selectRaffle(r.id)}
            >
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

      {selectedId && raffle && (
        <>
          <div className="raffle-stats">
            <div className="raffle-stat">
              <div className="raffle-stat__label">Elegíveis (presentes)</div>
              <div className="raffle-stat__value">{formatNumber(eligibleCount)}</div>
              <div className="raffle-stat__hint">{raffle.allowRepeat ? 'Repetição permitida' : 'Sem repetição de vencedor'}</div>
            </div>
            <div className="raffle-stat">
              <div className="raffle-stat__label">Vencedores</div>
              <div className="raffle-stat__value">{formatNumber(winnerCount)}</div>
              <div className="raffle-stat__hint">Prêmio: {raffle.prize}</div>
            </div>
            <div className="raffle-stat">
              <div className="raffle-stat__label">Status</div>
              <div className="raffle-stat__value" style={{ fontSize: '1.05rem' }}>{RAFFLE_LABELS[raffle.status] || raffle.status}</div>
              <div className="raffle-stat__hint">Criado em {formatDateTime(raffle.createdAt)}</div>
            </div>
            <div className="raffle-actions" style={{ alignSelf: 'center' }}>
              {raffle.status === 'OPEN' && (
                <Button
                  onClick={doDraw}
                  icon={<Wand2 size={17} />}
                  disabled={eligibleCount <= 0 || busy}
                  aria-label="Executar sorteio"
                >
                  {phase === 'spinning' ? 'Sorteando…' : phase === 'done' ? 'Sortear novamente' : 'SORTEAR'}
                </Button>
              )}
              {raffle.status === 'OPEN' && (
                <Button variant="secondary" onClick={() => closeRaffle(raffle.id)} disabled={busy}>Encerrar</Button>
              )}
            </div>
          </div>

          {/* 2/3/4. Palco: roleta + resultado central */}
          <div className="raffle-stage">
            {eligibleNames.length > 0 ? (
              <Roulette names={eligibleNames} targetIndex={targetIndex} spinKey={spinKey} onEnd={revealWinner} />
            ) : (
              <div className="raffle-empty">Nenhum participante elegível (é necessário ter presença registrada).</div>
            )}

            <div
              className={`raffle-result ${phase === 'spinning' ? 'is-spinning' : ''} ${phase === 'done' && winner ? 'is-done' : ''}`}
              role="status"
              aria-live="polite"
            >
              {phase === 'spinning' && (
                <>
                  <span className="raffle-result__label">Sorteando</span>
                  <span className="raffle-pulse"><span className="raffle-pulse__dot" /> selecionando vencedor…</span>
                  <p className="raffle-result__sub">O resultado aparece ao fim da roleta.</p>
                </>
              )}

              {phase === 'done' && winner && (
                <div className="raffle-fade">
                  <span className="raffle-result__label">🎉 Resultado</span>
                  <div className="raffle-result__value">{winner.name}</div>
                  <p className="raffle-result__sub">Vencedor(a) do sorteio</p>
                  <div className="raffle-result__meta">
                    <span className="raffle-chip raffle-chip--gold"><Trophy size={14} /> {winner.prize || raffle.prize}</span>
                    <span className="raffle-chip">{raffle.event?.name}</span>
                    <span className="raffle-chip">{formatNumber(eligibleCount)} elegíveis</span>
                    {winner.drawnAt && <span className="raffle-chip">{formatDateTime(winner.drawnAt)}</span>}
                  </div>
                </div>
              )}

              {phase === 'idle' && (
                <>
                  <span className="raffle-result__label">Pronto para sortear</span>
                  <div className="raffle-result__value" style={{ fontSize: 'clamp(1.6rem,5vw,2.6rem)' }}>{raffle.prize}</div>
                  <p className="raffle-result__sub">
                    {eligibleCount > 0
                      ? `${formatNumber(eligibleCount)} participantes elegíveis. Clique em SORTEAR.`
                      : 'Nenhum participante elegível.'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* 5. Histórico */}
          <Card className="card-pad raffle-history">
            <h4 className="raffle-history__title"><Trophy size={17} className="raffle-medal" /> Histórico de vencedores</h4>
            {winnerCount === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>Ainda não há vencedores.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Vencedor</th><th>Prêmio</th><th>Elegíveis</th><th>Data</th><th>Responsável</th></tr>
                  </thead>
                  <tbody>
                    {raffle.winners.map((w) => (
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
          </Card>
        </>
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
    </div>
  );
}
