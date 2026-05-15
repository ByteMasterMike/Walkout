'use client';

import { useCallback } from 'react';

import { tryPlayServiceRequestChime } from '@/lib/playServiceRequestChime';
import { isChimeEnabledFromStorage, isNewOpenServiceRequestPayload } from '@/lib/service-request-realtime';
import { useRestaurantStream, type RestaurantStreamEvent } from '@/hooks/useRestaurantStream';

type StaffRole = 'ADMIN' | 'MANAGER' | 'STAFF';

/**
 * Subscribes to restaurant SSE anywhere under the dashboard and plays the service-request
 * chime when a new OPEN row appears, honoring `walkout_chime_enabled` in localStorage.
 */
export default function GlobalServiceRequestChime({
  restaurantId,
  role,
}: {
  restaurantId: string;
  role: StaffRole;
}) {
  const enabled = Boolean(restaurantId) && ['ADMIN', 'MANAGER', 'STAFF'].includes(role);

  const onEvent = useCallback((event: RestaurantStreamEvent) => {
    if (event.type !== 'service_request_update') return;
    if (!isNewOpenServiceRequestPayload(event.payload)) return;
    if (!isChimeEnabledFromStorage()) return;
    try {
      tryPlayServiceRequestChime();
    } catch {
      /* AudioContext may be blocked before user gesture */
    }
  }, []);

  useRestaurantStream({
    restaurantId,
    onEvent,
    enabled,
  });

  return null;
}
