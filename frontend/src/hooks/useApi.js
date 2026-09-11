import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Small data-fetching hook with loading / error / data states.
 * @param {() => Promise} fetcher - async function returning unwrapped response
 * @param {any[]} deps - re-run when these change
 */
export function useApi(fetcher, deps = [], { immediate = true, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current(...args);
      setData(res);
      return res;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!immediate) return;
    let active = true;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((res) => active && setData(res))
      .catch((e) => active && setError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, setData, run, reload: run };
}
