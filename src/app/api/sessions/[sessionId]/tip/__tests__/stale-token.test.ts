import { describe, it, expect, vi, beforeAll } from 'vitest';
import { POST } from '../route';
import { signTipToken } from '@/lib/tip/tipToken';

const participantId = '550e8400-e29b-41d4-a716-446655440010';
const sessionId = '660e8400-e29b-41d4-a716-446655440020';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tabParticipant: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
    },
  },
}));

describe('POST /api/sessions/[sessionId]/tip — tipPromptToken binding', () => {
  beforeAll(() => {
    process.env.TIP_SECRET = 'stale-tip-test-secret';
  });

  it('returns 401 when JWT is valid but not the current tipPromptToken (reminted link)', async () => {
    const tokenOld = signTipToken(participantId, 5000);
    const tokenNew = signTipToken(participantId, 6000);

    mocks.findFirst.mockImplementation((args: { select?: unknown; include?: unknown; where?: Record<string, unknown> }) => {
      if (args.select && args.where?.anonToken) {
        return { id: participantId };
      }
      if (args.include) {
        return {
          id: participantId,
          sessionId,
          captureStatus: 'PENDING',
          tipPromptToken: tokenNew,
          holdStatus: 'HELD',
          orders: [],
          stripePaymentIntentId: 'pi_test',
          holdAmount: 10000,
          stripeCustomerId: 'cus_test',
          stripePaymentMethodId: 'pm_test',
          session: {
            restaurant: {
              stripeConnectAccountId: 'acct_test',
              stripeConnectOnboarded: true,
              walkOutServiceFeePercent: { toString: () => '0.005' },
              walkOutServiceFeeFlat: 0,
            },
          },
        };
      }
      return null;
    });

    const req = new Request('http://localhost/api/sessions/' + sessionId + '/tip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-anon-token': 'guest-anon',
      },
      body: JSON.stringify({
        participantId,
        tipToken: tokenOld,
        tipCents: 100,
        tipSource: 'DINER_CHOICE',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ sessionId }) });
    expect(res.status).toBe(401);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe('Stale tip link');
  });
});
