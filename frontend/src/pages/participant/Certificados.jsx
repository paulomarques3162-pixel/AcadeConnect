import { Link } from 'react-router-dom';
import { FileText, Download } from 'lucide-react';
import { certificateApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { CertificateCard } from '../../components/Cards';
import { Spinner, ErrorState, EmptyState, Button } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function Certificados() {
  const { data, loading, error, reload } = useApi(() => certificateApi.mine().then((r) => r.data.certificates), []);

  const download = async (id, code) => {
    const res = await fetch(certificateApi.downloadUrl(id), { headers: { Authorization: `Bearer ${localStorage.getItem('acadeconnect_token')}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${code}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Spinner text="Carregando certificados..." />;
  if (error) return <ErrorState onRetry={reload} />;
  // Versões válidas primeiro; canceladas por último.
  const certificates = [...(data || [])].sort(
    (a, b) => (a.status === 'CANCELLED' ? 1 : 0) - (b.status === 'CANCELLED' ? 1 : 0)
  );

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Meus certificados</h1>
      <p className="text-muted mb-3">Baixe e valide seus certificados de participação.</p>

      {certificates.length === 0 ? (
        <EmptyState icon={<FileText size={28} />} title="Você ainda não possui certificados." description="Participe de eventos e cumpra os requisitos de presença para recebê-los." action={<Link className="btn btn--primary" to="/eventos">Explorar eventos</Link>} />
      ) : (
        <div className="list">
          {certificates.map((c) => (
            <div className="cert-card" key={c.id}>
              <CertificateCard certificate={c} />
              <div className="flex">
                <Button variant="secondary" size="sm" onClick={() => download(c.id, c.code)} icon={<Download size={16} />}>Baixar</Button>
                <Link className="btn btn--primary btn--sm" to={`/certificados/${c.id}`}>Detalhes</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
