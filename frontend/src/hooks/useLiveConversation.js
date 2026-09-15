import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationApi } from '../api/services';
import { subscribeRealtime, subscribeRealtimeState, isRealtimeConnected } from '../api/realtime';

// While SSE is healthy the periodic refresh is a pure safety net (the SSE event
// already updates the thread instantly), so it is deliberately slow.
const SSE_MIN_INTERVAL = 120000;
const SSE_MAX_INTERVAL = 600000;
// If the stream drops, fall back to the adaptive incremental polling.
const FALLBACK_MIN_INTERVAL = 5000;
const FALLBACK_MAX_INTERVAL = 60000;

/**
 * Conversa "ao vivo" sem reload (V9.1).
 *
 * V9 already fetched incrementally and backed off, but it kept polling every
 * 5-60s even with a healthy SSE connection — 100 open conversations meant ~100
 * requests/minute just to ask "is there anything new?".
 *
 * V9.1:
 *  - reacts to the shared SSE stream (instant update for the open thread);
 *  - polls ONLY as a safety net, and only aggressively when SSE is DOWN
 *    (5s → 60s backoff). With SSE up it relaxes to 120s → 600s;
 *  - pauses entirely while the tab is hidden and catches up on visibility;
 *  - never issues overlapping requests: the SSE trigger and the timer share a
 *    single in-flight guard;
 *  - cancels timers and listeners on unmount.
 */
export function useLiveConversation(conversationId, { intervalMs = FALLBACK_MIN_INTERVAL } = {}) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastAtRef = useRef(null);
  const timerRef = useRef(null);
  const delayRef = useRef(intervalMs);
  const busyRef = useRef(false);
  const connectedRef = useRef(isRealtimeConnected());

  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /** Merge only messages we have not seen yet (de-dup by id). */
  const applyMessages = useCallback((incoming) => {
    if (!incoming || incoming.length === 0) return;
    setConversation((prev) => {
      if (!prev) return prev;
      const seen = new Set((prev.messages || []).map((m) => m.id));
      const merged = (prev.messages || []).slice();
      let added = 0;
      for (const m of incoming) {
        if (!seen.has(m.id)) {
          merged.push(m);
          seen.add(m.id);
          added += 1;
        }
      }
      if (added === 0) return prev; // no re-render when nothing changed
      merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return {
        ...prev,
        messages: merged,
        lastMessageAt: merged[merged.length - 1]?.createdAt || prev.lastMessageAt,
      };
    });
    lastAtRef.current = incoming[incoming.length - 1].createdAt;
  }, []);

  const fetchInitial = useCallback(async () => {
    const res = await conversationApi.get(conversationId);
    const conv = res.data?.conversation || null;
    setConversation(conv);
    lastAtRef.current = conv?.messages?.length ? conv.messages[conv.messages.length - 1].createdAt : null;
    return conv;
  }, [conversationId]);

  const fetchIncremental = useCallback(async () => {
    if (!lastAtRef.current) {
      await fetchInitial();
      return 0;
    }
    const res = await conversationApi.messagesSince(conversationId, lastAtRef.current);
    const msgs = res.data?.messages || [];
    if (msgs.length) applyMessages(msgs);
    const meta = res.data?.conversation;
    if (meta) {
      setConversation((prev) => (prev ? { ...prev, status: meta.status, lastMessageAt: meta.lastMessageAt } : prev));
    }
    return msgs.length;
  }, [conversationId, fetchInitial, applyMessages]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    lastAtRef.current = null;
    busyRef.current = false;

    const minInterval = () => (connectedRef.current ? SSE_MIN_INTERVAL : intervalMs);
    const maxInterval = () => (connectedRef.current ? SSE_MAX_INTERVAL : FALLBACK_MAX_INTERVAL);
    delayRef.current = minInterval();

    let tick;
    const schedule = (delay) => {
      if (cancelled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(tick, delay);
    };

    /** Run one incremental refresh, never overlapping another. */
    const runRefresh = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        const newCount = await fetchIncremental();
        delayRef.current = newCount > 0 ? minInterval() : Math.min(delayRef.current * 2, maxInterval());
      } catch {
        delayRef.current = Math.min(delayRef.current * 2, maxInterval());
      } finally {
        busyRef.current = false;
      }
    };

    tick = async () => {
      if (cancelled) return;
      // Pause polling entirely while the tab is in the background.
      if (typeof document !== 'undefined' && document.hidden) {
        schedule(minInterval());
        return;
      }
      await runRefresh();
      schedule(delayRef.current);
    };

    fetchInitial()
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    schedule(minInterval());

    // Instant update when the server pushes a message for this conversation.
    // `runRefresh` shares the in-flight guard with the timer, so a burst of
    // events can never stack requests.
    const unsubscribe = subscribeRealtime((evt) => {
      if (evt?.type === 'message' && evt.conversationId === conversationId) {
        delayRef.current = minInterval();
        if (timerRef.current) clearTimeout(timerRef.current);
        runRefresh().finally(() => schedule(delayRef.current));
      }
    });

    // Adapt the cadence to the stream health instead of always polling fast.
    const unsubscribeState = subscribeRealtimeState((isConnected) => {
      connectedRef.current = isConnected;
      delayRef.current = minInterval();
      if (isConnected) {
        // Just reconnected: catch up on anything missed while offline.
        runRefresh().finally(() => schedule(delayRef.current));
      }
    });

    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        delayRef.current = minInterval();
        runRefresh().finally(() => schedule(delayRef.current));
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      unsubscribe();
      unsubscribeState();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversationId, intervalMs, fetchInitial, fetchIncremental]);

  // Scroll inteligente: só força o fim quando o usuário já estava no fim.
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [conversation]);

  const markRead = () => {
    if (conversationId) conversationApi.markRead(conversationId).catch(() => {});
  };
  const reload = () => fetchIncremental().catch(() => {});

  return { conversation, loading, threadRef, onScroll, markRead, reload };
}
