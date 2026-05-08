import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { getTimeoutTipResolution } from '../capture';

/**
 * Pass 2 of processDepartures never calls notifyTipWindowOpened (only capture).
 * AUTO_* paths must resolve tips via getTimeoutTipResolution without push (handled in notifyTipWindowOpened).
 */
describe('processDepartures Pass 2 — getTimeoutTipResolution', () => {
  const subtotal = new Decimal('50.00');

  it('ASK + no diner → 20% TIMEOUT_DEFAULT', () => {
    const r = getTimeoutTipResolution(subtotal, 'ASK', null);
    expect(r.tipCents).toBe(1000);
    expect(r.resolvedTipSource).toBe('TIMEOUT_DEFAULT');
  });

  it('AUTO_20 diner → 20% AUTO_PREF (silent auto-tip at timeout)', () => {
    const r = getTimeoutTipResolution(subtotal, 'ASK', 'AUTO_20');
    expect(r.tipCents).toBe(1000);
    expect(r.resolvedTipSource).toBe('AUTO_PREF');
  });

  it('AUTO_18 → 18%', () => {
    const r = getTimeoutTipResolution(subtotal, 'ASK', 'AUTO_18');
    expect(r.tipCents).toBe(900);
    expect(r.resolvedTipSource).toBe('AUTO_PREF');
  });

  it('AUTO_22 → 22%', () => {
    const r = getTimeoutTipResolution(subtotal, 'ASK', 'AUTO_22');
    expect(r.tipCents).toBe(1100);
    expect(r.resolvedTipSource).toBe('AUTO_PREF');
  });

  it('AUTO_NONE → $0 AUTO_PREF', () => {
    const r = getTimeoutTipResolution(subtotal, 'ASK', 'AUTO_NONE');
    expect(r.tipCents).toBe(0);
    expect(r.resolvedTipSource).toBe('AUTO_PREF');
  });
});
