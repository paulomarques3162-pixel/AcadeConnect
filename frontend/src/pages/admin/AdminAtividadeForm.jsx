import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activityApi, eventApi, speakerApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Textarea, Select, Checkbox, Spinner, ErrorState, Card } from '../../components/ui';
import { getErrorMessage } from '../../api/client';

const empty = {
  eventId: '', name: '', type: 'PALESTRA', date: '', startTime: '08:00', endTime: '09:00',
  location: '', capacity: '', speakerId: '', status: 'SCHEDULED',
  allowsRegistration: true, requiresAttendance: true, generatesCertificate: true, description: '',
};

function toForm(a) {
  return { ...empty, ...a, date: a.date ? a.date.slice(0, 10) : '', capacity: a.capacity ?? '', eventId: a.eventId || '' };
}

const TYPES = ['PALESTRA','MINICURSO','WORKSHOP','MESA_REDONDA','CURSO','OFICINA','NETWORKING','PRATICA','OUTRO'];

export default function AdminAtividadeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const speakers = useApi(() => speakerApi.list({}).then((r) => r.data.speakers), []);
  const { data, loading, error } = useApi(
    () => (isEdit ? activityApi.get(id).then((r) => r.data.activity) : Promise.resolve(null)),
    [id],
    { immediate: isEdit }
  );

  useEffect(() => { if (data) setForm(toForm(data)); }, [data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.eventId) return toast.error('Selecione o evento.');
    setSaving(true);
    // Normalize optional empty fields so the backend receives null, not ''.
    const payload = {
      ...form,
      speakerId: form.speakerId || null,
      capacity: form.capacity === '' || form.capacity === null ? null : Number(form.capacity),
    };
    try {
      if (isEdit) await activityApi.update(id, payload);
      else await activityApi.create(payload);
      toast.success(isEdit ? 'Atividade atualizada.' : 'Atividade criada.');
      navigate('/admin/atividades');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner text="Carregando..." />;
  if (error) return <ErrorState />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isEdit ? 'Editar atividade' : 'Criar atividade'}</h1>
          <p>Configure a atividade dentro de um evento.</p>
        </div>
        <Link className="btn btn--secondary" to="/admin/atividades">Voltar</Link>
      </div>

      <form onSubmit={submit}>
        <Card className="card-pad mb-3">
          <h3 style={{ marginBottom: 16 }}>Informações</h3>
          <div className="form-grid">
            <Field label="Evento" required>
              <Select value={form.eventId} onChange={set('eventId')} required disabled={isEdit}>
                <option value="">Selecione...</option>
                {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label="Tipo" required>
              <Select value={form.type} onChange={set('type')}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Nome da atividade" required>
              <Input value={form.name} onChange={set('name')} required placeholder="Ex.: Minicurso de Emergência" />
            </Field>
            <Field label="Palestrante">
              <Select value={form.speakerId} onChange={set('speakerId')}>
                <option value="">Sem palestrante</option>
                {(speakers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name} {s.specialty ? `· ${s.specialty}` : ''}</option>)}
              </Select>
            </Field>
            <Field label="Data" required><Input type="date" value={form.date} onChange={set('date')} required /></Field>
            <Field label="Local"><Input value={form.location} onChange={set('location')} /></Field>
            <Field label="Hora inicial" required><Input type="time" value={form.startTime} onChange={set('startTime')} required /></Field>
            <Field label="Hora final" required><Input type="time" value={form.endTime} onChange={set('endTime')} required /></Field>
            <Field label="Capacidade"><Input type="number" min="0" value={form.capacity} onChange={set('capacity')} /></Field>
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                {['SCHEDULED','OPEN','FULL','ONGOING','FINISHED','CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Descrição">
              <Textarea value={form.description} onChange={set('description')} />
            </Field>
          </div>
          <div className="flex flex-wrap mt-2" style={{ gap: 20 }}>
            <Checkbox label="Permite inscrição" checked={form.allowsRegistration} onChange={set('allowsRegistration')} />
            <Checkbox label="Exige presença" checked={form.requiresAttendance} onChange={set('requiresAttendance')} />
            <Checkbox label="Gera certificado" checked={form.generatesCertificate} onChange={set('generatesCertificate')} />
          </div>
        </Card>

        <div className="flex" style={{ gap: 10 }}>
          <Button type="submit" className="btn--lg" loading={saving}>{isEdit ? 'Salvar alterações' : 'Criar atividade'}</Button>
          <Link className="btn btn--secondary btn--lg" to="/admin/atividades">Cancelar</Link>
        </div>
      </form>
    </>
  );
}
