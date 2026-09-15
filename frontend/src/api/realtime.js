import { api, unwrap, API_BASE_URL } from './client.js';

/**
 * Singleton Server-Sent Events client.
 *
 * One shared connection per browser tab. Components subscribe to the same
 * connection instead of opening their own streams or polling independently.
 * Consumers can also subscribe to connection state so their HTTP fallback
 * polling runs ONLY while SSE is unavailable.
 */
const listeners = new Set();
const statusListeners = new Set();
let es = null;
let connecting = false;
let reconnectTimer = null;
let attempts = 0;
let connected = false;

function notifyStatus(next) {
  if (connected === next) return;
  connected = next;
  for (const handler of statusListeners) {
    try { handler(connected); } catch { /* isolate listener errors */ }
  }
}

function scheduleReconnect() {
  if (reconnectTimer || typeof window === 'undefined' || listeners.size === 0) return;
  const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempts, 4));
  attempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function connect() {
  if (connecting || es || typeof window === 'undefined' || listeners.size === 0) return;
  connecting = true;
  try {
    const res = await api.post('/realtime/token').then(unwrap);
    const token = res?.data?.token;
    if (!token) throw new Error('no stream token');

    const base = API_BASE_URL.replace(/\/$/, '');
    const source = new EventSource(`${base}/realtime/stream?token=${encodeURIComponent(token)}`);
    es = source;

    source.onopen = () => {
      attempts = 0;
      notifyStatus(true);
    };

    source.onmessage = (e) => {
      let evt;
      try { evt = JSON.parse(e.data); } catch { return; }
      for (const handler of listeners) {
        try { handler(evt); } catch { /* isolate listener errors */ }
      }
    };

    source.onerror = () => {
      if (es === source) es = null;
      try { source.close(); } catch { /* ignore */ }
      notifyStatus(false);
      scheduleReconnect();
    };
  } catch {
    notifyStatus(false);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

/** Subscribe to realtime events. Returns an unsubscribe function. */
export function subscribeRealtime(handler) {
  listeners.add(handler);
  if (connected) {
    try { handler({ type: 'connected' }); } catch { /* isolate listener errors */ }
  }
  connect();
  return () => {
    listeners.delete(handler);
    if (listeners.size === 0) closeRealtime();
  };
}

/** Subscribe to SSE connection state. Callback receives true/false. */
export function subscribeRealtimeStatus(handler) {
  statusListeners.add(handler);
  try { handler(connected); } catch { /* isolate listener errors */ }
  return () => statusListeners.delete(handler);
}

export function isRealtimeConnected() {
  return connected;
}

export function closeRealtime() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (es) {
    try { es.close(); } catch { /* ignore */ }
    es = null;
  }
  attempts = 0;
  notifyStatus(false);
}
