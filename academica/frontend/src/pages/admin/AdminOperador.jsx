import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Keyboard, CheckCircle2, XCircle, User, ScanLine, CheckCheck } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { eventApi, attendanceApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { Select, Field, Button, Spinner, ErrorState, Input, Card, StatusBadge } from '../../components/ui';

export default function AdminOperador() {
  const toast = useToast();
  const [eventId, setEventId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef(null);
  const processingRef = useRef(false);
  const camId = 'qr-reader';

  const events = useApi(() => eventApi.list({ limit: 100 }).then((r) => r.data.events), []);
  const activities = useApi(() => (eventId ? eventApi.get(eventId).then((r) => r.data.activities) : Promise.resolve([])), [eventId]);

  // Cleanup camera on unmount
  useEffect(() => () => { stopScanner(); /* eslint-disable-next-line */ }, []);

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try { await scanner.stop(); } catch { /* ignore */ }
      try { scanner.clear(); } catch { /* ignore */ }
    }
  }

  const startScanner = async () => {
    if (!activityId) return toast.error('Selecione o evento e a atividade.');
    setError(null);
    setResult(null);
    try {
      await stopScanner();
      const scanner = new Html5Qrcode(camId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          // Ignore reads while a previous one is being processed (prevents
          // duplicate submissions from the continuous scanner).
          if (processingRef.current) return;
          processingRef.current = true;
          await stopScanner();
          setScanning(false);
          try { await handleCode(decodedText, 'qr'); } finally { processingRef.current = false; }
        },
        () => { /* decode errors ignored */ }
      );
      setScanning(true);
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || /permission|denied|not allowed/i.test(String(e?.message || ''));
      toast.error(
        denied
          ? 'Permissão de câmera negada. Autorize o acesso à câmera nas configurações do navegador para escanear o QR Code.'
          : 'Não foi possível acessar a câmera. Verifique se o dispositivo possui câmera ou use a digitação manual.'
      );
      setScanning(false);
    }
  };

  const handleCode = async (value, source = 'qr') => {
    setError(null);
    setResult(null);
    const v = String(value ?? '').trim();
    // Debug (não expõe o token inteiro): ajuda a diagnosticar em produção.
    // eslint-disable-next-line no-console
    console.debug('[QR DEBUG] valor lido:', `${v.slice(0, 6)}...`, '| tamanho:', v.length, '| formato:', /^AC[0-9a-f]{20,}$/i.test(v) ? 'qrToken' : (source === 'manual' ? 'manual' : 'desconhecido'), '| activityId:', activityId || '(vazio)');
    try {
      // Explicit origin: camera = qrToken, manual = code. Never mixed.
      const res = source === 'manual'
        ? await attendanceApi.scanManual(v, activityId)
        : await attendanceApi.scanQr(v, activityId);
      // eslint-disable-next-line no-console
      console.debug('[QR DEBUG] enviando', source === 'manual' ? '{ code, activityId }' : '{ qrToken, activityId }', '| resposta:', res?.message);
      setResult({ ok: true, ...res.data });
      toast.success('Presença registrada com sucesso!');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.debug('[QR DEBUG] resposta do backend:', e?.response?.status, e?.response?.data?.message);
      setResult({ ok: false });
      setError(e?.response?.data?.message || 'QR Code inválido.');
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualCode.trim()) handleCode(manualCode.trim(), 'manual');
  };

  const searchParticipant = async () => {
    if (!eventId) return toast.error('Selecione o evento.');
    setFound(null);
    try {
      const res = await attendanceApi.searchParticipants({ eventId, q: searchQ });
      setFound(res.data.registrations);
    } catch (e) { toast.error(e?.response?.data?.message); }
  };

  const manualRegister = async (registrationId) => {
    if (!activityId) return toast.error('Selecione a atividade.');
    setBusy(true);
    try {
      await attendanceApi.manual(registrationId, activityId, true);
      toast.success('Presença registrada!');
      setFound(null);
    } catch (e) { toast.error(e?.response?.data?.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-head">
        <div>
          <h1>Controle de presença</h1>
          <p>Modo operador — escaneie o QR Code ou busque o participante.</p>
        </div>
        <Link className="btn btn--secondary" to="/admin/telao"><ScanLine size={17} /> Modo telão</Link>
      </div>

      <div className="filters mb-3">
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

      <div className="tabs">
        <button className={`tab ${!scanning ? 'is-active' : ''}`} onClick={() => { stopScanner(); setScanning(false); }}>📷 Escanear QR Code</button>
        <button className={`tab ${scanning ? 'is-active' : ''}`} onClick={startScanner}>Ligar câmera</button>
      </div>

      <div className="card card-pad mb-3">
        {/* The reader container is ALWAYS mounted in the same position so the
            Html5Qrcode video/canvas is never detached by a re-render. */}
        <div className="operator__cam" style={{ position: 'relative', minHeight: 220 }}>
          <div id={camId} />
          {!scanning && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
              <div className="text-center">
                <Camera size={40} style={{ margin: '0 auto 10px' }} />
                <p style={{ margin: 0 }}>Câmera desligada. Toque em "Ligar câmera".</p>
              </div>
            </div>
          )}
        </div>
        {scanning && (
          <Button variant="secondary" className="btn--block mt-2" onClick={async () => { await stopScanner(); setScanning(false); }}>Desligar câmera</Button>
        )}

        <form className="operator__manual" onSubmit={handleManualSubmit}>
          <Input value={manualCode} onChange={(e) => setManualCode(e.target.value)} placeholder="Ou digite o código da inscrição (ex.: EVT-2026-000123)" aria-label="Código da inscrição" />
          <Button type="submit" variant="secondary"><Keyboard size={16} /> Validar</Button>
        </form>
      </div>

      {error && (
        <div className="presence-success mb-3" style={{ borderColor: 'var(--danger)', background: 'rgba(220,38,38,0.08)', flexDirection: 'row' }}>
          <XCircle size={28} color="var(--danger)" />
          <strong style={{ color: 'var(--danger)' }}>{error}</strong>
        </div>
      )}

      {result?.ok && (
        <div className="presence-success mb-3">
          <CheckCircle2 size={40} color="var(--success)" />
          <strong style={{ fontSize: '1.2rem' }}>Presença confirmada ✓</strong>
          <span>{result.participant?.name} · Inscrição {result.registrationCode}</span>
          <span className="text-muted">{result.activityName}</span>
          <Button onClick={() => setResult(null)}>Nova leitura</Button>
        </div>
      )}

      <Card className="card-pad">
        <h3 className="mb-2">Registro manual</h3>
        <div className="flex" style={{ gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Buscar participante por nome..." aria-label="Buscar participante" />
          </div>
          <Button variant="secondary" onClick={searchParticipant} icon={<User size={16} />}>Buscar</Button>
        </div>

        {(found || []).map((r) => (
          <div className="attendance-row" key={r.registrationId}>
            <div className="attendance-row__name">{r.participant?.name}</div>
            <div className="attendance-row__code">Inscrição #{r.code}</div>
            <StatusBadge status="CONFIRMED" label="Inscrito" />
            <Button size="sm" loading={busy} onClick={() => manualRegister(r.registrationId)} icon={<CheckCheck size={15} />}>Registrar presença</Button>
          </div>
        ))}
        {found && found.length === 0 && <p className="text-muted mt-2">Nenhum participante encontrado.</p>}
      </Card>
    </div>
  );
}
