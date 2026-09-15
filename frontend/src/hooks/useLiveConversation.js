import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationApi } from '../api/services';
import { subscribeRealtime, subscribeRealtimeStatus } from '../api/realtime';

const MIN_INTERVAL = 5000;
const MAX_INTERVAL = 60000;

/**
 * Conversa ao vivo sem reload.
 *
 * Enquanto o SSE está conectado, NÃO existe polling periódico da conversa.
 * O fallback incremental (5s -> 60s) só é ativado quando o SSE estiver
 * indisponível. Isso evita uma requisição HTTP por ciclo em cada conversa
 * aberta quando o realtime está saudável.
 */
export function useLiveConversation(conversationId, { intervalMs = MIN_INTERVAL } = {}) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const lastAtRef = useRef(null);
  const timerRef = useRef(null);
  const delayRef = useRef(intervalMs);
  const realtimeConnectedRef = useRef(false);
  const inFlightRef = useRef(false);

  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

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
      if (added === 0) return prev;
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
    lastAtRef.current = conv?.messages?.length
      ? conv.messages[conv.messages.length - 1].createdAt
      : null;
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
      setConversation((prev) => (prev
        ? { ...prev, status: meta.status, lastMessageAt: meta.lastMessageAt }
        : prev));
    }
    return msgs.length;
  }, [conversationId, fetchInitial, applyMessages]);

  const runFallbackTick = useCallback(async () => {
    if (realtimeConnectedRef.current || inFlightRef.current) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    inFlightRef.current = true;
    try {
      const newCount = await fetchIncremental();
      delayRef.current = newCount > 0
        ? intervalMs
        : Math.min(delayRef.current * 2, MAX_INTERVAL);
    } catch {
      delayRef.current = Math.min(delayRef.current * 2, MAX_INTERVAL);
    } finally {
      inFlightRef.current = false;
    }
  }, [fetchIncremental, intervalMs]);

  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      return undefined;
    }

    let cancelled = false;
    delayRef.current = intervalMs;
    realtimeConnectedRef.current = false;
    inFlightRef.current = false;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleFallback = (delay = delayRef.current) => {
      if (cancelled || realtimeConnectedRef.current || typeof document !== 'undefined' && document.hidden) return;
      clearTimer();
      timerRef.current = setTimeout(async () => {
        if (cancelled || realtimeConnectedRef.current) return;
        await runFallbackTick();
        if (!cancelled && !realtimeConnectedRef.current) scheduleFallback(delayRef.current);
      }, delay);
    };

    setLoading(true);
    lastAtRef.current = null;
    fetchInitial()
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    const unsubscribe = subscribeRealtime((evt) => {
      if (evt?.type === 'message' && evt.conversationId === conversationId) {
        // SSE is the primary transport. Fetch only the messages that arrived
        // after the last known timestamp; never start a recurring poll here.
        delayRef.current = intervalMs;
        if (!inFlightRef.current) {
          fetchIncremental().catch(() => {});
        }
      }
    });

    const unsubscribeStatus = subscribeRealtimeStatus((isConnected) => {
      realtimeConnectedRef.current = isConnected;
      if (isConnected) {
        clearTimer();
      } else if (!cancelled && !document.hidden) {
        scheduleFallback(intervalMs);
      }
    });

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        clearTimer();
        return;
      }
      // When returning to the tab, make one incremental consistency request
      // only if SSE is unavailable. With SSE connected there is nothing to poll.
      if (!realtimeConnectedRef.current && !inFlightRef.current) {
        runFallbackTick().finally(() => {
          if (!cancelled && !realtimeConnectedRef.current) scheduleFallback(delayRef.current);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimer();
      unsubscribe();
      unsubscribeStatus();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversationId, intervalMs, fetchInitial, fetchIncremental, runFallbackTick]);

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
