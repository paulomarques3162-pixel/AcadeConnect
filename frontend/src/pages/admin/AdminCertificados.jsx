import { useState } from 'react';
import { Download, Wand2, Award, Pencil } from 'lucide-react';
import { certificateApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { DataTable, SearchBar, Pagination } from '../../components/DataTable';
import { Select, Field, Input, Textarea, StatusBadge, Spinner, ErrorState, Button } from '../../components/ui';
import { Modal } from '../../components/Overlay';
import { formatDate, formatNumber } from '../../utils/format';
import { getErrorMessage } from '../../api/client';

export default function AdminCertificados() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [eventId, setEventId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [autoEvent, setAutoEvent] = useState('');
  const [autoBusy, setAutoBusy] = useState(false);
  const [correcting, setCorrecting] = useState(null);
  const [form, setForm] = useState({ participantName: '', eventName: '', hours: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);

  const { data, loading, error, reload } = useApi(
    () => certificateApi.adminList({ search, eventId, status, page, limit: 15 }).then((r) => r),
    [search, eventId, status, page]
  );

  const runAuto = async () => {
    if (!autoEvent) return toast.error('Selecione o evento.');
    setAutoBusy(true);
    try {
      const res = await certificateApi.auto(autoEvent);
      toast.success(`Geração automática concluída (${res.data.issued} certificados).`);
      reload();
    } catch (e) { toast.error(getErrorMessage(e)); }
    finally { setAutoBusy(false); }
  };

  const download = async (id, code) => {
    const res = await fetch(certificateApi.downloadUrl(id), { headers: { Authorization: `Bearer ${localStorage.getItem('acadeconnect_token')}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${code}.pdf`; a.click();
  };

  const openCorrect = (r) => {
    setCorrecting(r);
    setForm({
      participantName: r.participantName || r.user?.name || '',
      eventName: r.eventName || r.event?.name || '',
      hours: r.hours ?? '',
      reason: '',
    });
  };

  const submitCorrect = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await certificateApi.correct(correcting.id, {
        participantName: form.participantName || null,
        eventName: form.eventName || null,
        hours: form.hours === '' ? null : Number(form.hours),
        reason: form.reason || null,
      });
      toast.success('Certificado corrigido. A versão anterior foi cancelada.');
      setCorrecting(null);
      reload();
    } catch (err) { toast.error(getErrorMessage(err)); }
    finally { setSaving(false); }
  };

  const columns = [
    { header: 'Código', key: 'code', render: (r) => <strong>{r.code}</strong> },
    { header: 'Participante', key: 'participant', render: (r) => r.participantName || r.user?.name },
    { header: 'Evento', key: 'event', render: (r) => r.eventName || r.event?.name },
    { header: 'Atividade', key: 'activity', render: (r) => r.activity?.name || 'Evento' },
    { header: 'Horas', key: 'hours', render: (r) => formatNumber(r.hours) },
    { header: 'Status', key: 'status', render: (r) => <StatusBadge status={r.status} /> },
    { header: 'Emissão', key: 'issueDate', render: (r) => formatDate(r.issueDate) },
    {
      header: 'Ações', key: 'actions', render: (r) => (
        <div className="flex">
          <Button size="sm" variant="secondary" onClick={() => download(r.id, r.code)} icon={<Download size={15} />}>PDF</Button>
          {r.status !== 'CANCELLED' && (
            <Button size="sm" variant="ghost" onClick={() => openCorrect(r)} icon={<Pencil size={15} />} title="Corrigir dados (erro de digitação)">Corrigir</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Certificados</h1>
          <p>Gerencie, emita e corrija certificados (correção cancela a versão anterior e emite uma nova).</p>
        </div>
        <div className="flex">
          <Select value={autoEvent} onChange={(e) => setAutoEvent(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">Evento p/ geração automática</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Button variant="primary" loading={autoBusy} onClick={runAuto} icon={<Wand2 size={17} />}>Gerar automáticos</Button>
        </div>
      </div>

      <div className="filters mb-3">
        <div className="field field--search"><SearchBar value={search} onChange={setSearch} placeholder="Pesquisar participante..." /></div>
        <Field label="Evento">
          <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos</option>
            {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {['PENDING', 'AVAILABLE', 'ISSUED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {loading && <Spinner text="Carregando certificados..." />}
      {error && <ErrorState onRetry={reload} />}
      {!loading && !error && <DataTable columns={columns} rows={data?.data?.certificates || []} loading={loading} emptyTitle={<><Award size={28} /> Nenhum certificado.</>} />}
      <Pagination page={data?.meta?.page} pages={data?.meta?.pages} total={data?.meta?.total} onPage={setPage} />

      <Modal open={!!correcting} onClose={() => setCorrecting(null)} title={`Corrigir certificado ${correcting?.code || ''}`}>
        <form onSubmit={submitCorrect} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            A versão atual será marcada como <strong>CANCELADA</strong> (histórico preservado) e uma nova versão corrigida será emitida. O usuário será notificado.
          </p>
          <Field label="Nome do participante" hint="Corrija erros de digitação no nome.">
            <Input value={form.participantName} onChange={(e) => setForm({ ...form, participantName: e.target.value })} />
          </Field>
          <Field label="Nome do evento">
            <Input value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} />
          </Field>
          <Field label="Carga horária (h)">
            <Input type="number" min="0" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          </Field>
          <Field label="Motivo da correção" required>
            <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex.: erro de digitação no nome do participante" required />
          </Field>
          <Button type="submit" loading={saving}>Corrigir e emitir nova versão</Button>
        </form>
      </Modal>
    </>
  );
}
