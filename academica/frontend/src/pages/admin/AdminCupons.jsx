import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { couponApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Select, Checkbox, Card, StatusBadge, Spinner, ErrorState } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
import { getErrorMessage } from '../../api/client';
import { formatDate, formatNumber } from '../../utils/format';
import { formatBRL } from '../../components/PixCard';

const empty = { code: '', type: 'PERCENT', value: '', validFrom: '', validUntil: '', maxUses: '', minOrderValue: '', active: true };

export default function AdminCupons() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const { data, loading, error, reload } = useApi(() => couponApi.list().then((r) => r.data.coupons), []);

  const openCreate = () => { setEditing(null); setForm(empty); setModalOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      code: c.code,
      type: c.type,
      value: c.type === 'PERCENT' ? String(c.value) : (c.value / 100).toString(),
      validFrom: c.validFrom ? c.validFrom.slice(0, 10) : '',
      validUntil: c.validUntil ? c.validUntil.slice(0, 10) : '',
      maxUses: c.maxUses ?? '',
      minOrderValue: c.minOrderValueCents != null ? (c.minOrderValueCents / 100).toString() : '',
      active: c.active,
    });
    setModalOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      code: form.code,
      type: form.type,
      value: form.type === 'PERCENT' ? Math.round(Number(form.value)) : Math.round(Number(form.value) * 100),
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
      maxUses: form.maxUses === '' ? null : Number(form.maxUses),
      minOrderValueCents: form.minOrderValue === '' ? null : Math.round(Number(form.minOrderValue) * 100),
      active: form.active,
    };
    try {
      if (editing) await couponApi.update(editing.id, payload);
      else await couponApi.create(payload);
      toast.success(editing ? 'Cupom atualizado.' : 'Cupom criado.');
      setModalOpen(false);
      reload();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await couponApi.remove(toDelete); toast.success('Cupom removido.'); reload(); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setToDelete(null); }
  };

  const coupons = data || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cupons</h1>
          <p>Cupons de desconto para a loja.</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={17} />}>Novo cupom</Button>
      </div>

      {loading && <Spinner text="Carregando cupons..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && coupons.length === 0 && <p className="text-muted">Nenhum cupom cadastrado.</p>}
      {!loading && !error && coupons.length > 0 && (
        <div className="list">
          {coupons.map((c) => (
            <Card className="card-pad flex-between flex-wrap" key={c.id}>
              <div>
                <div className="flex mb-1" style={{ gap: 10 }}>
                  <strong>{c.code}</strong>
                  <StatusBadge status={c.active ? 'ACTIVE' : 'INACTIVE'} label={c.active ? 'Ativo' : 'Inativo'} tone={c.active ? 'success' : 'neutral'} />
                </div>
                <p className="text-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
                  {c.type === 'PERCENT' ? `${c.value}% de desconto` : `${formatBRL(c.value)} de desconto`}
                  {c.minOrderValueCents ? ` · mínimo ${formatBRL(c.minOrderValueCents)}` : ''}
                  {c.maxUses ? ` · ${formatNumber(c.usedCount)}/${formatNumber(c.maxUses)} usos` : ` · ${formatNumber(c.usedCount)} usos`}
                </p>
                <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>
                  {c.validFrom ? `De ${formatDate(c.validFrom)} ` : ''}{c.validUntil ? `até ${formatDate(c.validUntil)}` : (c.validFrom ? '' : 'Sem validade')}
                </p>
              </div>
              <div className="flex">
                <button className="icon-btn" title="Editar" onClick={() => openEdit(c)}><Pencil size={16} /></button>
                <button className="icon-btn" style={{ color: 'var(--danger)' }} title="Remover" onClick={() => setToDelete(c.id)}><Trash2 size={16} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cupom' : 'Novo cupom'}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Código" required><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="PERCENT">Percentual (%)</option>
              <option value="FIXED">Valor fixo (R$)</option>
            </Select>
          </Field>
          <Field label={form.type === 'PERCENT' ? 'Percentual (%)' : 'Valor (R$)'} required>
            <Input type="number" min="0" step={form.type === 'PERCENT' ? '1' : '0.01'} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          </Field>
          <div className="form-grid">
            <Field label="Válido de"><Input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
            <Field label="Válido até"><Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></Field>
          </div>
          <div className="form-grid">
            <Field label="Usos máximos"><Input type="number" min="1" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} /></Field>
            <Field label="Pedido mínimo (R$)"><Input type="number" min="0" step="0.01" value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} /></Field>
          </div>
          <Checkbox label="Ativo" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <Button type="submit" loading={saving}>Salvar</Button>
        </form>
      </Modal>

      <ConfirmDialog open={!!toDelete} title="Remover cupom" message="Cupons já usados são apenas desativados (histórico preservado)." confirmLabel="Remover" danger onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
