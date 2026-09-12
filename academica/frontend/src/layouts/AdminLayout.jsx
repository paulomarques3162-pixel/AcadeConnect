import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, ListChecks, Users, Ticket, ClipboardCheck,
  Award, BarChart3, UserCog, Settings, LogOut, ScanLine, Menu, X, Moon, Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Logo } from '../components/Logo';

const MENU = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/eventos', label: 'Eventos', icon: CalendarDays },
  { to: '/admin/atividades', label: 'Atividades', icon: ListChecks },
  { to: '/admin/participantes', label: 'Participantes', icon: Users },
  { to: '/admin/inscricoes', label: 'Inscrições', icon: Ticket },
  { to: '/admin/presencas', label: 'Presenças', icon: ClipboardCheck },
  { to: '/admin/operador', label: 'Controle de presença', icon: ScanLine },
  { to: '/admin/certificados', label: 'Certificados', icon: Award },
  { to: '/admin/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/usuarios', label: 'Usuários', icon: UserCog },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const SidebarInner = (
    <>
      <div className="admin-sidebar__head"><Logo light /></div>
      <nav className="admin-sidebar__nav">
        {MENU.map((m) => (
          <NavLink key={m.to} to={m.to} end={m.end} onClick={() => setOpen(false)} className={({ isActive }) => `admin-link ${isActive ? 'is-active' : ''}`}>
            <m.icon size={19} /> {m.label}
          </NavLink>
        ))}
      </nav>
      <div className="admin-sidebar__foot">
        <button className="admin-link" onClick={handleLogout}><LogOut size={19} /> Sair</button>
      </div>
    </>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar admin-sidebar--desktop">{SidebarInner}</aside>
      {open && (
        <div className="admin-drawer-backdrop" onClick={() => setOpen(false)}>
          <aside className="admin-sidebar" onClick={(e) => e.stopPropagation()}>{SidebarInner}</aside>
        </div>
      )}

      <div className="admin-main">
        <div className="admin-topbar">
          <button className="icon-btn admin-topbar__burger" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu size={22} /></button>
          <span className="admin-topbar__title">Painel Administrativo</span>
          <div className="admin-topbar__right">
            <button className="icon-btn" onClick={toggleTheme} aria-label="Alternar tema">
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <span className="admin-topbar__user">{user?.name}</span>
          </div>
        </div>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
