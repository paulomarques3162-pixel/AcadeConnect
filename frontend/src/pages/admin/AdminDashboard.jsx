import { Link } from 'react-router-dom';
import {
  CalendarDays, Users, Ticket, ClipboardCheck, Award, ListChecks,
  BarChart3, ScanLine, MapPin,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { adminApi, eventApi } from '../../api/services';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { DashboardCard } from '../../components/Cards';
import { Spinner, ErrorState, Card } from '../../components/ui';
import { formatNumber, calendarDayKey } from '../../utils/format';

const PIE_COLORS = ['#166534', '#d4af37', '#15803d', '#b8942b', '#22c55e', '#0f766e'];

function ChartCard({ title, children }) {
  return (
    <Card className="card-pad" style={{ minHeight: 280 }}>
      <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>{title}</h3>
      {children}
    </Card>
  );
}

const WEEK_LABELS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

function formatTime(dateStr, startTime) {
  // The event time is its own field (startTime). Never derive a time from the
  // calendar date — doing so leaked the UTC offset (a UTC-midnight date showed
  // as 21:00 in UTC-3).
  return startTime || '';
}

function currentWeekDays() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(() => adminApi.dashboard().then((r) => r.data), []);
  const { data: allEvents } = useApi(() => eventApi.list({ limit: 200 }).then((r) => r.data.events), []);

  const weekDays = currentWeekDays();
  // Compare CALENDAR DAYS, not instants. `startDate` is a calendar day stored
  // as UTC-midnight, so comparing with local Date boundaries placed the event
  // on the previous weekday in UTC-3 (or dropped it from the week).
  const dayKeys = weekDays.map((d) => calendarDayKey(d));
  const weekEvents = (allEvents || []).filter((e) => e.startDate && dayKeys.includes(calendarDayKey(e.startDate)));
  const weekByDay = weekDays.map((day, i) => {
    const key = dayKeys[i];
    const list = weekEvents
      .filter((e) => calendarDayKey(e.startDate) === key)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    return { label: WEEK_LABELS[i], date: day, events: list };
  });

  if (loading) return <Spinner text="Carregando dashboard..." />;
  if (error) return <ErrorState onRetry={reload} />;
  const { stats, charts, recentActivity } = data;

  return (
    <>
      <div className="mb-3">
        <h1 style={{ fontSize: '1.6rem' }}>Bom dia, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-muted">Visão geral da plataforma em tempo real.</p>
      </div>

      <div className="stat-grid mb-3">
        <DashboardCard title="Eventos ativos" value={stats.activeEvents} icon={<CalendarDays size={22} />} tone="primary" />
        <DashboardCard title="Participantes" value={stats.participants} icon={<Users size={22} />} tone="info" />
        <DashboardCard title="Inscrições" value={stats.registrations} icon={<Ticket size={22} />} tone="warning" />
        <DashboardCard title="Presenças" value={stats.attendance} icon={<ClipboardCheck size={22} />} tone="success" />
        <DashboardCard title="Certificados" value={stats.certificates} icon={<Award size={22} />} tone="warning" />
        <DashboardCard title="Atividades" value={stats.activities} icon={<ListChecks size={22} />} tone="primary" />
      </div>

      <div className="flex mb-3" style={{ gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn btn--primary" to="/admin/eventos/novo">+ Criar evento</Link>
        <Link className="btn btn--secondary" to="/admin/operador"><ScanLine size={18} /> Controle de presença</Link>
        <Link className="btn btn--secondary" to="/admin/relatorios"><BarChart3 size={18} /> Relatórios</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
        <ChartCard title="Inscrições por dia (últimos 14 dias)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.registrationsPerDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#166534" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Presenças por evento">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={charts.attendanceByEvent} dataKey="count" nameKey="name" outerRadius={80} label>
                {charts.attendanceByEvent.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Participantes por atividade (top 10)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={charts.participantsPerActivity} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#d4af37" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Certificados por status">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={charts.certificatesByStatus}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="status" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#059669" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="card-pad mt-3">
        <h3 style={{ fontSize: '1.1rem', marginBottom: 6 }}>Eventos da Semana</h3>
        <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.9rem' }}>Segunda a sexta — eventos reais cadastrados.</p>
        <div className="week-grid">
          {weekByDay.map((d) => (
            <div className="week-col card" key={d.label}>
              <div className="week-col__head">{d.label}</div>
              {d.events.length === 0 ? (
                <p className="week-col__empty">Nenhum evento cadastrado.</p>
              ) : (
                d.events.map((e) => (
                  <div className="week-item" key={e.id}>
                    <strong className="week-item__name">{e.name}</strong>
                    <span className="week-item__meta">{formatTime(e.startDate, e.startTime)}</span>
                    <span className="week-item__meta"><MapPin size={13} /> {e.location || 'A definir'}</span>
                    <span className="week-item__meta"><Users size={13} /> {e._count?.registrations ?? 0} inscritos</span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="card-pad mt-3">
        <h3 style={{ fontSize: '1rem', marginBottom: 14 }}>Atividades recentes</h3>
        {(recentActivity || []).length === 0 ? (
          <p className="text-muted">Sem atividades registradas.</p>
        ) : (
          <div className="list">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex-between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <div>
                  <strong>{a.user}</strong> · {a.action.replace(/_/g, ' ').toLowerCase()}
                  {a.resource ? ` em ${a.resource}` : ''}
                </div>
                <span className="text-muted" style={{ fontSize: '0.82rem' }}>{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
