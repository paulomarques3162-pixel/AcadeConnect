import { useEffect, useState } from 'react';
import { Send, Plus, MessagesSquare } from 'lucide-react';
import { conversationApi } from '../api/services';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Button, Field, Input, Textarea, Select, Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../components/ui';
import { Modal } from '../components/Overlay';
import { getErrorMessage } from '../api/client';
import { formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export default function Comunicacao() {
  const toast = useToast();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', assignedToId: '' });

  const list = useApi(() => conversationApi.mine().then((r) => r.data.conversations), []);
  const admins = useApi(() => conversationApi.admins().then((r) => r.data.admins), []);
  const detail = useApi(() => (selectedId ? conversationApi.get(selectedId).then((r) => r.data.conversation) : Promise.resolve(null)), [selectedId]);

  useEffect(() => {
    if (selectedId) conversationApi.markRead(selectedId).catch(() => {});
  }, [selectedId]);

  const start = async (e) => {
    e.preventDefault();
    try {
      const res = await conversationApi.start(form);
      toast.success('Conversa iniciada.');
      setModalOpen(false);
      setForm({ subject: '', message: '', assignedToId: '' });
      list.reload();
      setSelectedId(res.data.conversation.id);
    } catch (err) { toast.error(getErrorMessage(err)); }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await conversationApi.send(selectedId, reply.trim());
      setReply('');
      detail.reload();
      list.reload();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSending(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comunicação</h1>
          <p>Fale com a organização da atlética.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} icon={<Plus size={17} />}>Nova conversa</Button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px,320px) 1fr' }}>
        <div className="list">
          {list.loading && <Spinner text="Carregando..." />}
          {list.error && <ErrorState onRetry={list.reload} />}
          {!list.loading && (list.data || []).length === 0 && <EmptyState icon={<MessagesSquare size={26} />} title="Nenhuma conversa." />}
          {(list.data || []).map((c) => (
            <Card className="card-pad" key={c.id} style={{ cursor: 'pointer', borderColor: selectedId === c.id ? 'var(--brand)' : undefined }} onClick={() => setSelectedId(c.id)}>
              <div className="flex-between mb-1">
                <strong>{c.subject || 'Conversa'}</strong>
                <StatusBadge status={c.status} label={c.status === 'OPEN' ? 'Aberta' : 'Resolvida'} tone={c.status === 'OPEN' ? 'success' : 'neutral'} />
              </div>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.78rem' }}>{formatDateTime(c.lastMessageAt)}</p>
            </Card>
          ))}
        </div>

        <div>
          {!selectedId && <p className="text-muted">Selecione uma conversa ou inicie uma nova.</p>}
          {selectedId && detail.data && (
            <Card className="card-pad">
              <div className="flex-between mb-2">
                <strong>{detail.data.subject || 'Conversa'}</strong>
                <StatusBadge status={detail.data.status} label={detail.data.status === 'OPEN' ? 'Aberta' : 'Resolvida'} tone={detail.data.status === 'OPEN' ? 'success' : 'neutral'} />
              </div>
              <div className="chat-thread mb-2">
                {(detail.data.messages || []).map((m) => (
                  <div key={m.id} className={`chat-bubble ${m.senderId === user?.id ? 'chat-bubble--mine' : ''}`}>
                    <div>{m.body}</div>
                    <div className="chat-bubble__meta">{m.sender?.name} · {formatDateTime(m.createdAt)}</div>
                  </div>
                ))}
              </div>
              {detail.data.status === 'OPEN' ? (
                <form onSubmit={send} className="flex">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Escreva uma mensagem..." />
                  <Button type="submit" loading={sending} icon={<Send size={16} />}>Enviar</Button>
                </form>
              ) : (
                <p className="text-muted">Conversa resolvida pela organização.</p>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova conversa">
        <form onSubmit={start} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Assunto"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Ex.: Dúvida sobre inscrição" /></Field>
          <Field label="Falar com">
            <Select value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
              <option value="">Qualquer administrador</option>
              {(admins.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Mensagem" required><Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required /></Field>
          <Button type="submit">Enviar</Button>
        </form>
      </Modal>
    </>
  );
}
