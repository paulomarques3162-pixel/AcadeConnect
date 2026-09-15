import { useEffect, useState } from 'react';
import { Send, CheckCircle2, RotateCcw, Mail, Search, User } from 'lucide-react';
import { conversationApi, adminApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useLiveConversation } from '../../hooks/useLiveConversation';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Textarea, Card, StatusBadge, Spinner, ErrorState, EmptyState } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { getErrorMessage } from '../../api/client';
import { formatDateTime } from '../../utils/format';
import { useAuth } from '../../context/AuthContext';

export default function AdminComunicacao() {
  const toast = useToast();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  // Nova mensagem direcionada
  const [newOpen, setNewOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [target, setTarget] = useState(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [starting, setStarting] = useState(false);

  const list = useApi(() => conversationApi.adminList().then((r) => r.data.conversations), []);
  const { conversation: detail, threadRef, onScroll, markRead, reload: reloadDetail } = useLiveConversation(selectedId);

  useEffect(() => { if (selectedId) markRead(); /* eslint-disable-next-line */ }, [selectedId]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await conversationApi.send(selectedId, reply.trim());
      setReply('');
      reloadDetail();
      list.reload();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSending(false); }
  };

  const setStatus = async (status) => {
    try { await conversationApi.setStatus(selectedId, status); toast.success(status === 'RESOLVED' ? 'Conversa resolvida.' : 'Conversa reaberta.'); reloadDetail(); list.reload(); }
    catch (e) { toast.error(getErrorMessage(e)); }
  };

  const searchUsers = async (e) => {
    e?.preventDefault();
    setSearching(true);
    try {
      const res = await adminApi.users({ search, limit: 10 });
      setResults(res.data?.users || []);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSearching(false); }
  };

  const openNew = () => {
    setTarget(null); setSearch(''); setResults([]); setSubject(''); setMessage('');
    setNewOpen(true);
  };

  const startNew = async (e) => {
    e.preventDefault();
    if (!target) return toast.error('Selecione o destinatário.');
    if (!message.trim()) return toast.error('Escreva a mensagem.');
    setStarting(true);
    try {
      const res = await conversationApi.adminStart({ userId: target.id, subject: subject || null, message: message.trim() });
      toast.success('Mensagem enviada.');
      setNewOpen(false);
      list.reload();
      setSelectedId(res.data.conversation.id);
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setStarting(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Comunicação</h1>
          <p>Converse com os participantes ou envie uma mensagem direcionada.</p>
        </div>
        <Button onClick={openNew} icon={<Mail size={17} />}>Nova mensagem</Button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px,320px) 1fr' }}>
        <div className="list">
          {list.loading && <Spinner text="Carregando..." />}
          {list.error && <ErrorState onRetry={list.reload} />}
          {!list.loading && (list.data || []).length === 0 && <EmptyState title="Nenhuma conversa." />}
          {(list.data || []).map((c) => (
            <Card className="card-pad" key={c.id} style={{ cursor: 'pointer', borderColor: selectedId === c.id ? 'var(--brand)' : undefined }} onClick={() => setSelectedId(c.id)}>
              <div className="flex-between mb-1">
                <strong>{c.user?.name}</strong>
                <StatusBadge status={c.status} label={c.status === 'OPEN' ? 'Aberta' : 'Resolvida'} tone={c.status === 'OPEN' ? 'success' : 'neutral'} />
              </div>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>{c.subject || 'Sem assunto'} · {c._count?.messages || 0} mensagem(ns)</p>
              <p className="text-muted" style={{ margin: '4px 0 0', fontSize: '0.75rem' }}>{formatDateTime(c.lastMessageAt)}</p>
            </Card>
          ))}
        </div>

        <div>
          {!selectedId && <p className="text-muted">Selecione uma conversa ou clique em “Nova mensagem”.</p>}
          {selectedId && detail && (
            <Card className="card-pad">
              <div className="flex-between mb-2">
                <div>
                  <strong>{detail.user?.name}</strong>
                  <p className="text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>{detail.subject || 'Sem assunto'}</p>
                </div>
                {detail.status === 'OPEN' ? (
                  <Button size="sm" variant="secondary" onClick={() => setStatus('RESOLVED')} icon={<CheckCircle2 size={15} />}>Resolver</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setStatus('OPEN')} icon={<RotateCcw size={15} />}>Reabrir</Button>
                )}
              </div>

              <div className="chat-thread mb-2" ref={threadRef} onScroll={onScroll}>
                {(detail.messages || []).map((m) => (
                  <div key={m.id} className={`chat-bubble ${m.senderId === user?.id ? 'chat-bubble--mine' : ''}`}>
                    <div>{m.body}</div>
                    <div className="chat-bubble__meta">{m.sender?.name} · {formatDateTime(m.createdAt)}</div>
                  </div>
                ))}
              </div>

              {detail.status === 'OPEN' ? (
                <form onSubmit={send} className="flex">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Escreva uma resposta..." />
                  <Button type="submit" loading={sending} icon={<Send size={16} />}>Enviar</Button>
                </form>
              ) : (
                <p className="text-muted">Conversa resolvida. Reabra para responder.</p>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nova mensagem para usuário">
        <form onSubmit={startNew} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Destinatário" required>
            {target ? (
              <div className="flex-between card card-pad" style={{ padding: 10 }}>
                <div className="flex" style={{ gap: 8 }}>
                  <User size={18} />
                  <div>
                    <strong>{target.name}</strong>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>{target.email}</p>
                  </div>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setTarget(null)}>Trocar</Button>
              </div>
            ) : (
              <>
                <div className="flex">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail..." />
                  <Button type="button" variant="secondary" loading={searching} onClick={searchUsers} icon={<Search size={16} />}>Buscar</Button>
                </div>
                {results.length > 0 && (
                  <div className="list mt-2">
                    {results.map((u) => (
                      <button type="button" key={u.id} className="attendance-row" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => setTarget(u)}>
                        <span className="attendance-row__name">{u.name}</span>
                        <span className="attendance-row__code">{u.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </Field>
          <Field label="Assunto"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: Informação sobre sua inscrição" /></Field>
          <Field label="Mensagem" required><Textarea value={message} onChange={(e) => setMessage(e.target.value)} required /></Field>
          <Button type="submit" loading={starting} disabled={!target}>Enviar mensagem</Button>
        </form>
      </Modal>
    </>
  );
}
