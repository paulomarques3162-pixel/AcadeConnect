import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Sun, User, LayoutDashboard, X } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLiveData } from '../context/LiveDataContext';
import { fullNameInitials } from '../utils/format';

const NAV = [
  { to: '/', label: 'Início' },
  { to: '/eventos', label: 'Eventos' },
  { to: '/como-funciona', label: 'Como funciona' },
  { to: '/sobre', label: 'Sobre' },
  { to: '/contato', label: 'Contato' },
];

export function Header() {
  const { user, logout, isStaff } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const userRef = useRef(null);
  const notifRef = useRef(null);

  // V9.1: the bell is fed by the shared live-data store. Incoming notifications
  // are appended locally from the SSE payload — no HTTP request per event, and no
  // re-fetch when a chat MESSAGE arrives (V9 reloaded the 8 notifications on every
  // message, which was pure waste).
  const {
    notifications: notifs,
    unreadNotifications: unread,
    markNotificationRead,
    refreshNotifications,
  } = useLiveData();

  const openNotifications = () => {
    setNotifOpen((o) => {
      const next = !o;
      if (next) refreshNotifications(); // staleness-guarded (>=60s)
      return next;
    });
  };

  const openNotification = (n) => {
    if (!n.read) markNotificationRead(n.id);
    navigate(n.link || '/minha-area');
    setNotifOpen(false);
  };

  useEffect(() => {
    const onClick = (e) => {
      if (userRef.current && !userRef.current.contains(e.target)) setUserMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="header">
      <div className="header__inner container">
        <Logo />
        <nav className="header__nav" aria-label="Navegação principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `header__link ${isActive ? 'is-active' : ''}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          <button className="icon-btn" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {user ? (
            <>
              <div className="header__notif-wrap" ref={notifRef}>
                <button className="icon-btn" onClick={openNotifications} aria-label="Notificações">
                  <Bell size={20} />
                  {unread > 0 && <span className="header__dot">{unread}</span>}
                </button>
                {notifOpen && (
                  <div className="dropdown dropdown--notif">
                    <div className="dropdown__title">Notificações</div>
                    {notifs.length === 0 && <p className="dropdown__empty">Sem notificações.</p>}
                    {notifs.map((n) => (
                      <button key={n.id} className="dropdown__item" onClick={() => openNotification(n)}>
                        <span className="dropdown__item-title">{n.title}</span>
                        <span className="dropdown__item-sub">{n.message}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="header__user-wrap" ref={userRef}>
                <button className="header__user" onClick={() => setUserMenu((o) => !o)}>
                  <span className="avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : fullNameInitials(user.name)}</span>
                  <span className="header__user-name">{user.name}</span>
                </button>
                {userMenu && (
                  <div className="dropdown">
                    <div className="dropdown__title">{user.email}</div>
                    <Link className="dropdown__item" to="/minha-area"><User size={16} /> Minha área</Link>
                    {isStaff && <Link className="dropdown__item" to="/admin"><LayoutDashboard size={16} /> Painel admin</Link>}
                    <button className="dropdown__item" onClick={handleLogout}><LogOut size={16} /> Sair</button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="header__auth">
              <Link className="btn btn--ghost btn--sm" to="/login">Entrar</Link>
              <Link className="btn btn--primary btn--sm" to="/cadastro">Criar conta</Link>
            </div>
          )}

          <button className="icon-btn header__burger" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* O menu mobile é renderizado em um portal para fora do <header>.
          O header usa `backdrop-filter`, que cria um "containing block" e faz
          `position: fixed` se posicionar em relação ao header — era isso que
          deixava o conteúdo da página aparecer atrás do menu. */}
      {mobileOpen && typeof document !== 'undefined' && createPortal((
        <div className="mobile-menu">
          <div className="mobile-menu__head">
            <Logo />
            <button className="icon-btn" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={22} /></button>
          </div>
          <nav className="mobile-menu__nav">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMobileOpen(false)}>{n.label}</Link>
            ))}
            {user ? (
              <>
                <Link to="/minha-area" onClick={() => setMobileOpen(false)}>Minha área</Link>
                {isStaff && <Link to="/admin" onClick={() => setMobileOpen(false)}>Painel admin</Link>}
                <button onClick={handleLogout}>Sair</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)}>Entrar</Link>
                <Link to="/cadastro" onClick={() => setMobileOpen(false)}>Criar conta</Link>
              </>
            )}
          </nav>
        </div>
      ), document.body)}
    </header>
  );
}
