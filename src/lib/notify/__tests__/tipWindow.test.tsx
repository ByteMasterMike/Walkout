import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notifyTipWindowOpened } from '@/lib/notify/tipWindow';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  sendWebPush: vi.fn(),
  sendReactEmail: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    tabParticipant: {
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}));

vi.mock('@/lib/push/webpush', () => ({
  sendWebPush: mocks.sendWebPush,
}));

vi.mock('@/lib/email/send', () => ({
  sendReactEmail: mocks.sendReactEmail,
}));

describe('notifyTipWindowOpened', () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.update.mockReset();
    mocks.sendWebPush.mockReset();
    mocks.sendReactEmail.mockReset();
  });

  const baseParticipant = {
    tipPromptToken: 'tok',
    tipBehavior: 'ASK' as const,
    diner: {
      email: 'd@example.com',
      defaultTipBehavior: 'ASK' as const,
      pushSubscription: { endpoint: 'https://example.com/push' },
    },
    session: {
      restaurant: { name: 'Cafe' },
    },
  };

  it('updates AWAITING + tipPromptSentAt', async () => {
    mocks.findUnique.mockResolvedValue(baseParticipant);
    mocks.update.mockResolvedValue({});

    await notifyTipWindowOpened('p1');

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({
        tipStatus: 'AWAITING',
        tipPromptSentAt: expect.any(Date),
      }),
    });
  });

  it('sends push + email when effective behavior is ASK', async () => {
    mocks.findUnique.mockResolvedValue(baseParticipant);
    mocks.update.mockResolvedValue({});

    await notifyTipWindowOpened('p1');

    expect(mocks.sendWebPush).toHaveBeenCalled();
    expect(mocks.sendReactEmail).toHaveBeenCalled();
  });

  it('does not send push/email for AUTO_20 (no tip prompt spam)', async () => {
    mocks.findUnique.mockResolvedValue({
      ...baseParticipant,
      diner: {
        ...baseParticipant.diner,
        defaultTipBehavior: 'AUTO_20',
      },
    });
    mocks.update.mockResolvedValue({});

    await notifyTipWindowOpened('p1');

    expect(mocks.sendWebPush).not.toHaveBeenCalled();
    expect(mocks.sendReactEmail).not.toHaveBeenCalled();
  });
});
