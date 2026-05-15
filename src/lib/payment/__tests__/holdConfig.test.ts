import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HOLD_AMOUNT_CENTS,
  effectiveHoldAmountCents,
  LEGACY_DEFAULT_HOLD_CENTS,
} from '../holdConfig';

describe('effectiveHoldAmountCents', () => {
  it('maps legacy platform default (7500¢) to $1', () => {
    expect(effectiveHoldAmountCents(LEGACY_DEFAULT_HOLD_CENTS)).toBe(DEFAULT_HOLD_AMOUNT_CENTS);
  });

  it('preserves other in-range configured amounts', () => {
    expect(effectiveHoldAmountCents(5000)).toBe(5000);
    expect(effectiveHoldAmountCents(100)).toBe(100);
  });
});
