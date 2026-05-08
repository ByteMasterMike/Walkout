import { Decimal } from 'decimal.js';
import ReceiptEmail, { type ReceiptLine } from '@/emails/ReceiptEmail';
import { sendReactEmail } from '@/lib/email/send';
import { sendWebPush } from '@/lib/push/webpush';
import { prisma } from '@/lib/prisma';

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function baseUrl(): string {
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

/**
 * Post-capture: itemised receipt email + push (PRD §18.7 single combined charge).
 */
export async function notifyCaptureSucceeded(participantId: string, totalChargedCents: number): Promise<void> {
  const p = await prisma.tabParticipant.findUnique({
    where: { id: participantId },
    include: {
      diner: {
        select: {
          email: true,
          pushSubscription: true,
        },
      },
      orders: {
        include: {
          menuItem: { select: { name: true } },
        },
      },
      session: {
        include: {
          restaurant: {
            select: {
              name: true,
              taxLabel: true,
            },
          },
          table: { select: { tableNumber: true } },
        },
      },
    },
  });

  if (!p) return;

  const EXCLUDED = new Set(['CANCELLED', 'CASH_PENDING']);
  const lines: ReceiptLine[] = [];

  for (const o of p.orders) {
    if (EXCLUDED.has(o.status)) continue;
    const lineTotal = new Decimal(o.unitPrice.toString())
      .times(o.quantity)
      .times(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    lines.push({
      label: `${o.quantity}× ${o.menuItem.name}`,
      amount: money(lineTotal),
    });
  }

  lines.push({ label: 'Subtotal', amount: money(p.subtotalCents ?? 0) });
  lines.push({
    label: `${p.session.restaurant.taxLabel}`,
    amount: money(p.taxCents ?? 0),
  });
  lines.push({
    label: 'WalkOut service fee',
    amount: money(p.serviceFeeCents ?? 0),
  });
  lines.push({
    label: 'Tip',
    amount: money(p.resolvedTipAmount ?? 0),
  });

  const restaurantName = p.session.restaurant.name;
  const tableNumber = p.session.table.tableNumber;

  if (p.diner?.email) {
    await sendReactEmail({
      to: p.diner.email,
      subject: `Receipt from ${restaurantName}`,
      react: (
        <ReceiptEmail
          restaurantName={restaurantName}
          tableNumber={tableNumber}
          lines={lines}
          totalCharged={money(totalChargedCents)}
        />
      ),
    });
  }

  if (p.diner?.pushSubscription) {
    await sendWebPush(p.diner.pushSubscription, {
      title: `${restaurantName} — receipt`,
      body: `Total charged ${money(totalChargedCents)}`,
      url: `${baseUrl()}/account/history`,
    });
  }
}
