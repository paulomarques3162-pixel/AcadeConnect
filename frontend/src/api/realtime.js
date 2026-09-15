import { api, unwrap, API_BASE_URL } from './client.js';

/**
 * Singleton Server-Sent Events client (V9.1).
 *
 * One shared connection per browser tab (instead of one per component), used by
 * the header bell, the sidebar message badge and the conversation thread. This
 * is what removes the recurring polling traffic.
 *
 * V9.1 additions:
 *  - exposes the connection STATE (`subscribeRealtimeState` / `isRealtimeConnected`)
 *    so the live-conversation hook only falls back to polling when the stream is
 *    actually down, instead of polling "just in case" while SSE is healthy;
 *  - listeners never stack: components subscribe to the same dispatcher and are
 *    removed on unmount.
 *
 * If SSE is unavailable (proxy strips it, backend restarts...), the connection
 * retries with exponential backoff and the components keep their (now slower and
 * incremental) polling fallback, so the UI is never wrong — only slightly less
 * instant.
 */

const listeners = new Set();
const stateListeners = new Set();
let es = null;
let connecting = false;
let reconnectTimer = null;
let attempts = 0;
let connected = false;

function setConnected(value) {
  if (connected === value) return;
  connected = value;
  for (const handler of stateListeners) {
    try { handler(connected); } catch { /* isolate listener errors */ }
  }
}

function scheduleReconnect() {
  if (reconnectTimer || typeof window === 'undefined') return;
  const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempts, 4));
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function connect() {
  if (connecting || es || typeof window === 'undefined') return;
  connecting = true;
  try {
    const res = await api.post('/realtime/token').then(unwrap);
    const token = res?.data?.token;
    if (!token) throw new Error('no stream token');

    const base = API_BASE_URL.replace(/\/$/, '');
    es = new EventSource(`${base}/realtime/stream?token=${encodeURIComponent(token)}`);

    es.onopen = () => {
      attempts = 0;
      setConnected(true);
    };
    es.onmessage = (e) => {
      let evt;
      try { evt = JSON.parse(e.data); } catch { return; }
      for (const handler of listeners) {
        try { handler(evt); } catch { /* isolate listener errors */ }
      }
    };
    es.onerror = () => {
      try { es.close(); } catch { /* ignore */ }
      es = null;
      setConnected(false);
      scheduleReconnect();
    };
  } catch {
    setConnected(false);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

/**
 * Subscribe to realtime events. Returns an unsubscribe function.
 * Opens the shared connection on the first subscriber.
 */
export function subscribeRealtime(handler) {
  listeners.add(handler);
  connect();
  return () => {
    listeners.delete(handler);
    if (listeners.size === 0) closeRealtime();
  };
}

/** True while the shared SSE stream is open. */
export function isRealtimeConnected() {
  return connected;
}

/**
 * Observe the connection state. The handler is called immediately with the
 * current value and then on every change. Returns an unsubscribe function.
 */
export function subscribeRealtimeState(handler) {
  stateListeners.add(handler);
  try { handler(connected); } catch { /* ignore */ }
  return () => stateListeners.delete(handler);
}

export function closeRealtime() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (es) {
    try { es.close(); } catch { /* ignore */ }
    es = null;
  }
  attempts = 0;
  setConnected(false);
}
