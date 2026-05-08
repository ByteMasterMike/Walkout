'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes — PRD §11.5
const DEFAULT_TICK_INTERVAL_MS = 30_000;

/** Optional override for QA (set NEXT_PUBLIC_IDLE_WARNING_MS in .env.local, e.g. 6000). */
function idleThresholdMs(): number {
  const raw = process.env.NEXT_PUBLIC_IDLE_WARNING_MS;
  if (!raw) return DEFAULT_IDLE_THRESHOLD_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IDLE_THRESHOLD_MS;
}

function tickIntervalMs(): number {
  const raw = process.env.NEXT_PUBLIC_IDLE_TICK_MS;
  if (!raw) return DEFAULT_TICK_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1000 ? n : DEFAULT_TICK_INTERVAL_MS;
}

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
];

/**
 * Tracks user inactivity. Returns isIdle=true after idleThresholdMs of no
 * mouse/keyboard/touch events. Consumers render an idle warning toast.
 *
 * resetIdle() is exposed so the toast itself can dismiss on user action.
 */
export function useIdleWarning(): { isIdle: boolean; resetIdle: () => void } {
  const [isIdle, setIsIdle] = useState(false);
  const lastActivityRef = useRef(Date.now());

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIsIdle(false);
  }, []);

  useEffect(() => {
    const threshold = idleThresholdMs();
    const tick = tickIntervalMs();

    function onActivity() {
      lastActivityRef.current = Date.now();
      setIsIdle((was) => (was ? false : was));
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= threshold) {
        setIsIdle(true);
      }
    }, tick);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, []);

  return { isIdle, resetIdle };
}
