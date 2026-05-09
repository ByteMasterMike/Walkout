import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../migrate-from-guest/route';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceSignupMigrateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async () => 'hashed-password'),
  },
}));

describe('POST /api/diner/migrate-from-guest', () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
  });

  it('returns 401 without anon header', async () => {
    const req = new Request('http://localhost/api/diner/migrate-from-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'a@b.com',
        password: 'password12345',
        name: 'Alex',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs transaction: create diner reusing Stripe customer, clear anonToken, merge anon session', async () => {
    const participant = {
      id: '550e8400-e29b-41d4-a716-446655440099',
      anonToken: 'anon-secret',
      stripeCustomerId: 'cus_123',
      stripePaymentMethodId: 'pm_456',
      session: { id: '550e8400-e29b-41d4-a716-446655440088' },
    };

    const anon = { id: 'anon-row', token: 'anon-secret' };

    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        tabParticipant: {
          findUnique: vi.fn().mockResolvedValue(participant),
          update: vi.fn().mockResolvedValue({}),
        },
        diner: {
          create: vi.fn().mockResolvedValue({ id: 'new-diner-id' }),
        },
        anonSession: {
          findFirst: vi.fn().mockResolvedValue(anon),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      await fn(tx as never);

      expect(tx.diner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stripeCustomerId: 'cus_123',
            stripeDefaultPaymentMethodId: 'pm_456',
          }),
        }),
      );
      expect(tx.tabParticipant.update).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440099' },
        data: { dinerId: 'new-diner-id', anonToken: null },
      });
      expect(tx.anonSession.update).toHaveBeenCalledWith({
        where: { id: 'anon-row' },
        data: { mergedInto: 'new-diner-id' },
      });
    });

    const req = new Request('http://localhost/api/diner/migrate-from-guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-anon-token': 'anon-secret',
      },
      body: JSON.stringify({
        participantId: '550e8400-e29b-41d4-a716-446655440099',
        email: 'new@example.com',
        password: 'password12345',
        name: 'Alex',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it('returns generic 422 on duplicate email (no enumeration)', async () => {
    const { Prisma } = await import('@prisma/client');
    mocks.transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const req = new Request('http://localhost/api/diner/migrate-from-guest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-anon-token': 'anon-secret',
      },
      body: JSON.stringify({
        participantId: '550e8400-e29b-41d4-a716-446655440099',
        email: 'taken@example.com',
        password: 'password12345',
        name: 'Alex',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const j = (await res.json()) as { error: string };
    expect(j.error).toBe('Unable to complete migration');
  });
});
