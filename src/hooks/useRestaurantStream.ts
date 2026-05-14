'use client'

import { useEffect, useRef, useCallback } from 'react'

export type RestaurantStreamEvent =
  | { type: 'connected'; restaurantId: string }
  | { type: 'session_update'; payload: unknown }
  | { type: 'order_update'; payload: unknown }
  | { type: 'service_request_update'; payload: unknown }
  | { type: 'table_update'; payload: unknown }

interface UseRestaurantStreamOptions {
  restaurantId: string
  onEvent: (event: RestaurantStreamEvent) => void
  /** Called when the SSE connection drops; the hook auto-reconnects after a delay. */
  onReconnect?: () => void
  enabled?: boolean
}

/**
 * Connects to /api/restaurant/stream over SSE.
 * On error or disconnect, triggers onReconnect then reconnects per PRD §10.4.
 */
export function useRestaurantStream({
  restaurantId,
  onEvent,
  onReconnect,
  enabled = true,
}: UseRestaurantStreamOptions) {
  const esRef = useRef<EventSource | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelayRef = useRef(1000)

  const connect = useCallback(() => {
    if (!enabled || !restaurantId) return

    const url = `/api/restaurant/stream?restaurantId=${encodeURIComponent(restaurantId)}`
    const es = new EventSource(url)
    esRef.current = es

    const handleEvent = (eventName: string) => (e: MessageEvent) => {
      retryDelayRef.current = 1000
      try {
        const data = JSON.parse(e.data) as unknown
        onEvent({ type: eventName, payload: data } as RestaurantStreamEvent)
      } catch {
        // Malformed payload — ignore
      }
    }

    es.addEventListener('connected', (e: MessageEvent) => {
      retryDelayRef.current = 1000
      try {
        const data = JSON.parse(e.data) as { restaurantId: string }
        onEvent({ type: 'connected', restaurantId: data.restaurantId })
      } catch {
        // Malformed payload — ignore
      }
    })
    es.addEventListener('session_update', handleEvent('session_update'))
    es.addEventListener('order_update', handleEvent('order_update'))
    es.addEventListener('service_request_update', handleEvent('service_request_update'))
    es.addEventListener('table_update', handleEvent('table_update'))

    es.onerror = () => {
      es.close()
      esRef.current = null

      onReconnect?.()

      const delay = Math.min(retryDelayRef.current, 30_000)
      retryDelayRef.current = Math.min(delay * 2, 30_000)

      retryTimeoutRef.current = setTimeout(connect, delay)
    }
  }, [enabled, restaurantId, onEvent, onReconnect])

  useEffect(() => {
    connect()

    // PRD §10.4: re-establish SSE when tab returns to visible after backgrounding.
    // Staff tablets that lock during service must not miss order or service request
    // events when they return to the KDS or floor dashboard.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        esRef.current?.close()
        esRef.current = null
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
        retryDelayRef.current = 1000
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      esRef.current?.close()
      esRef.current = null
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [connect])
}
