import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { CalendarCheck, Ticket, FileText, User, LogOut, Home, ShoppingBag, Package, CreditCard, MessagesSquare, Tag, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { useLiveData } from '../context/LiveDataContext';
import { QuickAccess } from '../components/QuickAccess';

const LINKS = [
  { to: '/minha-area', label: 'Minha área', icon: Home },
  { to: '/minhas-inscricoes', label: 'Minhas inscrições', icon: Ticket },
  { to: '/certificados', label: 'Certificados', icon: FileText },
  { to: '/sorteios', label: 'Sorteios / Resultados', icon: Trophy },
  { to: '/loja', label: 'Loja', icon: ShoppingBag },
  { to: '/cupons', label: 'Cupons', icon: Tag },
  { to: '/meus-pedidos', label: 'Meus pedidos', icon: Package },
  { to: '/meus-pagamentos', label: 'Pagamentos', icon: CreditCard },
  { to: '/comunicacao', label: 'Comunicação', icon: MessagesSquare },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export function DashboardLayout() {
  const { user, logout, isStaff } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  // V9.1: the badge lives in the shared live-data store. It is updated from the
  // SSE payload (or one debounced request per burst) instead of each layout
  // polling and re-fetching on every single event.
  const { unreadConversations: unreadMsgs } = useLiveData();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <div className="dash-sidebar__head"><Logo light /></div>
        <nav className="dash-sidebar__nav">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/minha-area'} className={({ isActive }) => `dash-link ${isActive ? 'is-active' : ''}`}>
              <l.icon size={19} /> {l.label}
              {l.to === '/comunicacao' && unreadMsgs > 0 && (
                <span className="badge badge--danger" style={{ marginLeft: 'auto' }}>{unreadMsgs}</span>
              )}
            </NavLink>
          ))}
          {isStaff && (
            <NavLink to="/admin" className="dash-link">
              <CalendarCheck size={19} /> Painel admin
            </NavLink>
          )}
          <Link to="/eventos" className="dash-link"><CalendarCheck size={19} /> Explorar eventos</Link>
        </nav>
        <div className="dash-sidebar__foot">
          <button className="dash-link" onClick={handleLogout}><LogOut size={19} /> Sair</button>
        </div>
      </aside>

      <div className="dash-main">
        <div className="dash-topbar">
          <span className="dash-topbar__hello">Olá, <strong>{user?.name?.split(' ')[0]}</strong></span>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
        <main className="dash-content">
          <Outlet />
        </main>
      </div>
      <QuickAccess />
    </div>
  );
}
