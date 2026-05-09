import webpush from 'web-push';

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:ops@walkoutofficial.com';
  if (!pub || !priv) {
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  /** Relative or absolute URL opened on notification click */
  url: string;
};

/**
 * Send a Web Push notification. No-op when VAPID keys are unset (local dev).
 */
export async function sendWebPush(
  subscription: unknown,
  payload: PushPayload,
): Promise<void> {
  if (!ensureVapid()) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY unset — skipping push');
    }
    return;
  }
  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify(payload),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[push] send failed', { message });
  }
}
