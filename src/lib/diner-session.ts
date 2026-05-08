import type { Session } from 'next-auth';

/** Returns diner id when the session is a logged-in diner; otherwise null. */
export function getDinerIdFromSession(session: Session | null): string | null {
  if (!session?.user?.dinerId || session.user.role !== 'DINER') return null;
  return session.user.dinerId;
}
