import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { useChat } from '../lib/chat-context';

export interface ContextUsage {
  used: number;
  limit: number;
  threshold: number;
}

export function computeContextMetrics(usage: ContextUsage | null) {
  if (!usage || usage.limit <= 0) return null;
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const over = usage.threshold > 0 && usage.used >= usage.threshold;
  const near = !over && usage.threshold > 0 && usage.used >= usage.threshold * 0.85;
  const fill = over ? 'bg-red-500' : near ? 'bg-amber-500' : 'bg-accent';
  const label = over ? 'text-red-400' : near ? 'text-amber-400' : '';
  return { pct, over, near, fill, label };
}

/**
 * Context-usage bar reflecting the estimated tokens used for the opened session
 * versus its context window; turns amber near the auto-compact threshold, red past it.
 */
export default function ContextBar({
  streaming: propStreaming,
  sessionId: propSessionId,
  className = '',
}: {
  streaming?: boolean;
  sessionId?: string | null;
  className?: string;
} = {}) {
  const chat = useChat();
  const streaming = propStreaming ?? chat.streaming;
  const sessionId = propSessionId !== undefined ? propSessionId : chat.activeSessionId;

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

  const metrics = computeContextMetrics(usage);
  if (!metrics || !usage) return null;

  const { pct, fill, label } = metrics;

  return (
    <div
      className={`font-mono text-[10px] text-txt-3 ${className}`}
      title={`Context ~${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} tokens`}
    >
      <div className="flex items-center justify-between pb-1">
        <span>Session context</span>
        <span className={label}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-4">
        <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[9px] text-txt-3">
        <span>{usage.used.toLocaleString()} tokens</span>
        <span>{usage.limit.toLocaleString()} max</span>
      </div>
    </div>
  );
}
