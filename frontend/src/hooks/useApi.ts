import { useCallback, useEffect, useRef, useState } from "react";

interface UseApiOptions {
  /** Auto-refetch interval in ms. Pass 0 to disable polling. Default 30s. */
  intervalMs?: number;
  /** When false, the hook stays idle (no fetch). Default true. */
  enabled?: boolean;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
}

/**
 * Generic data-fetching hook: loading / error / data state, an auto-refetch
 * interval (30s by default), and a manual `refetch()` trigger.
 *
 * The fetcher is held in a ref so passing an inline arrow function doesn't
 * restart the polling interval on every render.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const { intervalMs = 30000, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) return;
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }
    refetch();
    if (!intervalMs) return () => void (mounted.current = false);

    const id = setInterval(refetch, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [enabled, intervalMs, refetch]);

  return { data, loading, error, lastUpdated, refetch };
}
