'use client'

import { useEffect, useRef, useCallback } from 'react'

type SessionStreamEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'session_update'; payload: unknown }
  | { type: 'order_update'; payload: unknown }
  | { type: 'service_request_update'; payload: unknown }

interface UseSessionStreamOptions {
  sessionId: string
  onEvent: (event: SessionStreamEvent) => void
  /** Called when the SSE connection drops; the hook auto-reconnects after a delay. */
  onReconnect?: () => void
  enabled?: boolean
}

/**
 * Connects to /api/sessions/[sessionId]/stream over SSE.
 * On error or disconnect, it re-fetches the full session state (reconcile)
 * then reconnects per PRD §10.4.
 */
export function useSessionStream({
  sessionId,
  onEvent,
  onReconnect,
  enabled = true,
}: UseSessionStreamOptions) {
  const esRef = useRef<EventSource | null>(null)
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryDelayRef = useRef(1000)

  const connect = useCallback(() => {
    if (!enabled || !sessionId) return

    const es = new EventSource(`/api/sessions/${sessionId}/stream`)
    esRef.current = es

    const handleEvent = (eventName: string) => (e: MessageEvent) => {
      retryDelayRef.current = 1000
      try {
        const data = JSON.parse(e.data) as unknown
        onEvent({ type: eventName, payload: data } as SessionStreamEvent)
      } catch {
        // Malformed payload — ignore
      }
    }

    es.addEventListener('connected', (e: MessageEvent) => {
      retryDelayRef.current = 1000
      try {
        const data = JSON.parse(e.data) as { sessionId: string }
        onEvent({ type: 'connected', sessionId: data.sessionId })
      } catch {
        // Malformed payload — ignore
      }
    })
    es.addEventListener('session_update', handleEvent('session_update'))
    es.addEventListener('order_update', handleEvent('order_update'))
    es.addEventListener('service_request_update', handleEvent('service_request_update'))

    es.onerror = () => {
      es.close()
      esRef.current = null

      onReconnect?.()

      // Exponential backoff capped at 30s
      const delay = Math.min(retryDelayRef.current, 30_000)
      retryDelayRef.current = Math.min(delay * 2, 30_000)

      retryTimeoutRef.current = setTimeout(connect, delay)
    }
  }, [enabled, sessionId, onEvent, onReconnect])

  useEffect(() => {
    connect()
    return () => {
      esRef.current?.close()
      esRef.current = null
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current)
    }
  }, [connect])
}
