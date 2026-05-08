'use client';

import { useEffect, useRef } from 'react';

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Sends a heartbeat ping every 30 seconds so the cron can detect idle sessions.
 * Also pings immediately when the page becomes visible again after being backgrounded
 * (covers mobile tab-switching — PRD §10.4).
 *
 * `tabs_anon` is httpOnly — middleware copies it to `x-anon-token` on `/api/sessions/*`;
 * the browser sends the cookie on same-origin fetch without JS reading it.
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

    async function ping() {
      const sid = sessionIdRef.current;
      const pid = participantIdRef.current;
      if (!sid || !pid) return;

      try {
        await fetch(`/api/sessions/${sid}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ participantId: pid }),
        });
      } catch {
        // Network errors are silent — the cron handles recovery
      }
    }

    void ping();
    const interval = setInterval(() => void ping(), HEARTBEAT_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void ping();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionId, participantId]);
}
