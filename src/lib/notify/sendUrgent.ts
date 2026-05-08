import { sendWebPush, type PushPayload } from '@/lib/push/webpush';
import { sendTransactionalHtml } from '@/lib/email/send';
import { sendSms } from '@/lib/sms/twilio';

export type UrgentChannels = {
  pushSubscription?: unknown | null;
  email?: string | null;
  phoneE164?: string | null;
  emailSubject: string;
  emailHtml: string;
  push?: PushPayload;
  smsBody?: string;
};

/**
 * Fan-in for urgent operational alerts (capture failed, 3DS, re-auth failed).
 * Each channel no-ops independently when not configured / missing recipient.
 */
export async function sendUrgentNotification(ch: UrgentChannels): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (ch.push && ch.pushSubscription) {
    tasks.push(sendWebPush(ch.pushSubscription, ch.push));
  }

  if (ch.email) {
    tasks.push(
      sendTransactionalHtml({
        to: ch.email,
        subject: ch.emailSubject,
        html: ch.emailHtml,
      }),
    );
  }

  if (ch.phoneE164 && ch.smsBody) {
    tasks.push(sendSms(ch.phoneE164, ch.smsBody));
  }

  await Promise.all(tasks);
}
