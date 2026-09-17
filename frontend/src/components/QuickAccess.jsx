import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MessagesSquare, Trophy, Compass, Zap, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLiveData } from '../context/LiveDataContext';

/**
 * Atalhos rápidos (formato balão/flutuante) para Notificações, Mensagens,
 * Sorteios e Explorar Eventos.
 *
 * Regras de design:
 *  - pequeno e discreto; começa recolhido para não cobrir botões, menus,
 *    formulários ou QR Codes;
 *  - usa as contagens já existentes no LiveDataContext (SSE + cache), então
 *    NÃO adiciona nenhum polling ou chamada de API nova;
 *  - respeita a safe-area de dispositivos móveis (env(safe-area-inset-*)).
 */
export function QuickAccess() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadNotifications, unreadConversations } = useLiveData();
  const [open, setOpen] = useState(false);

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };

  const items = [
    user && { key: 'notif', label: 'Notificações', to: '/notificacoes', icon: Bell, badge: unreadNotifications },
    user && { key: 'msg', label: 'Mensagens', to: '/comunicacao', icon: MessagesSquare, badge: unreadConversations },
    user && { key: 'raffles', label: 'Sorteios', to: '/sorteios', icon: Trophy },
    { key: 'events', label: 'Explorar Eventos', to: '/eventos', icon: Compass },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className={`quick-access ${open ? 'is-open' : ''}`}>
      {open && (
        <div className="quick-access__items" role="menu" aria-label="Atalhos rápidos">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className="quick-access__item"
              onClick={() => go(item.to)}
              aria-label={item.label}
              title={item.label}
            >
              <span className="quick-access__item-label">{item.label}</span>
              <span className="quick-access__item-icon">
                <item.icon size={18} />
                {item.badge > 0 && <span className="quick-access__badge">{item.badge > 99 ? '99+' : item.badge}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="quick-access__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Fechar atalhos rápidos' : 'Abrir atalhos rápidos'}
        title={open ? 'Fechar atalhos' : 'Atalhos rápidos'}
      >
        {open ? <X size={22} /> : <Zap size={22} />}
        {!open && (unreadNotifications + unreadConversations) > 0 && <span className="quick-access__dot" />}
      </button>
    </div>
  );
}
