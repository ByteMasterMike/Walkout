'use client';

import { useEffect } from 'react';

/**
 * Registers `public/sw.js` once. Production-only per Phase 6 plan (push + offline menu cache).
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore registration failures */
    });
  }, []);

  return null;
}
