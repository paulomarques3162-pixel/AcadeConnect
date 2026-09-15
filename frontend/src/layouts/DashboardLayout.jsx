import { useEffect, useState } from 'react';
import { Outlet, Link, NavLink, useNavigate } from 'react-router-dom';
import { CalendarCheck, Ticket, FileText, User, LogOut, Home, ShoppingBag, Package, CreditCard, MessagesSquare, Tag, Trophy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from '../components/Logo';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun } from 'lucide-react';
import { conversationApi } from '../api/services';
import { subscribeRealtime, subscribeRealtimeStatus } from '../api/realtime';

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
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    let active = true;
    let fallbackTimer = null;
    let requestTimer = null;
    let lastRequestAt = 0;
    let inFlight = false;

    const clearFallback = () => {
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    };

    const load = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const r = await conversationApi.unreadCount();
        if (active) {
          setUnreadMsgs(r.data?.unread || 0);
          lastRequestAt = Date.now();
        }
      } catch {
        // keep the last known badge value
      } finally {
        inFlight = false;
      }
    };

    const scheduleLoad = () => {
      if (!active || requestTimer) return;
      requestTimer = setTimeout(() => {
        requestTimer = null;
        load();
      }, 250);
    };

    const scheduleFallback = () => {
      clearFallback();
      if (!active || document.hidden) return;
      fallbackTimer = setTimeout(async () => {
        fallbackTimer = null;
        await load();
        scheduleFallback();
      }, 120000);
    };

    load();
    scheduleFallback();

    const unsubscribe = subscribeRealtime((evt) => {
      // One coalesced refresh for a burst of realtime events. Message events
      // are intentionally ignored here because a user message already emits
      // the corresponding notification event.
      if (active && (evt?.type === 'conversation' || evt?.type === 'notification')) {
        scheduleLoad();
      }
    });

    const unsubscribeStatus = subscribeRealtimeStatus((isConnected) => {
      if (isConnected) {
        clearFallback();
      } else {
        scheduleFallback();
      }
    });

    const onVisibility = () => {
      if (document.hidden) {
        clearFallback();
        return;
      }
      // Only use focus/visibility as a consistency check when realtime is not
      // connected; avoid an HTTP request every time the tab gets focus.
      scheduleFallback();
      if (Date.now() - lastRequestAt > 30000) scheduleLoad();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearFallback();
      if (requestTimer) clearTimeout(requestTimer);
      unsubscribe();
      unsubscribeStatus();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

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
    </div>
  );
}
