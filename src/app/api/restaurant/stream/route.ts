// Node.js runtime — required so auth() can be called to verify restaurantId.
// Trade-off vs Edge: this SSE connection ties up a Node.js thread per connected
// staff client. Acceptable at v1 scale (<10 restaurants). Migrate to a signed
// httpOnly cookie pattern at 5+ restaurants for Edge compatibility.

import { auth } from '@/lib/auth';
import { createSupabaseClient } from '@/lib/supabase';
import { z } from 'zod';

const uuidSchema = z.string().uuid();

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.restaurantId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { searchParams } = new URL(request.url);
  const restaurantId = searchParams.get('restaurantId');

  if (!restaurantId || !uuidSchema.safeParse(restaurantId).success) {
    return new Response(JSON.stringify({ error: 'Invalid restaurantId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // CRITICAL: verify authenticated user owns the requested restaurant channel.
  // Without this check any staff member from any restaurant could subscribe to
  // any other restaurant's real-time feed.
  if (session.user.restaurantId !== restaurantId) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const sendEvent = (eventName: string, data: unknown) => {
    const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(payload)).catch(() => {
      // Stream already closed
    });
  };

  const supabase = createSupabaseClient();

  sendEvent('connected', { restaurantId });

  // Note: order_items has no restaurant_id column — the KDS subscribes to
  // order updates per-session via /api/sessions/[sessionId]/stream instead.
  // This channel covers session, service request, and table state changes.
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
    .subscribe();

  request.signal.addEventListener('abort', () => {
    supabase.removeChannel(channel);
    writer.close().catch(() => {
      // Already closed
    });
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
