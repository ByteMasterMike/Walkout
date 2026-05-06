'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes — PRD §11.5
const TICK_INTERVAL_MS = 30_000;

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'scroll',
  'click',
];

/**
 * Tracks user inactivity. Returns isIdle=true after IDLE_THRESHOLD_MS of no
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
    function onActivity() {
      lastActivityRef.current = Date.now();
      if (isIdle) setIsIdle(false);
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_THRESHOLD_MS) {
        setIsIdle(true);
      }
    }, TICK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, [isIdle]);

  return { isIdle, resetIdle };
}
