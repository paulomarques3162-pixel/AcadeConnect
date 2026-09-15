import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { productApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Textarea, Select, Card, StatusBadge, Spinner, ErrorState, SmartImage } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
import { getErrorMessage } from '../../api/client';
import { formatNumber } from '../../utils/format';
import { formatBRL } from '../../components/PixCard';

const empty = { name: '', description: '', price: '', stock: '', status: 'ACTIVE' };

export default function AdminProdutos() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const { data, loading, error, reload } = useApi(() => productApi.adminList().then((r) => r.data.products), []);

  const openCreate = () => { setEditing(null); setForm(empty); setFile(null); setModalOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ name: p.name, description: p.description || '', price: (p.priceCents / 100).toString(), stock: p.stock ?? '', status: p.status }); setFile(null); setModalOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      priceCents: Math.round(Number(form.price) * 100),
      stock: form.stock === '' ? null : Number(form.stock),
      status: form.status,
    };
    try {
      if (editing) await productApi.updateWithFile(editing.id, payload, file);
      else await productApi.createWithFile(payload, file);
      toast.success(editing ? 'Produto atualizado.' : 'Produto criado.');
      setModalOpen(false);
      reload();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await productApi.remove(toDelete); toast.success('Produto removido.'); reload(); }
    catch (e) { toast.error(getErrorMessage(e)); }
    finally { setToDelete(null); }
  };

  const products = data || [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Produtos</h1>
          <p>Gerencie os produtos da loja da atlética.</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={17} />}>Novo produto</Button>
      </div>

      {loading && <Spinner text="Carregando produtos..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && products.length === 0 && <p className="text-muted">Nenhum produto cadastrado.</p>}
      {!loading && !error && products.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))' }}>
          {products.map((p) => (
            <Card className="card-pad" key={p.id}>
              <SmartImage src={p.imageUrl} alt={p.name} className="event-card__banner-img" fallbackLetter={p.name.charAt(0)} />
              <div className="flex-between mt-2">
                <strong>{p.name}</strong>
                <StatusBadge status={p.status} />
              </div>
              <p className="text-muted" style={{ margin: '6px 0', fontSize: '0.88rem' }}>{p.description || 'Sem descrição'}</p>
              <p style={{ margin: 0 }}><strong>{formatBRL(p.priceCents)}</strong> · {p.stock === null || p.stock === undefined ? 'Estoque ilimitado' : `${formatNumber(p.stock)} em estoque`}</p>
              <div className="flex mt-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(p)} icon={<Pencil size={15} />}>Editar</Button>
                <Button size="sm" variant="ghost" onClick={() => setToDelete(p.id)} icon={<Trash2 size={15} />}>Remover</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar produto' : 'Novo produto'}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Descrição"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Preço (R$)" required><Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
          <Field label="Estoque (vazio = ilimitado)"><Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <Field label="Status">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </Select>
          </Field>
          <Field label="Foto"><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></Field>
          <Button type="submit" loading={saving}>Salvar</Button>
        </form>
      </Modal>

      <ConfirmDialog open={!!toDelete} title="Remover produto" message="O produto sairá da loja. O histórico de pedidos é preservado." confirmLabel="Remover" danger onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
