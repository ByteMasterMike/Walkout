import jwt from 'jsonwebtoken'

const ALG = 'HS256' as const

export interface TipTokenPayload {
  participantId: string
  subtotalCents: number
  maxTipCents: number
}

function requireTipSecret(): string {
  const secret = process.env.TIP_SECRET
  if (!secret) {
    throw new Error('TIP_SECRET environment variable is not set')
  }
  return secret
}

/** Signed tip-link payload (PRD §18.5). Expires in 24h. */
export function signTipToken(participantId: string, subtotalCents: number): string {
  const maxTipCents = Math.floor(subtotalCents * 0.5)
  const payload: TipTokenPayload = {
    participantId,
    subtotalCents,
    maxTipCents,
  }
  return jwt.sign(payload, requireTipSecret(), {
    algorithm: ALG,
    expiresIn: '24h',
  })
}

export function verifyTipToken(token: string): TipTokenPayload {
  const decoded = jwt.verify(token, requireTipSecret(), {
    algorithms: [ALG],
  }) as jwt.JwtPayload & Partial<TipTokenPayload>

  const participantId = decoded.participantId
  const subtotalCents = decoded.subtotalCents
  const maxTipCents = decoded.maxTipCents

  if (typeof participantId !== 'string' || !participantId) {
    throw new Error('Invalid tip token: missing participantId')
  }
  if (typeof subtotalCents !== 'number' || Number.isNaN(subtotalCents)) {
    throw new Error('Invalid tip token: missing subtotalCents')
  }
  if (typeof maxTipCents !== 'number' || Number.isNaN(maxTipCents)) {
    throw new Error('Invalid tip token: missing maxTipCents')
  }

  return { participantId, subtotalCents, maxTipCents }
}
