import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { adminApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Button, Field, Input, Select, StatusBadge, Spinner, ErrorState, Card } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
import { formatDateTime } from '../../utils/format';

export default function AdminUsuarios() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'PARTICIPANT', course: '' });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const { data, loading, error, reload } = useApi(
    () => adminApi.users({ search, role, page, limit: 15 }).then((r) => r),
    [search, role, page]
  );

  const openCreate = () => { setEditing(null); setForm({ name: '', email: '', password: '', role: 'PARTICIPANT', course: '' }); setModalOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ name: u.name, email: u.email, role: u.role, course: u.course || '', password: '' }); setModalOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, email: form.email, role: form.role, course: form.course };
        if (form.password) payload.password = form.password;
        await adminApi.updateUser(editing.id, payload);
        toast.success('Usuário atualizado.');
      } else {
        await adminApi.createUser(form);
        toast.success('Usuário criado.');
      }
      setModalOpen(false);
      reload();
    } catch (err) { toast.error(err?.response?.data?.message || 'Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await adminApi.deleteUser(toDelete); toast.success('Usuário desativado.'); reload(); }
    catch (e) { toast.error(e?.response?.data?.message); }
    finally { setToDelete(null); }
  };

  const columns = [
    { header: 'Nome', key: 'name', render: (r) => <strong>{r.name}</strong> },
    { header: 'E-mail', key: 'email' },
    { header: 'Curso', key: 'course', render: (r) => r.course || '—' },
    { header: 'Papel', key: 'role', render: (r) => <StatusBadge status={r.role} label={r.role} /> },
    { header: 'Cadastro', key: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
    {
      header: 'Ações', key: 'actions', render: (r) => (
        <div className="flex">
          <button className="icon-btn" onClick={() => openEdit(r)} title="Editar" aria-label="Editar"><Pencil size={16} /></button>
          <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => setToDelete(r.id)} title="Excluir" aria-label="Excluir"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Usuários</h1>
          <p>Gerencie contas e permissões.</p>
        </div>
        <Button onClick={openCreate} icon={<Plus size={18} />}>Novo usuário</Button>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar usuários..." /></div>
        <Field label="Papel">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Todos</option>
            {['PARTICIPANT','ORGANIZER','ADMIN'].map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando usuários..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.users || []} loading={loading} emptyTitle="Nenhum usuário." />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar usuário' : 'Novo usuário'}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="E-mail" required><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label="Curso"><Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} /></Field>
          <Field label="Papel" required>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {['PARTICIPANT','ORGANIZER','ADMIN'].map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label={editing ? 'Nova senha (opcional)' : 'Senha'} hint="Mínimo de 8 caracteres.">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing} />
          </Field>
          <Button type="submit" loading={saving}>Salvar</Button>
        </form>
      </Modal>

      <ConfirmDialog open={!!toDelete} title="Desativar usuário" message="O usuário perderá o acesso à plataforma." confirmLabel="Desativar" danger onConfirm={remove} onClose={() => setToDelete(null)} />
    </>
  );
}
