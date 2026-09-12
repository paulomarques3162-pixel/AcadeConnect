import { useState } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { certificateApi } from '../api/services';
import { Button, Field, Input, Card } from '../components/ui';
import { formatDate, formatNumber } from '../utils/format';

export default function ValidateCertificate() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await certificateApi.validate(code);
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Não foi possível validar o certificado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 640, paddingTop: 48, paddingBottom: 48 }}>
      <div className="text-center mb-3">
        <div className="empty-state__icon" style={{ margin: '0 auto 16px' }}><ShieldCheck size={30} /></div>
        <h1 style={{ fontSize: '1.8rem' }}>Validar certificado</h1>
        <p className="text-muted">Digite o código do certificado para verificar sua autenticidade.</p>
      </div>

      <form onSubmit={submit}>
        <div className="flex" style={{ alignItems: 'flex-end' }}>
          <div className="flex-1" style={{ flex: 1 }}>
            <Field label="Código do certificado" hint="Ex.: CERT-2026-0000123">
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CERT-2026-0000123" required />
            </Field>
          </div>
          <Button type="submit" loading={loading} icon={<Search size={18} />}>Validar</Button>
        </div>
      </form>

      {error && <div className="card card-pad mt-3" style={{ borderColor: 'var(--danger)' }}><p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p></div>}

      {result && (
        <Card className="card-pad mt-3">
          <div className="flex mb-2" style={{ color: 'var(--success)' }}>
            <ShieldCheck size={24} />
            <strong style={{ fontSize: '1.1rem' }}>Certificado válido</strong>
          </div>
          <div className="sidebox__row"><dt>Nome</dt><dd>{result.participantName}</dd></div>
          <div className="sidebox__row"><dt>Evento</dt><dd>{result.eventName}</dd></div>
          {result.institutionName && <div className="sidebox__row"><dt>Instituição</dt><dd>{result.institutionName}</dd></div>}
          {result.activityName && <div className="sidebox__row"><dt>Atividade</dt><dd>{result.activityName}</dd></div>}
          <div className="sidebox__row"><dt>Carga horária</dt><dd>{formatNumber(result.hours)} horas</dd></div>
          <div className="sidebox__row"><dt>Data do evento</dt><dd>{formatDate(result.date)}</dd></div>
          <div className="sidebox__row"><dt>Código</dt><dd>{result.code}</dd></div>
        </Card>
      )}
    </div>
  );
}
