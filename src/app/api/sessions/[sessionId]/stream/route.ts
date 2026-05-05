export const runtime = 'edge'

import { createSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'

const uuidSchema = z.string().uuid()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  if (!uuidSchema.safeParse(sessionId).success) {
    return new Response(JSON.stringify({ error: 'Invalid sessionId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Verify participant membership via Supabase directly (no Prisma on Edge)
  const anonToken = request.headers.get('x-anon-token')
  if (!anonToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createSupabaseClient()

  const { data: participant, error } = await supabase
    .from('tab_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('anon_token', anonToken)
    .maybeSingle()

  if (error || !participant) {
    return new Response(JSON.stringify({ error: 'Participant not found in session' }), {
      status: 403,
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

  // Send initial connected event
  sendEvent('connected', { sessionId })

  const channel = supabase
    .channel(`session-${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tab_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => sendEvent('session_update', payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'order_items',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => sendEvent('order_update', payload)
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'service_requests',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => sendEvent('service_request_update', payload)
    )
    .subscribe()

  // Close channel when client disconnects
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
