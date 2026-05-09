import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { POST } from '../push-subscription/route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: mocks.auth,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    diner: {
      update: mocks.update,
    },
  },
}));

describe('POST /api/diner/push-subscription', () => {
  beforeAll(() => {
    mocks.auth.mockResolvedValue({
      user: { dinerId: 'diner-1', role: 'DINER' },
    });
  });

  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({});
  });

  it('returns 422 for invalid shape', async () => {
    const req = new Request('http://localhost/api/diner/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'not-a-url', keys: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns 422 for strict unknown keys', async () => {
    const req = new Request('http://localhost/api/diner/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: 'https://example.com/push',
        keys: { p256dh: 'a', auth: 'b' },
        extra: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it('stores valid PushSubscription JSON', async () => {
    const body = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
      keys: {
        p256dh: 'BGabc',
        auth: 'secret',
      },
    };
    const req = new Request('http://localhost/api/diner/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'diner-1' },
      data: { pushSubscription: body },
    });
  });
});
