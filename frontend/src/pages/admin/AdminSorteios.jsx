import { useState } from 'react';
import { Plus, Trophy, Users, Wand2, Sparkles, CalendarDays, UserCheck, Medal, Pencil, Trash2, SlidersHorizontal } from 'lucide-react';
import { raffleApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Roulette } from '../../components/Roulette';
import { Button, Field, Input, Select, Checkbox, Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
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
  // Editor administrativo (V9.6): editar, remover e configurar pesos.
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ prize: '', allowRepeat: false });
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightsForm, setWeightsForm] = useState({});
  const [savingWeights, setSavingWeights] = useState(false);
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

  const openEdit = () => {
    if (!detail.data) return;
    setEditForm({ prize: detail.data.prize, allowRepeat: !!detail.data.allowRepeat });
    setEditOpen(true);
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await raffleApi.update(selectedId, { prize: editForm.prize, allowRepeat: editForm.allowRepeat });
      toast.success('Sorteio atualizado.');
      setEditOpen(false);
      detail.reload();
      raffles.reload();
      elig.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const openWeights = () => {
    const list = elig.data?.eligible || [];
    const initial = {};
    for (const p of list) initial[p.userId] = String(p.weight || 1);
    setWeightsForm(initial);
    setWeightsOpen(true);
  };

  const saveWeights = async (e) => {
    e.preventDefault();
    setSavingWeights(true);
    try {
      const payload = {};
      for (const [userId, value] of Object.entries(weightsForm)) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 1000) {
          throw new Error('Use um peso inteiro entre 1 e 1000.');
        }
        payload[userId] = n;
      }
      await raffleApi.setWeights(selectedId, payload);
      toast.success('Pesos atualizados.');
      setWeightsOpen(false);
      elig.reload();
    } catch (err) {
      toast.error(getErrorMessage(err) || err.message);
    } finally {
      setSavingWeights(false);
    }
  };

  const removeRaffle = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    try {
      await raffleApi.remove(confirmRemove.id);
      toast.success('Sorteio removido. O histórico foi preservado.');
      setConfirmRemove(null);
      if (selectedId === confirmRemove.id) {
        setSelectedId(null);
        resetDraw();
      }
      raffles.reload();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setRemoving(false);
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
              <Button variant="secondary" onClick={openEdit} icon={<Pencil size={16} />} disabled={busy}>Editar</Button>
              <Button variant="secondary" onClick={openWeights} icon={<SlidersHorizontal size={16} />} disabled={busy}>Probabilidades</Button>
              <Button variant="danger" onClick={() => setConfirmRemove(raffle)} icon={<Trash2 size={16} />} disabled={busy}>Remover</Button>
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

      {/* Editor administrativo: editar dados suportados pelo sistema. */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar sorteio">
        <form onSubmit={submitEdit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Prêmio" required>
            <Input value={editForm.prize} onChange={(e) => setEditForm({ ...editForm, prize: e.target.value })} required minLength={2} />
          </Field>
          <Checkbox label="Permitir que o mesmo participante ganhe mais de uma vez neste sorteio" checked={editForm.allowRepeat} onChange={(e) => setEditForm({ ...editForm, allowRepeat: e.target.checked })} />
          <Button type="submit" loading={savingEdit}>Salvar alterações</Button>
        </form>
      </Modal>

      {/* Configuração administrativa de pesos/probabilidades (nunca visível em
          páginas públicas; a rota é protegida no backend). */}
      <Modal open={weightsOpen} onClose={() => setWeightsOpen(false)} title="Probabilidades do sorteio" size="md">
        <form onSubmit={saveWeights} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Defina o peso de cada participante elegível. O peso padrão é <strong>1</strong>; um peso <strong>5</strong> torna o
            participante cinco vezes mais provável. Valores entre 1 e 1000. Esta configuração é exclusiva da organização.
          </p>
          {(elig.data?.eligible || []).length === 0 && <p className="text-muted">Nenhum participante elegível.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
            {(elig.data?.eligible || []).map((p) => (
              <div className="flex-between" key={p.userId} style={{ gap: 12 }}>
                <span>{p.name}</span>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  style={{ maxWidth: 110 }}
                  value={weightsForm[p.userId] ?? '1'}
                  onChange={(e) => setWeightsForm((prev) => ({ ...prev, [p.userId]: e.target.value }))}
                  aria-label={`Peso de ${p.name}`}
                />
              </div>
            ))}
          </div>
          <Button type="submit" loading={savingWeights} disabled={(elig.data?.eligible || []).length === 0}>Salvar probabilidades</Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remover sorteio"
        message={confirmRemove
          ? `O sorteio "${confirmRemove.prize}" será removido. O histórico de vencedores e a auditoria são preservados; o sorteio deixa de aparecer na listagem e nos resultados públicos.`
          : ''}
        confirmLabel="Remover"
        danger
        loading={removing}
        onConfirm={removeRaffle}
        onClose={() => setConfirmRemove(null)}
      />
    </div>
  );
}
