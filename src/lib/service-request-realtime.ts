/**
 * Supabase Realtime postgres_changes payloads may use camelCase or snake_case keys.
 * Used to detect when a new OPEN service request appears (staff chime).
 */
export function isNewOpenServiceRequestPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;

  const eventType = (p.eventType ?? p.event_type) as string | undefined;
  const rowNew = p.new ?? p.record;
  if (typeof rowNew !== 'object' || rowNew === null) return false;
  const nextStatus = (rowNew as Record<string, unknown>).status;
  if (nextStatus !== 'OPEN') return false;

  if (eventType === 'INSERT') return true;

  if (eventType === 'UPDATE') {
    const rowOld = p.old ?? p.old_record;
    if (typeof rowOld !== 'object' || rowOld === null) return true;
    return (rowOld as Record<string, unknown>).status !== 'OPEN';
  }

  return false;
}

export function isChimeEnabledFromStorage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('walkout_chime_enabled') !== 'false';
}
