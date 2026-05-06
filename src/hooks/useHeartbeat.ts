'use client';

import { useEffect, useRef } from 'react';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Sends a heartbeat ping every 30 seconds so the cron can detect idle sessions.
 * Also pings immediately when the page becomes visible again after being backgrounded
 * (covers mobile tab-switching — PRD §10.4).
 */
export function useHeartbeat(sessionId: string | null, participantId: string | null) {
  const sessionIdRef = useRef(sessionId);
  const participantIdRef = useRef(participantId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    participantIdRef.current = participantId;
  }, [sessionId, participantId]);

  useEffect(() => {
    if (!sessionId || !participantId) return;

    const anonToken =
      typeof document !== 'undefined'
        ? document.cookie
            .split('; ')
            .find((c) => c.startsWith('tabs_anon='))
            ?.split('=')[1] ?? null
        : null;

    async function ping() {
      const sid = sessionIdRef.current;
      const pid = participantIdRef.current;
      if (!sid || !pid) return;

      try {
        await fetch(`/api/sessions/${sid}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(anonToken ? { 'x-anon-token': anonToken } : {}),
          },
          body: JSON.stringify({ participantId: pid }),
        });
      } catch {
        // Network errors are silent — the cron handles recovery
      }
    }

    ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        ping();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId, participantId]);
}
