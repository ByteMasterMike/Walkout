import { prisma } from '@/lib/prisma';
import { sendReactEmail } from '@/lib/email/send';
import { sendWebPush } from '@/lib/push/webpush';
import TipWindowEmail from '@/emails/TipWindowEmail';

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

/**
 * After tip tokens are minted: mark AWAITING_TIP UI state and optionally notify.
 * Skips push/email when effective TipBehavior is AUTO_* (§18.4 — no tip prompt spam).
 */
export async function notifyTipWindowOpened(participantId: string): Promise<void> {
  const p = await prisma.tabParticipant.findUnique({
    where: { id: participantId },
    include: {
      diner: {
        select: {
          email: true,
          defaultTipBehavior: true,
          pushSubscription: true,
        },
      },
      session: {
        select: {
          restaurant: { select: { name: true } },
        },
      },
    },
  });

  if (!p?.tipPromptToken) return;

  const effectiveBehavior = p.diner?.defaultTipBehavior ?? p.tipBehavior;

  await prisma.tabParticipant.update({
    where: { id: participantId },
    data: {
      tipStatus: 'AWAITING',
      tipPromptSentAt: new Date(),
    },
  });

  if (effectiveBehavior !== 'ASK') {
    return;
  }

  const tipUrl = `${baseUrl()}/tip/${encodeURIComponent(p.tipPromptToken)}`;
  const restaurantName = p.session.restaurant.name;

  if (p.diner?.pushSubscription) {
    await sendWebPush(p.diner.pushSubscription, {
      title: `${restaurantName} — pick a tip`,
      body: 'A 20% tip applies in under 15 minutes unless you choose otherwise.',
      url: tipUrl,
    });
  }

  if (p.diner?.email) {
    await sendReactEmail({
      to: p.diner.email,
      subject: `${restaurantName} — choose your tip`,
      react: <TipWindowEmail restaurantName={restaurantName} tipUrl={tipUrl} />,
    });
  }
}
