import { z } from 'zod'

/** Actions available on Pending Settlements rows (matches dashboard UI). */
export const SettlementActionSchema = z.enum([
  'RETRY_HOLD',
  'RETRY_CAPTURE',
  'FORCE_20_CAPTURE',
  'WRITE_OFF',
  'REFUND',
  'REQUEST_NEW_CARD',
])

export type SettlementAction = z.infer<typeof SettlementActionSchema>

export const SettlementIssueSchema = z.enum([
  'HOLD_FAILED',
  'HOLD_EXPIRED',
  'CAPTURE_FAILED',
  'CAPTURE_PARTIAL',
  'REFUND_REQUESTED',
])

export type SettlementIssue = z.infer<typeof SettlementIssueSchema>

export const SettlementRowSchema = z.object({
  id: z.string().uuid(),
  participantId: z.string().uuid(),
  sessionId: z.string().uuid(),
  tableNumber: z.string(),
  dinerName: z.string(),
  dinerEmail: z.string().email().nullable(),
  issue: SettlementIssueSchema,
  amountCents: z.number().int(),
  holdAttempt: z.number().int(),
  captureAttempt: z.number().int(),
  occurredAt: z.string().datetime(),
  availableActions: z.array(SettlementActionSchema),
})

export type SettlementRow = z.infer<typeof SettlementRowSchema>

export const SettlementActionBodySchema = z.object({
  action: SettlementActionSchema,
})

export type SettlementActionBody = z.infer<typeof SettlementActionBodySchema>
