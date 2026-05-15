import { Decimal } from 'decimal.js'
import { prisma } from '@/lib/prisma'
import { computeCapture, type OrderItemStatus } from '@/lib/payment/capture'
import { signTipToken } from '@/lib/tip/tipToken'

/**
 * After session enters AWAITING_TIP — or when a single diner departs early — mint signed tip link(s).
 * Pass `participantIds` to restrict minting (host-leaves-early: only the departing guest).
 */
export async function assignTipPromptTokensForSession(
  sessionId: string,
  options?: { participantIds?: string[] },
): Promise<void> {
  try {
    if (!process.env.TIP_SECRET) {
      console.error(
        '[assignTipPromptTokensForSession] TIP_SECRET missing — tip tokens NOT minted; SMS/in-app tip submission cannot run.',
      )
      return
    }

    const participants = await prisma.tabParticipant.findMany({
      where: {
        sessionId,
        captureStatus: 'PENDING',
        ...(options?.participantIds?.length
          ? { id: { in: options.participantIds } }
          : {}),
      },
      include: {
        orders: true,
        session: {
          select: {
            restaurant: {
              select: {
                walkOutServiceFeePercent: true,
                walkOutServiceFeeFlat: true,
              },
            },
          },
        },
      },
    })

    for (const p of participants) {
      try {
        const orderSnapshots = p.orders.map((o) => ({
          unitPrice: new Decimal(o.unitPrice.toString()),
          quantity: o.quantity,
          taxAmount: new Decimal(o.taxAmount.toString()),
          status: o.status as OrderItemStatus,
        }))
        const cap0 = computeCapture({
          orders: orderSnapshots,
          serviceFeePercent: new Decimal(p.session.restaurant.walkOutServiceFeePercent.toString()),
          serviceFeeFlatCents: p.session.restaurant.walkOutServiceFeeFlat,
          resolvedTipAmount: new Decimal(0),
        })

        const token = signTipToken(p.id, cap0.subtotalCents)
        await prisma.tabParticipant.update({
          where: { id: p.id },
          data: { tipPromptToken: token },
        })
      } catch (err) {
        console.error('[assignTipPromptTokensForSession]', sessionId, p.id, err)
      }
    }
  } catch (err) {
    console.error('[assignTipPromptTokensForSession]', sessionId, err)
  }
}
