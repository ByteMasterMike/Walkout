import { describe, it, expect } from 'vitest';
import { participantHasKitchenQueueOrders } from '@/lib/kitchen-snapshot';

describe('participantHasKitchenQueueOrders', () => {
  it('returns false when every visible line is SERVED', () => {
    expect(participantHasKitchenQueueOrders([{ status: 'SERVED' }, { status: 'SERVED' }])).toBe(false);
  });

  it('returns false when only CANCELLED', () => {
    expect(participantHasKitchenQueueOrders([{ status: 'CANCELLED' }])).toBe(false);
  });

  it('returns true when any visible line is not SERVED', () => {
    expect(participantHasKitchenQueueOrders([{ status: 'SERVED' }, { status: 'PREPPING' }])).toBe(true);
  });
});
