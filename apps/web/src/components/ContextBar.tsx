import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

interface ContextUsage {
  used: number;
  limit: number;
  threshold: number;
}

/**
 * Small context-usage bar shown at the bottom-right of the chat. Reflects the
 * estimated tokens the manager sends for the opened session versus its context
 * window; turns amber near the auto-compact threshold, red past it.
 */
export default function ContextBar({ streaming, sessionId }: { streaming: boolean; sessionId: string | null }) {
  const [usage, setUsage] = useState<ContextUsage | null>(null);

  const refresh = useCallback(async (sid: string | null) => {
    try {
      const query = sid ? `?sessionId=${encodeURIComponent(sid)}` : '';
      setUsage(await apiRequest<ContextUsage>(`/chat/context${query}`));
    } catch {
      // keep the last reading — the bar just goes stale until the next turn
    }
  }, []);

  // Refresh on mount, when the opened chat changes, and whenever a turn finishes.
  useEffect(() => {
    if (!streaming) void refresh(sessionId);
  }, [streaming, sessionId, refresh]);

  if (!usage || usage.limit <= 0) return null;

  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const over = usage.threshold > 0 && usage.used >= usage.threshold;
  const near = !over && usage.threshold > 0 && usage.used >= usage.threshold * 0.85;
  const fill = over ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-accent';
  const label = over ? 'text-red-400' : near ? 'text-amber-400' : '';

  return (
    <div className="my-2 flex justify-end">
      <div
        className="w-40 font-mono text-[10px] text-txt-3"
        title={`Context ~${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens`}
      >
        <div className="mt-1 flex items-center justify-between">
          <span>context</span>
          <span className={label}>{pct}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-bg-4">
          <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
