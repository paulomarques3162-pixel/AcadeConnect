import { useEffect, useRef, useState } from 'react';
import { conversationApi } from '../api/services';

/**
 * Conversa "ao vivo" sem reload: polling inteligente (pausa em aba inativa),
 * marcação de leitura e scroll inteligente (só desce se o usuário já está no fim).
 */
export function useLiveConversation(conversationId, { intervalMs = 5000 } = {}) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(false);
  const threadRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const onScroll = () => {
    const el = threadRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const fetchOnce = async () => {
    try {
      const res = await conversationApi.get(conversationId);
      setConversation(res.data?.conversation || null);
    } catch {
      /* mantém o estado atual */
    }
  };

  useEffect(() => {
    if (!conversationId) { setConversation(null); return undefined; }
    let active = true;
    setLoading(true);
    conversationApi.get(conversationId)
      .then((res) => { if (active) setConversation(res.data?.conversation || null); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return; // pausa polling em aba inativa
      if (active) fetchOnce();
    }, intervalMs);
    return () => { active = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, intervalMs]);

  // Scroll inteligente: só força o fim quando o usuário já estava no fim.
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [conversation]);

  const markRead = () => {
    if (conversationId) conversationApi.markRead(conversationId).catch(() => {});
  };
  const reload = () => fetchOnce();

  return { conversation, loading, threadRef, onScroll, markRead, reload };
}
