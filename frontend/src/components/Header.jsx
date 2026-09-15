import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Sun, User, LayoutDashboard, X } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { notificationApi } from '../api/services';
import { subscribeRealtime } from '../api/realtime';
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
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const userRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    let active = true;
    let requestTimer = null;
    let inFlight = false;
    let lastLoadAt = 0;

    const load = async () => {
      if (!user || !active || inFlight) return;
      inFlight = true;
      try {
        const res = await notificationApi.list({ limit: 8 });
        if (active) {
          setNotifs(res.data.notifications || []);
          setUnread(res.data.unread || 0);
          lastLoadAt = Date.now();
        }
      } catch {
        // keep the last known notifications
      } finally {
        inFlight = false;
      }
    };

    const scheduleLoad = (delay = 200) => {
      if (!active || requestTimer) return;
      requestTimer = setTimeout(() => {
        requestTimer = null;
        load();
      }, delay);
    };

    load();

    // Only notification events refresh the notification list. A message event
    // is not a second reason to fetch /notifications because the backend already
    // emits the notification event for user-facing messages.
    const unsubscribe = user
      ? subscribeRealtime((evt) => {
          if (active && evt?.type === 'notification') scheduleLoad();
        })
      : () => {};

    const onFocus = () => {
      // Focus is only a consistency check, not a polling mechanism.
      if (Date.now() - lastLoadAt > 30000) scheduleLoad();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      if (requestTimer) clearTimeout(requestTimer);
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [user]);

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
                <button className="icon-btn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notificações">
                  <Bell size={20} />
                  {unread > 0 && <span className="header__dot">{unread}</span>}
                </button>
                {notifOpen && (
                  <div className="dropdown dropdown--notif">
                    <div className="dropdown__title">Notificações</div>
                    {notifs.length === 0 && <p className="dropdown__empty">Sem notificações.</p>}
                    {notifs.map((n) => (
                      <button key={n.id} className="dropdown__item" onClick={() => { navigate(n.link || '/minha-area'); setNotifOpen(false); }}>
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

      {mobileOpen && (
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
      )}
    </header>
  );
}
