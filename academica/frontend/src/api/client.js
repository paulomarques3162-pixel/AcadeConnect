import axios from 'axios';

// Vite proxies /api and /uploads to the backend in dev.
// Set VITE_API_URL to override (e.g. when frontend and backend are deployed separately).
const baseURL = import.meta.env.VITE_API_URL || '/api';

// Exposed so services can build absolute URLs (e.g. file downloads) that work
// whether the API is proxied at /api or hosted on another origin.
export const API_BASE_URL = baseURL;

export const api = axios.create({ baseURL, withCredentials: true });

// Attach JWT token from localStorage to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('acadeconnect_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear auth and redirect to login (unless already there).
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('acadeconnect_token');
      localStorage.removeItem('acadeconnect_user');
      if (!window.location.pathname.startsWith('/cadastro')) {
        // Avoid full reload loops on public pages; delegate to auth state.
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }
    // 403: o backend recusou por papel insuficiente (ADMIN/ORGANIZER).
    // Isso normalmente indica que o papel guardado no navegador está
    // desatualizado em relação ao banco. Avisamos a aplicação para
    // revalidar a sessão em /auth/me — sem afrouxar a proteção da API.
    if (error.response?.status === 403) {
      window.dispatchEvent(new CustomEvent('auth:forbidden'));
    }
    return Promise.reject(error);
  }
);

/** Normalize backend response envelopes into { data, meta, message }. */
export function unwrap(response) {
  return response.data;
}

/** Extract a friendly error message from an API error. */
export function getErrorMessage(error, fallback = 'Algo deu errado. Tente novamente.') {
  return error?.response?.data?.message || error?.message || fallback;
}
