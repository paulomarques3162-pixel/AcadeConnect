import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { bootstrapApi, conversationApi, notificationApi } from '../api/services';
import { subscribeRealtime, subscribeRealtimeState } from '../api/realtime';
import { useAuth } from './AuthContext';

/**
 * V9.1 — Central live-data store.
 *
 * Problem in V9: the SAME SSE event made three different components issue three
 * HTTP requests (Header -> /notifications, DashboardLayout -> /unread-count,
 * useLiveConversation -> /messages). With hundreds of connected users every
 * message produced a small request storm.
 *
 * V9.1 keeps ONE subscription per tab and ONE owner of the two counters:
 *   - `notification` events carry the created notification, so the bell is
 *     updated locally (prepend + increment) with ZERO HTTP calls;
 *   - `message` / `conversation` events carry the fresh unread count when the
 *     backend can provide it (single-user conversations), so the sidebar badge
 *     is also updated with zero HTTP calls;
 *   - when the count is not embedded, a single DEBOUNCED refresh is scheduled —
 *     a burst of 20 events still produces one request, not twenty;
 *   - the only periodic traffic is a slow (5 min) safety net and a staleness
 *     check when the tab regains focus.
 */

const LiveDataContext = createContext(null);

const NOTIF_TTL = 60_000; // don't re-fetch the bell list more than once a minute
const UNREAD_TTL = 60_000; // same for the sidebar badge
const FOCUS_TTL = 120_000; // on focus, refresh only if older than this
const SAFETY_INTERVAL = 300_000; // absolute safety net while the tab is visible
const BURST_DEBOUNCE = 1_500; // coalesce a burst of SSE events into one request

export function LiveDataProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);

  const notifAtRef = useRef(0);
  const unreadAtRef = useRef(0);
  const notifInFlightRef = useRef(null);
  const unreadInFlightRef = useRef(null);
  const bootstrapInFlightRef = useRef(null);
  const burstTimerRef = useRef(null);
  const activeRef = useRef(true);

  const refreshNotifications = useCallback(
    ({ force = false } = {}) => {
      if (!user || !activeRef.current) return Promise.resolve();
      if (!force && Date.now() - notifAtRef.current < NOTIF_TTL) return Promise.resolve();
      if (notifInFlightRef.current) return notifInFlightRef.current;
      const promise = notificationApi
        .list({ limit: 8 })
        .then((res) => {
          if (!activeRef.current) return;
          notifAtRef.current = Date.now();
          setNotifications(res.data?.notifications || []);
          setUnreadNotifications(res.data?.unread || 0);
        })
        .catch(() => {})
        .finally(() => { notifInFlightRef.current = null; });
      notifInFlightRef.current = promise;
      return promise;
    },
    [user]
  );

  const refreshUnreadConversations = useCallback(
    ({ force = false } = {}) => {
      if (!user || !activeRef.current) return Promise.resolve();
      if (!force && Date.now() - unreadAtRef.current < UNREAD_TTL) return Promise.resolve();
      if (unreadInFlightRef.current) return unreadInFlightRef.current;
      const promise = conversationApi
        .unreadCount()
        .then((r) => {
          if (!activeRef.current) return;
          unreadAtRef.current = Date.now();
          setUnreadConversations(r.data?.unread || 0);
        })
        .catch(() => {})
        .finally(() => { unreadInFlightRef.current = null; });
      unreadInFlightRef.current = promise;
      return promise;
    },
    [user]
  );

  /**
   * V9.2: initialize the session with ONE request (/bootstrap) instead of the
   * notifications list + unread count pair that used to follow every login.
   * Falls back to the two individual endpoints if the aggregate is unavailable.
   */
  const loadInitial = useCallback(() => {
    if (!user || !activeRef.current) return Promise.resolve();
    if (bootstrapInFlightRef.current) return bootstrapInFlightRef.current;
    const promise = bootstrapApi
      .get()
      .then((res) => {
        if (!activeRef.current) return;
        const d = res.data || {};
        notifAtRef.current = Date.now();
        unreadAtRef.current = Date.now();
        setNotifications(d.notifications || []);
        setUnreadNotifications(d.unreadNotifications || 0);
        setUnreadConversations(d.unreadConversations || 0);
      })
      .catch(() => {
        refreshNotifications({ force: true });
        refreshUnreadConversations({ force: true });
      })
      .finally(() => { bootstrapInFlightRef.current = null; });
    bootstrapInFlightRef.current = promise;
    return promise;
  }, [user, refreshNotifications, refreshUnreadConversations]);

  /** One request for a whole burst of SSE events. */
  const scheduleUnreadRefresh = useCallback(() => {
    if (burstTimerRef.current) return;
    burstTimerRef.current = setTimeout(() => {
      burstTimerRef.current = null;
      refreshUnreadConversations({ force: true });
    }, BURST_DEBOUNCE);
  }, [refreshUnreadConversations]);

  const markNotificationRead = useCallback((id) => {
    let wasUnread = false;
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n;
        if (!n.read) wasUnread = true;
        return { ...n, read: true };
      })
    );
    if (wasUnread) setUnreadNotifications((c) => Math.max(0, c - 1));
    // Fire-and-forget; the 1s GET cache is invalidated by this POST.
    notificationApi.markRead(id).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadNotifications(0);
      setUnreadConversations(0);
      return undefined;
    }
    activeRef.current = true;
    // New session: one aggregate request for both counters.
    notifAtRef.current = 0;
    unreadAtRef.current = 0;
    loadInitial();

    const unsubscribe = subscribeRealtime((evt) => {
      if (!activeRef.current) return;
      if (evt?.type === 'notification') {
        const n = evt.notification;
        if (n?.id) {
          setNotifications((prev) => {
            if (prev.some((x) => x.id === n.id)) return prev;
            return [n, ...prev].slice(0, 8);
          });
          // The list already contains the newest item.
          notifAtRef.current = Date.now();
        }
        setUnreadNotifications((c) => c + 1);
      } else if (evt?.type === 'message' || evt?.type === 'conversation') {
        if (typeof evt.unread === 'number') {
          // Backend already told us the new count: no HTTP call at all.
          unreadAtRef.current = Date.now();
          setUnreadConversations(evt.unread);
        } else {
          scheduleUnreadRefresh();
        }
      }
    });

    const unsubscribeState = subscribeRealtimeState((value) => {
      if (!activeRef.current) return;
      setSseConnected(value);
      // After a reconnect, catch up once (counters may have moved while down).
      if (value) {
        refreshNotifications();
        refreshUnreadConversations();
      }
    });

    const onFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() - notifAtRef.current > FOCUS_TTL) refreshNotifications();
      if (Date.now() - unreadAtRef.current > FOCUS_TTL) refreshUnreadConversations();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);

    const safety = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      refreshNotifications();
      refreshUnreadConversations();
    }, SAFETY_INTERVAL);

    return () => {
      activeRef.current = false;
      unsubscribe();
      unsubscribeState();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
      clearInterval(safety);
      if (burstTimerRef.current) { clearTimeout(burstTimerRef.current); burstTimerRef.current = null; }
      notifInFlightRef.current = null;
      unreadInFlightRef.current = null;
      bootstrapInFlightRef.current = null;
    };
  }, [user, refreshNotifications, refreshUnreadConversations, scheduleUnreadRefresh, loadInitial]);

  const value = useMemo(
    () => ({
      notifications,
      unreadNotifications,
      unreadConversations,
      sseConnected,
      refreshNotifications,
      refreshUnreadConversations,
      markNotificationRead,
      setUnreadConversations,
    }),
    [
      notifications,
      unreadNotifications,
      unreadConversations,
      sseConnected,
      refreshNotifications,
      refreshUnreadConversations,
      markNotificationRead,
    ]
  );

  return <LiveDataContext.Provider value={value}>{children}</LiveDataContext.Provider>;
}

export function useLiveData() {
  const ctx = useContext(LiveDataContext);
  if (!ctx) throw new Error('useLiveData must be used inside <LiveDataProvider>');
  return ctx;
}
