/**
 * Twilio SMS — no-op when credentials are missing (same pattern as Upstash rate limits).
 */
export async function sendSms(toE164: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[sms] Twilio env unset — skipping SMS');
    }
    return;
  }

  const twilio = await import('twilio');
  const client = twilio.default(sid, token);
  try {
    await client.messages.create({ from, to: toE164, body });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[sms] send failed', { message });
  }
}
