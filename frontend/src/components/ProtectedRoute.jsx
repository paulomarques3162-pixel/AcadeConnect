import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui';

export function ProtectedRoute({ roles }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <div className="route-loading"><Spinner text="Verificando sessão..." /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={user.role === 'ADMIN' || user.role === 'ORGANIZER' ? '/admin' : '/minha-area'} replace />;
  return <Outlet />;
}
