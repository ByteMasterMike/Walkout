import { describe, it, expect } from 'vitest';
import { xmlEscape } from './receipt';

describe('xmlEscape', () => {
  it('strips C0 control characters before escaping', () => {
    const raw = '\x1B[2J Reuben & Fries';
    expect(xmlEscape(raw)).toBe('[2J Reuben &amp; Fries');
  });

  it('escapes XML entities for safe content', () => {
    expect(xmlEscape('a & b < c')).toBe('a &amp; b &lt; c');
  });
});
