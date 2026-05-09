import jwt from 'jsonwebtoken'

const ALG = 'HS256' as const

export interface CardUpdateTokenPayload {
  purpose: 'card_update'
  participantId: string
  sessionId: string
}

function requireSigningSecret(): string {
  const secret = process.env.CARD_UPDATE_SECRET ?? process.env.TIP_SECRET
  if (!secret) {
    throw new Error('CARD_UPDATE_SECRET or TIP_SECRET must be set for card-update links')
  }
  return secret
}

/** Short-lived link for diners to add a replacement card (settlements REQUEST_NEW_CARD). */
export function signCardUpdateToken(participantId: string, sessionId: string): string {
  const payload: CardUpdateTokenPayload = {
    purpose: 'card_update',
    participantId,
    sessionId,
  }
  return jwt.sign(payload, requireSigningSecret(), {
    algorithm: ALG,
    expiresIn: '48h',
  })
}

export function verifyCardUpdateToken(token: string): CardUpdateTokenPayload {
  const decoded = jwt.verify(token, requireSigningSecret(), {
    algorithms: [ALG],
  }) as jwt.JwtPayload & Partial<CardUpdateTokenPayload>

  if (decoded.purpose !== 'card_update') {
    throw new Error('Invalid card update token')
  }
  if (typeof decoded.participantId !== 'string' || !decoded.participantId) {
    throw new Error('Invalid card update token: participantId')
  }
  if (typeof decoded.sessionId !== 'string' || !decoded.sessionId) {
    throw new Error('Invalid card update token: sessionId')
  }

  return {
    purpose: 'card_update',
    participantId: decoded.participantId,
    sessionId: decoded.sessionId,
  }
}
