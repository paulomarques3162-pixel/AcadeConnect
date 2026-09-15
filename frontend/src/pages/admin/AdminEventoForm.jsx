import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventApi, adminApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Button, Field, Input, Textarea, Select, Checkbox, Spinner, ErrorState, Card } from '../../components/ui';
import { getErrorMessage } from '../../api/client';

const empty = {
  name: '', shortDescription: '', description: '', startDate: '', endDate: '',
  startTime: '08:00', location: '', address: '', modality: 'PRESENCIAL', category: '',
  capacity: '', registrationStart: '', registrationEnd: '', status: 'DRAFT',
  allowRegistration: true, allowCancellation: true, requireActivityRegistration: false,
  requireAttendance: true, automaticCertificate: false, minimumAttendancePercentage: 75,
  certificateHours: 8, isPaid: false, price: '', minPrice: '', maxPrice: '',
};

// Pick only the editable scalar fields. Spreading the whole GET payload used to
// drag relation objects (`institution`, `organizer`, `activities`, `_count`,
// `capacityProgress`) into the FormData, which the backend then rejected.
function toForm(event) {
  return {
    ...empty,
    name: event.name ?? '',
    shortDescription: event.shortDescription ?? '',
    description: event.description ?? '',
    startDate: event.startDate ? event.startDate.slice(0, 10) : '',
    endDate: event.endDate ? event.endDate.slice(0, 10) : '',
    startTime: event.startTime ?? empty.startTime,
    location: event.location ?? '',
    address: event.address ?? '',
    modality: event.modality ?? empty.modality,
    category: event.category ?? '',
    capacity: event.capacity ?? '',
    registrationStart: event.registrationStart ? event.registrationStart.slice(0, 10) : '',
    registrationEnd: event.registrationEnd ? event.registrationEnd.slice(0, 10) : '',
    status: event.status ?? empty.status,
    allowRegistration: event.allowRegistration ?? true,
    allowCancellation: event.allowCancellation ?? true,
    requireActivityRegistration: event.requireActivityRegistration ?? false,
    requireAttendance: event.requireAttendance ?? true,
    automaticCertificate: event.automaticCertificate ?? false,
    minimumAttendancePercentage: event.minimumAttendancePercentage ?? 75,
    certificateHours: event.certificateHours ?? 8,
    isPaid: event.isPaid ?? false,
    price: event.priceCents != null ? (event.priceCents / 100).toString() : '',
    minPrice: event.minPriceCents != null ? (event.minPriceCents / 100).toString() : '',
    maxPrice: event.maxPriceCents != null ? (event.maxPriceCents / 100).toString() : '',
  };
}

export default function AdminEventoForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => (isEdit ? eventApi.get(id).then((r) => r.data) : Promise.resolve(null)),
    [id],
    { immediate: isEdit }
  );

  useEffect(() => {
    if (data) setForm(toForm(data));
  }, [data]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const setBool = (k) => (e) => setForm({ ...form, [k]: e.target.checked });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // Normalize optional empty fields to null so the backend accepts them.
    const payload = {
      ...form,
      capacity: form.capacity === '' || form.capacity === null ? null : Number(form.capacity),
      registrationStart: form.registrationStart || null,
      registrationEnd: form.registrationEnd || null,
      certificateHours: form.certificateHours === '' ? null : Number(form.certificateHours),
      minimumAttendancePercentage: form.minimumAttendancePercentage === '' ? null : Number(form.minimumAttendancePercentage),
      isPaid: form.isPaid,
      priceCents: form.price === '' ? null : Math.round(Number(form.price) * 100),
      minPriceCents: form.minPrice === '' ? null : Math.round(Number(form.minPrice) * 100),
      maxPriceCents: form.maxPrice === '' ? null : Math.round(Number(form.maxPrice) * 100),
    };
    try {
      if (isEdit) {
        await eventApi.updateWithFile(id, payload, banner);
        toast.success('Evento atualizado com sucesso!');
      } else {
        await eventApi.createWithFile(payload, banner);
        toast.success('Evento criado com sucesso!');
      }
      navigate('/admin/eventos');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Não foi possível salvar o evento.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner text="Carregando evento..." />;
  if (error) return <ErrorState onRetry={reload} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isEdit ? 'Editar evento' : 'Criar evento'}</h1>
          <p>Preencha as informações do evento.</p>
        </div>
        <Link className="btn btn--secondary" to="/admin/eventos">Voltar</Link>
      </div>

      <form onSubmit={submit}>
        <Card className="card-pad mb-3">
          <h3 style={{ marginBottom: 16 }}>Informações gerais</h3>
          <div className="form-grid">
            <Field label="Nome do evento" required>
              <Input value={form.name} onChange={set('name')} required placeholder="Ex.: Semana Acadêmica 2026" />
            </Field>
            <Field label="Categoria">
              <Input value={form.category} onChange={set('category')} placeholder="Ex.: Semana Acadêmica, Congresso..." />
            </Field>
            <Field label="Descrição curta">
              <Input value={form.shortDescription} onChange={set('shortDescription')} placeholder="Frases curtas para o card" />
            </Field>
            <Field label="Modalidade">
              <Select value={form.modality} onChange={set('modality')}>
                {['PRESENCIAL','ONLINE','HIBRIDO'].map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Descrição completa">
              <Textarea value={form.description} onChange={set('description')} placeholder="Descreva o evento..." />
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Banner (imagem)">
              <Input type="file" accept="image/*" onChange={(e) => setBanner(e.target.files?.[0] || null)} />
            </Field>
          </div>
        </Card>

        <Card className="card-pad mb-3">
          <h3 style={{ marginBottom: 16 }}>Datas e local</h3>
          <div className="form-grid form-grid--3">
            <Field label="Data inicial" required><Input type="date" value={form.startDate} onChange={set('startDate')} required /></Field>
            <Field label="Data final" required><Input type="date" value={form.endDate} onChange={set('endDate')} required /></Field>
            <Field label="Horário"><Input type="time" value={form.startTime} onChange={set('startTime')} /></Field>
            <Field label="Local"><Input value={form.location} onChange={set('location')} placeholder="Ex.: Auditório Central" /></Field>
            <Field label="Endereço"><Input value={form.address} onChange={set('address')} placeholder="Rua, número" /></Field>
            <Field label="Limite de participantes"><Input type="number" min="0" value={form.capacity} onChange={set('capacity')} /></Field>
          </div>
        </Card>

        <Card className="card-pad mb-3">
          <h3 style={{ marginBottom: 16 }}>Inscrições</h3>
          <div className="form-grid">
            <Field label="Início das inscrições"><Input type="date" value={form.registrationStart} onChange={set('registrationStart')} /></Field>
            <Field label="Prazo final de inscrição"><Input type="date" value={form.registrationEnd} onChange={set('registrationEnd')} /></Field>
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                {['DRAFT','PUBLISHED','OPEN','ONGOING','CLOSED','CANCELLED'].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap mt-2" style={{ gap: 20 }}>
            <Checkbox label="Permitir inscrições" checked={form.allowRegistration} onChange={setBool('allowRegistration')} />
            <Checkbox label="Permitir cancelamento" checked={form.allowCancellation} onChange={setBool('allowCancellation')} />
            <Checkbox label="Exigir inscrição em atividades" checked={form.requireActivityRegistration} onChange={setBool('requireActivityRegistration')} />
            <Checkbox label="Exigir presença" checked={form.requireAttendance} onChange={setBool('requireAttendance')} />
          </div>
        </Card>

        <Card className="card-pad mb-3">
          <h3 style={{ marginBottom: 16 }}>Pagamento</h3>
          <div className="flex flex-wrap mb-2" style={{ gap: 20 }}>
            <Checkbox label="Evento pago (exige pagamento PIX para liberar o QR de entrada)" checked={form.isPaid} onChange={setBool('isPaid')} />
          </div>
          {form.isPaid && (
            <div className="form-grid form-grid--3">
              <Field label="Valor (R$)" required><Input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} /></Field>
              <Field label="Valor mínimo (R$)"><Input type="number" min="0" step="0.01" value={form.minPrice} onChange={set('minPrice')} /></Field>
              <Field label="Valor máximo (R$)"><Input type="number" min="0" step="0.01" value={form.maxPrice} onChange={set('maxPrice')} /></Field>
            </div>
          )}
        </Card>

        <Card className="card-pad mb-3">
          <h3 style={{ marginBottom: 16 }}>Certificado</h3>
          <div className="form-grid form-grid--3">
            <Field label="Carga horária (horas)"><Input type="number" min="0" step="0.5" value={form.certificateHours} onChange={set('certificateHours')} /></Field>
            <Field label="Percentual mínimo de presença (%)"><Input type="number" min="0" max="100" value={form.minimumAttendancePercentage} onChange={set('minimumAttendancePercentage')} /></Field>
          </div>
          <div className="mt-2">
            <Checkbox label="Emitir certificado automaticamente ao cumprir o requisito" checked={form.automaticCertificate} onChange={setBool('automaticCertificate')} />
          </div>
        </Card>

        <div className="flex" style={{ gap: 10 }}>
          <Button type="submit" className="btn--lg" loading={saving}>{isEdit ? 'Salvar alterações' : 'Criar evento'}</Button>
          <Link className="btn btn--secondary btn--lg" to="/admin/eventos">Cancelar</Link>
        </div>
      </form>
    </>
  );
}
