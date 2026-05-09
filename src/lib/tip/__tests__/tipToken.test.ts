import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { signTipToken, verifyTipToken } from '../tipToken';

beforeAll(() => {
  process.env.TIP_SECRET = 'test-tip-secret-phase5';
});

describe('tipToken', () => {
  it('sign → verify round trip', () => {
    const token = signTipToken('550e8400-e29b-41d4-a716-446655440000', 5000);
    const claims = verifyTipToken(token);
    expect(claims.participantId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(claims.subtotalCents).toBe(5000);
    expect(claims.maxTipCents).toBe(2500);
  });

  it('rejects tampered token', () => {
    const token = signTipToken('550e8400-e29b-41d4-a716-446655440000', 5000);
    const broken = token.slice(0, -4) + 'xxxx';
    expect(() => verifyTipToken(broken)).toThrow();
  });

  it('enforces maxTipCents = floor(subtotal * 0.5)', () => {
    const token = signTipToken('550e8400-e29b-41d4-a716-446655440001', 3333);
    const claims = verifyTipToken(token);
    expect(claims.maxTipCents).toBe(Math.floor(3333 * 0.5));
  });

  it('rejects JWT when maxTipCents does not match derived cap', () => {
    const payload = {
      participantId: '550e8400-e29b-41d4-a716-446655440003',
      subtotalCents: 5000,
      maxTipCents: 99999,
    };
    const tampered = jwt.sign(payload, process.env.TIP_SECRET!, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
    expect(() => verifyTipToken(tampered)).toThrow();
  });
});
