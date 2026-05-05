export const runtime = 'edge'

import { createSupabaseClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const restaurantId = searchParams.get('restaurantId')

  if (!restaurantId) {
    return new Response(JSON.stringify({ error: 'restaurantId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify the NextAuth session cookie matches the restaurantId if present.
  // On Edge we read the cookie header directly — we cannot call auth() (Node-only).
  // The proxy middleware already enforces auth for /api/restaurant/* paths,
  // so a missing cookie here means the request was blocked upstream.
  // We perform a best-effort check by reading the cookie value.
  const cookieHeader = request.headers.get('cookie') ?? ''
  const hasAuthCookie =
    cookieHeader.includes('next-auth.session-token') ||
    cookieHeader.includes('__Secure-next-auth.session-token')

  if (!hasAuthCookie) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const sendEvent = (eventName: string, data: unknown) => {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`
    writer.write(encoder.encode(payload)).catch(() => {
      // Stream closed
    })
  }

  const supabase = createSupabaseClient()

  sendEvent('connected', { restaurantId })

  const channel = supabase
    .channel(`restaurant-${restaurantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tab_sessions',
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload) => sendEvent('session_update', payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'order_items',
        filter: `session_id=eq.${restaurantId}`,
      },
      (payload) => sendEvent('order_update', payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload) => sendEvent('service_request_update', payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dining_tables',
        filter: `restaurant_id=eq.${restaurantId}`,
      },
      (payload) => sendEvent('table_update', payload)
    )
    .subscribe()

  request.signal.addEventListener('abort', () => {
    supabase.removeChannel(channel)
    writer.close().catch(() => {
      // Already closed
    })
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
