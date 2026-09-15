import axios from 'axios';

// Vite proxies /api and /uploads to the backend in dev.
// Set VITE_API_URL to override (e.g. when frontend and backend are deployed separately).
const baseURL = import.meta.env.VITE_API_URL || '/api';

// Exposed so services can build absolute URLs (e.g. file downloads) that work
// whether the API is proxied at /api or hosted on another origin.
export const API_BASE_URL = baseURL;

export const api = axios.create({ baseURL, withCredentials: true });

// ---------------------------------------------------------------------------
// V9.1 — GET coalescing + very short cache.
//
// Several components frequently ask for the same resource at the same moment
// (two panels mounting together, a route change that remounts a layout, a
// burst of SSE events...). Instead of firing N identical HTTP requests we:
//   1. reuse the IN-FLIGHT promise (true de-duplication);
//   2. reuse a response that is less than GET_TTL_MS old.
// Any mutation (non-GET) invalidates the cache so writes are never stale.
// Pass `{ fresh: true }` (or `{ cache: false }`) to bypass it — used by the
// live endpoints that must always talk to the server.
// ---------------------------------------------------------------------------
const GET_TTL_MS = 1000;
const getCache = new Map(); // key -> { at, promise }
const getKey = (url, config) => `${url}?${JSON.stringify(config?.params || {})}`;

const rawGet = api.get.bind(api);
api.get = (url, config = {}) => {
  if (config.fresh === true || config.cache === false) return rawGet(url, config);
  const key = getKey(url, config);
  const hit = getCache.get(key);
  if (hit && Date.now() - hit.at < GET_TTL_MS) return hit.promise;
  const promise = rawGet(url, config);
  // Bound the map: entries older than the TTL are useless, and a long session
  // with many filter combinations must not grow it forever.
  if (getCache.size > 200) getCache.clear();
  getCache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (getCache.get(key)?.promise === promise) getCache.delete(key);
  });
  return promise;
};

/** Drop the whole short-lived GET cache (called after every mutation). */
export function invalidateGetCache() {
  getCache.clear();
}

// Attach JWT token from localStorage to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('acadeconnect_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear auth and redirect to login (unless already there).
api.interceptors.response.use(
  (res) => {
    // A write happened: whatever we cached is potentially stale now.
    if ((res.config?.method || 'get').toLowerCase() !== 'get') invalidateGetCache();
    return res;
  },
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
