import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Ticket, CheckCircle2, FileText, ArrowRight } from 'lucide-react';
import { registrationApi, certificateApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { DashboardCard } from '../../components/Cards';
import { Spinner, ErrorState, EmptyState } from '../../components/ui';
import { formatDate } from '../../utils/format';

export default function MinhaArea() {
  const { user } = useAuth();
  const regs = useApi(() => registrationApi.mine().then((r) => r.data.registrations), []);
  const certs = useApi(() => certificateApi.mine().then((r) => r.data.certificates), []);

  const stats = useMemo(() => {
    const registrations = regs.data || [];
    const activeRegs = registrations.filter((r) => r.status === 'CONFIRMED');
    const presences = registrations.reduce((acc, r) => acc + (r.attendance?.filter((a) => a.status === 'PRESENT').length || 0), 0);
    return {
      events: activeRegs.length,
      registrations: registrations.length,
      presences,
      certificates: (certs.data || []).length,
    };
  }, [regs.data, certs.data]);

  const loading = regs.loading || certs.loading;
  const nextActivity = useMemo(() => {
    const upcoming = [];
    (regs.data || []).forEach((r) =>
      (r.activityRegistrations || []).forEach((ar) => {
        if (new Date(ar.activity.date) >= new Date()) upcoming.push({ ...ar.activity, registrationId: r.id });
      })
    );
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    return upcoming[0] || null;
  }, [regs.data]);

  if (loading) return <Spinner text="Carregando sua área..." />;
  if (regs.error) return <ErrorState onRetry={regs.reload} />;

  return (
    <>
      <h1 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Olá, {user?.name?.split(' ')[0]} 👋</h1>
      <p className="text-muted mb-3">Acompanhe sua jornada acadêmica.</p>

      <div className="stat-grid mb-3">
        <DashboardCard title="Eventos inscritos" value={stats.events} icon={<CalendarDays size={22} />} tone="primary" />
        <DashboardCard title="Inscrições" value={stats.registrations} icon={<Ticket size={22} />} tone="info" />
        <DashboardCard title="Presenças" value={stats.presences} icon={<CheckCircle2 size={22} />} tone="success" />
        <DashboardCard title="Certificados" value={stats.certificates} icon={<FileText size={22} />} tone="warning" />
      </div>

      <div className="card card-pad mb-3">
        <div className="flex-between mb-2">
          <h3>Próxima atividade</h3>
          <Link to="/minhas-inscricoes" className="btn btn--sm btn--secondary">Ver todas <ArrowRight size={15} /></Link>
        </div>
        {nextActivity ? (
          <div className="flex-between flex-wrap">
            <div>
              <strong>{nextActivity.name}</strong>
              <p className="text-muted" style={{ margin: '4px 0 0' }}>
                {formatDate(nextActivity.date, { day: '2-digit', month: '2-digit' })} às {nextActivity.startTime} · {nextActivity.location || 'Local a definir'}
              </p>
            </div>
            <Link className="btn btn--primary btn--sm" to={`/inscricao/${nextActivity.registrationId}`}>Ver detalhes</Link>
          </div>
        ) : (
          <EmptyState title="Você ainda não possui inscrições." description="Explore os eventos e faça sua primeira inscrição." action={<Link className="btn btn--primary" to="/eventos">Explorar eventos</Link>} />
        )}
      </div>
    </>
  );
}
