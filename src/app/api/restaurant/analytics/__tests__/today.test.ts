import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computeRestaurantAnalyticsToday } from '@/lib/analytics/today';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tabSession: { findMany: vi.fn() },
    tabParticipant: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';

describe('computeRestaurantAnalyticsToday', () => {
  beforeEach(() => {
    vi.mocked(prisma.tabSession.findMany).mockReset();
    vi.mocked(prisma.tabParticipant.findMany).mockReset();
  });

  it('aggregates QTD tax cents from OrderItem.taxAmount only', async () => {
    vi.mocked(prisma.tabSession.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          orders: [
            { taxAmount: { toString: () => '1.25' }, status: 'CONFIRMED' },
            { taxAmount: { toString: () => '9.99' }, status: 'CANCELLED' },
          ],
        },
      ] as never);

    vi.mocked(prisma.tabParticipant.findMany).mockResolvedValue([]);

    const out = await computeRestaurantAnalyticsToday('rest-1', 'America/New_York');

    expect(out.taxQtdCents).toBe(125);
    expect(out.revenueCents).toBe(0);
    expect(out.last7DaysCents).toHaveLength(7);
  });
});
