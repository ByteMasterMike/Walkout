import { render } from '@react-email/render';
import type { ReactElement } from 'react';
import { Resend } from 'resend';

const DEFAULT_FROM = 'WalkOut <no-reply@walkoutofficial.com>';

function getFrom(): string {
  return process.env.RESEND_FROM ?? DEFAULT_FROM;
}

/** Plain HTML (already rendered). No-op without RESEND_API_KEY. */
export async function sendTransactionalHtml(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[email] RESEND_API_KEY unset — skipping transactional email');
    }
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: getFrom(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}

/** Render a @react-email component and send via Resend. */
export async function sendReactEmail(opts: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<void> {
  const html = await render(opts.react);
  await sendTransactionalHtml({
    to: opts.to,
    subject: opts.subject,
    html,
  });
}
