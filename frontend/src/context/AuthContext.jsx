import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { authApi } from '../api/services';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('acadeconnect_user') || 'null');
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('acadeconnect_token') || null);
  const [initializing, setInitializing] = useState(() => Boolean(localStorage.getItem('acadeconnect_token')));
  // V9.1: a burst of 403s (several parallel admin requests with an outdated
  // role) used to fire one /auth/me per failed request. Revalidate at most once
  // every 30s.
  const lastForbiddenAtRef = useRef(0);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setToken(null);
      localStorage.removeItem('acadeconnect_user');
      localStorage.removeItem('acadeconnect_token');
    };
    // Um 403 significa que o papel real (no banco) é menor do que o papel
    // guardado em localStorage. Revalidamos a sessão para que a interface
    // reflita o papel verdadeiro em vez de mostrar telas que a API recusa.
    const onForbidden = () => {
      const now = Date.now();
      if (now - lastForbiddenAtRef.current < 30_000) return;
      lastForbiddenAtRef.current = now;
      authApi
        .me()
        .then((res) => {
          setUser(res.data.user);
          localStorage.setItem('acadeconnect_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          /* 401 já é tratado acima */
        });
    };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    window.addEventListener('auth:forbidden', onForbidden);
    return () => {
      window.removeEventListener('auth:unauthorized', onUnauthorized);
      window.removeEventListener('auth:forbidden', onForbidden);
    };
  }, []);

  // Restore session on load.
  useEffect(() => {
    if (initializing) {
      authApi
        .me()
        .then((res) => {
          setUser(res.data.user);
          localStorage.setItem('acadeconnect_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          setUser(null);
          setToken(null);
          localStorage.removeItem('acadeconnect_user');
          localStorage.removeItem('acadeconnect_token');
        })
        .finally(() => setInitializing(false));
    }
  }, [initializing]);

  const applyAuth = useCallback((res) => {
    setToken(res.data.token);
    setUser(res.data.user);
    localStorage.setItem('acadeconnect_token', res.data.token);
    localStorage.setItem('acadeconnect_user', JSON.stringify(res.data.user));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    applyAuth(res);
    return res;
  }, [applyAuth]);

  const register = useCallback(async (data) => {
    const res = await authApi.register(data);
    applyAuth(res);
    return res;
  }, [applyAuth]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('acadeconnect_user');
    localStorage.removeItem('acadeconnect_token');
  }, []);

  const updateUser = useCallback((u) => {
    setUser(u);
    localStorage.setItem('acadeconnect_user', JSON.stringify(u));
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isOrganizer = user?.role === 'ORGANIZER';
  const isStaff = isAdmin || isOrganizer;

  return (
    <AuthContext.Provider value={{ user, token, initializing, login, register, logout, updateUser, isAdmin, isOrganizer, isStaff }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
