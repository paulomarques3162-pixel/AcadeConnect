import { useState } from 'react';
import { Building2, Plus, Trash2, ScrollText } from 'lucide-react';
import { adminApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Spinner, ErrorState, Card, StatusBadge } from '../../components/ui';
import { Modal, ConfirmDialog } from '../../components/Overlay';
import { formatDateTime, formatNumber } from '../../utils/format';

export default function AdminConfiguracoes() {
  const toast = useToast();
  const [tab, setTab] = useState('instituicoes');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', cnpj: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const inst = useApi(() => adminApi.institutions().then((r) => r.data.institutions), []);
  const logs = useApi(() => adminApi.logs({ limit: 20 }).then((r) => r.data.logs), []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.createInstitution(form);
      toast.success('Instituição criada.');
      setModalOpen(false);
      inst.reload();
    } catch (err) { toast.error(err?.response?.data?.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <p>Instituições e logs de auditoria.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'instituicoes' ? 'is-active' : ''}`} onClick={() => setTab('instituicoes')}>Instituições</button>
        <button className={`tab ${tab === 'logs' ? 'is-active' : ''}`} onClick={() => setTab('logs')}>Logs de auditoria</button>
      </div>

      {tab === 'instituicoes' && (
        <>
          <div className="flex-between mb-3">
            <p className="text-muted">Instituições vinculadas à plataforma.</p>
            <Button onClick={() => setModalOpen(true)} icon={<Plus size={17} />}>Nova instituição</Button>
          </div>
          {inst.loading && <Spinner text="Carregando..." />}
          {inst.error && <ErrorState onRetry={inst.reload} />}
          {!inst.loading && !inst.error && (
            <div className="list">
              {(inst.data || []).map((i) => (
                <Card className="card-pad flex-between flex-wrap" key={i.id}>
                  <div className="flex">
                    <div className="empty-state__icon" style={{ margin: 0, width: 48, height: 48 }}><Building2 size={22} /></div>
                    <div>
                      <strong>{i.name}</strong>
                      <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>{i.cnpj || 'Sem CNPJ'} · {formatNumber(i._count?.events)} eventos · {formatNumber(i._count?.users)} usuários</p>
                    </div>
                  </div>
                  <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => setToDelete(i.id)} aria-label="Excluir"><Trash2 size={17} /></button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'logs' && (
        <>
          <div className="flex mb-3"><ScrollText size={18} /><strong>Últimas ações administrativas</strong></div>
          {logs.loading && <Spinner text="Carregando logs..." />}
          {logs.error && <ErrorState onRetry={logs.reload} />}
          {!logs.loading && !logs.error && (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Usuário</th><th>Ação</th><th>Recurso</th><th>Data</th></tr></thead>
                <tbody>
                  {(logs.data || []).map((l) => (
                    <tr key={l.id}>
                      <td>{l.user?.name || 'Sistema'}</td>
                      <td><StatusBadge status="INFO" label={l.action.replace(/_/g, ' ')} /></td>
                      <td>{l.resource || '—'}</td>
                      <td>{formatDateTime(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova instituição">
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></Field>
          <Field label="Descrição"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Button type="submit" loading={saving}>Salvar</Button>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir instituição"
        message="Esta instituição será removida."
        confirmLabel="Excluir"
        danger
        onConfirm={async () => {
          try { await adminApi.deleteInstitution(toDelete); toast.success('Instituição excluída.'); inst.reload(); }
          catch (e) { toast.error(e?.response?.data?.message); }
          finally { setToDelete(null); }
        }}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
