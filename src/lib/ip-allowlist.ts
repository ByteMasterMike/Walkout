/**
 * IPv4 only — v1 allowlist for CloudPRNT (restaurant NAT egress).
 * `rule` is either `a.b.c.d` or `a.b.c.d/n` with n in 0–32.
 */
export function ipv4MatchesRule(clientIp: string, rule: string): boolean {
  try {
    const client = ipv4ToUint32(clientIp.trim());
    const { network, mask } = parseRule(rule.trim());
    return (client & mask) === (network & mask);
  } catch {
    return false;
  }
}

function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    throw new Error('invalid ipv4');
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0) as number;
}

function parseRule(rule: string): { network: number; mask: number } {
  if (!rule.includes('/')) {
    const ip = ipv4ToUint32(rule);
    return { network: ip, mask: 0xffffffff >>> 0 };
  }
  const [addr, bitsStr] = rule.split('/');
  const bits = parseInt(bitsStr, 10);
  if (Number.isNaN(bits) || bits < 0 || bits > 32) {
    throw new Error('invalid cidr');
  }
  const ip = ipv4ToUint32(addr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { network: ip & mask, mask };
}
