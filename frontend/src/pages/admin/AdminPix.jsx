import { useState } from 'react';
import { Plus, Pencil, Power, Trash2 } from 'lucide-react';
import { pixApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Select, Checkbox, Card, StatusBadge, Spinner, ErrorState } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
import { getErrorMessage } from '../../api/client';
import { formatDateTime } from '../../utils/format';

const KEY_TYPES = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP', 'RANDOM'];
const empty = { key: '', keyType: 'EVP', receiverName: '', city: '', description: '', active: true };

export default function AdminPix() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const { data, loading, error, reload } = useApi(() => pixApi.list().then((r) => r.data), []);

  const openCreate = () => { setEditing(null); setForm(empty); setModalOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ key: c.key, keyType: c.keyType, receiverName: c.receiverName, city: c.city, description: c.description || '', active: c.active }); setModalOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) { await pixApi.update(editing.id, form); toast.success('Chave PIX atualizada.'); }
      else { await pixApi.create(form); toast.success('Chave PIX cadastrada.'); }
      setModalOpen(false);
      reload();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const toggleActive = async (c) => {
    try { await pixApi.update(c.id, { active: !c.active }); toast.success('Status atualizado.'); reload(); }
    catch (err) { toast.error(getErrorMessage(err)); }
  };

  const remove = async () => {
    try { const r = await pixApi.remove(toDelete); toast.success(r.message || 'Chave removida.'); reload(); }
    catch (err) { toast.error(getErrorMessage(err)); }
    finally { setToDelete(null); }
  };

  const configs = data?.configs || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>PIX</h1>
          <p>Configure a chave de recebimento usada em eventos pagos e pedidos. Apenas uma chave fica ativa.</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={17} />}>Nova chave</Button>
      </div>

      {loading && <Spinner text="Carregando..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && configs.length === 0 && (
        <p className="text-muted">Nenhuma chave PIX cadastrada. Cadastre uma para habilitar pagamentos.</p>
      )}
      {!loading && !error && configs.length > 0 && (
        <div className="list">
          {configs.map((c) => (
            <Card className="card-pad flex-between flex-wrap" key={c.id}>
              <div>
                <div className="flex mb-1" style={{ gap: 10 }}>
                  <strong>{c.receiverName}</strong>
                  <StatusBadge status={c.active ? 'ACTIVE' : 'INACTIVE'} label={c.active ? 'Ativa' : 'Inativa'} tone={c.active ? 'success' : 'neutral'} />
                </div>
                <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {c.keyType} · {c.key} · {c.city}{c.description ? ` · ${c.description}` : ''}
                </p>
                <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.78rem' }}>Atualizada em {formatDateTime(c.updatedAt)}</p>
              </div>
              <div className="flex">
                <button className="icon-btn" title="Editar" onClick={() => openEdit(c)}><Pencil size={16} /></button>
                <button className="icon-btn" title={c.active ? 'Desativar' : 'Ativar'} onClick={() => toggleActive(c)}><Power size={16} /></button>
                <button className="icon-btn" style={{ color: 'var(--danger)' }} title="Remover" onClick={() => setToDelete(c.id)}><Trash2 size={16} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar chave PIX' : 'Nova chave PIX'}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Tipo da chave" required>
            <Select value={form.keyType} onChange={(e) => setForm({ ...form, keyType: e.target.value })}>
              {KEY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Chave PIX" required><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required /></Field>
          <Field label="Nome do recebedor" required><Input value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} required /></Field>
          <Field label="Cidade" required><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></Field>
          <Field label="Descrição"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Checkbox label="Chave ativa" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          <Button type="submit" loading={saving}>Salvar</Button>
        </form>
      </Modal>

      <ConfirmDialog open={!!toDelete} title="Remover chave PIX" message="Se houver pagamentos vinculados, a chave será apenas desativada (o histórico é preservado)." confirmLabel="Remover" danger onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
