import { useCallback, useEffect, useRef, useState } from 'react';

export function useReadOnlyData<T>(fetchData: (signal: AbortSignal, previous: T | null) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const saved = useRef<T | null>(null);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchData(controller.signal, saved.current);
      if (!controller.signal.aborted) {
        saved.current = result;
        setData(result);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Failed to load history');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    void refresh();
    return () => request.current?.abort();
  }, [refresh]);

  return { data, loading, error, refresh };
}
