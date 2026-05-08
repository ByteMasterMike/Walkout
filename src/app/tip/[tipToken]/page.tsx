import { notFound } from 'next/navigation';
import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/prisma';
import { computeCapture, type OrderItemStatus } from '@/lib/payment/capture';
import { verifyTipToken } from '@/lib/tip/tipToken';
import TipPromptForm from './TipPromptForm';

type Props = { params: Promise<{ tipToken: string }> };

export default async function TipPromptPage({ params }: Props) {
  const { tipToken: rawToken } = await params;
  const tipToken = decodeURIComponent(rawToken);

  let claims: ReturnType<typeof verifyTipToken>;
  try {
    claims = verifyTipToken(tipToken);
  } catch {
    notFound();
  }

  const participant = await prisma.tabParticipant.findFirst({
    where: {
      id: claims.participantId,
      tipPromptToken: tipToken,
      captureStatus: 'PENDING',
    },
    include: {
      session: {
        include: {
          restaurant: {
            select: {
              name: true,
              taxLabel: true,
              walkOutServiceFeePercent: true,
              walkOutServiceFeeFlat: true,
            },
          },
          table: { select: { tableNumber: true } },
        },
      },
      orders: true,
    },
  });

  if (!participant) {
    notFound();
  }

  const orderSnapshots = participant.orders.map((o) => ({
    unitPrice: new Decimal(o.unitPrice.toString()),
    quantity: o.quantity,
    taxAmount: new Decimal(o.taxAmount.toString()),
    status: o.status as OrderItemStatus,
  }));

  const cap = computeCapture({
    orders: orderSnapshots,
    serviceFeePercent: new Decimal(participant.session.restaurant.walkOutServiceFeePercent.toString()),
    serviceFeeFlatCents: participant.session.restaurant.walkOutServiceFeeFlat,
    resolvedTipAmount: new Decimal(0),
  });

  if (Math.abs(cap.subtotalCents - claims.subtotalCents) > 1) {
    notFound();
  }

  const awaitingSince = participant.awaitingTipSince?.getTime() ?? Date.now();
  const deadlineMs = awaitingSince + 15 * 60 * 1000;

  const pct = (n: number) =>
    cap.subtotalCents > 0
      ? Math.round(cap.subtotalCents * n)
      : 0;

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="max-w-md mx-auto bg-white border border-neutral-200 rounded-2xl shadow-sm p-6 space-y-6">
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-neutral-900">{participant.session.restaurant.name}</p>
          <p className="text-sm text-neutral-500">Table {participant.session.table.tableNumber}</p>
        </div>

        <TipPromptForm
          sessionId={participant.sessionId}
          participantId={participant.id}
          tipToken={tipToken}
          restaurantName={participant.session.restaurant.name}
          taxLabel={participant.session.restaurant.taxLabel}
          subtotalCents={cap.subtotalCents}
          taxCents={cap.taxCents}
          serviceFeeCents={cap.serviceFeeCents}
          mealTotalCents={cap.subtotalCents + cap.taxCents + cap.serviceFeeCents}
          maxTipCents={claims.maxTipCents}
          presetTipCents={{
            p18: pct(0.18),
            p20: pct(0.2),
            p22: pct(0.22),
          }}
          deadlineMs={deadlineMs}
        />
      </div>
    </div>
  );
}
