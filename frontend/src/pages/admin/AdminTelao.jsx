import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { eventApi, attendanceApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { Select, Field, Button } from '../../components/ui';

export default function AdminTelao() {
  const [eventId, setEventId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [started, setStarted] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const camId = 'telao-reader';

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const activities = useApi(() => (eventId ? eventApi.get(eventId).then((r) => r.data.activities) : Promise.resolve([])), [eventId]);

  useEffect(() => () => { stop(); }, []);

  async function stop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try { await scanner.stop(); } catch { /* */ }
      try { scanner.clear(); } catch { /* */ }
    }
    setStarted(false);
  }

  const start = async () => {
    if (!activityId) return;
    setResult(null); setError(null);
    await stop();
    const scanner = new Html5Qrcode(camId);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 280, height: 280 } },
        async (code) => {
          if (processingRef.current) return;
          processingRef.current = true;
          try { await handleScan(code); } finally { processingRef.current = false; }
        },
        () => {}
      );
      setStarted(true);
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || /permission|denied|not allowed/i.test(String(e?.message || ''));
      setError(
        denied
          ? 'Permissão de câmera negada. Autorize o acesso no navegador e tente novamente.'
          : 'Não foi possível acessar a câmera.'
      );
      setStarted(false);
    }
  };

  const handleScan = async (code) => {
    try {
      const res = await attendanceApi.scan(code.trim(), activityId);
      setResult(res.data);
      setName(res.data.participant?.name);
      setError(null);
      // auto-return after 3.5s
      setTimeout(() => { setResult(null); setName(''); }, 3500);
    } catch (e) {
      setResult('error');
      setError(e?.response?.data?.message || 'QR Code inválido.');
      setTimeout(() => { setResult(null); setError(null); }, 2500);
    }
  };

  return (
    <div className="telao">
      <div style={{ position: 'absolute', top: 24, left: 24 }}>
        <Link className="btn btn--secondary" to="/admin/operador"><ArrowLeft size={18} /> Voltar</Link>
      </div>

      {result ? (
        result === 'error' ? (
          <div className="telao__success" style={{ borderColor: '#dc2626', background: 'rgba(220,38,38,0.15)' }}>
            <div style={{ fontSize: '4rem' }}>✕</div>
            <h1 style={{ color: '#f87171' }}>{error || 'QR Code inválido'}</h1>
          </div>
        ) : (
          <div className="telao__success">
            <CheckCircle2 size={80} color="#4ade80" />
            <h1>✓ PRESENÇA CONFIRMADA</h1>
            <h2>{name}</h2>
            <p style={{ fontSize: '1.4rem', color: '#a7f3d0' }}>Tenha um ótimo evento!</p>
          </div>
        )
      ) : (
        <>
          <h1>CONTROLE DE PRESENÇA</h1>
          <h2>Escaneie seu QR Code</h2>
          <div className="filters" style={{ maxWidth: 560, justifyContent: 'center', marginBottom: 24 }}>
            <Field label="Evento">
              <Select value={eventId} onChange={(e) => { setEventId(e.target.value); setActivityId(''); }}>
                <option value="">Selecione...</option>
                {(events.data || []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label="Atividade">
              <Select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
                <option value="">Selecione...</option>
                {(activities.data || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          </div>
          {/* The reader container must exist before Html5Qrcode is created and
              must not be unmounted by a re-render, or the camera never starts. */}
          <div style={{ position: 'relative', width: 380, height: 380, background: '#000', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
            <div id={camId} />
            {!started && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Câmera inativa</div>}
          </div>
          {error && <p style={{ color: '#f87171' }}>{error}</p>}
          {!started && <Button className="btn--lg" onClick={start}>Iniciar leitura</Button>}
          {started && <Button variant="secondary" onClick={stop}>Parar</Button>}
        </>
      )}
    </div>
  );
}
