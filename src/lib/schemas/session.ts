import { z } from 'zod'

export const SessionStateSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    tableId: z.string().uuid(),
    restaurantId: z.string().uuid(),
    status: z.enum(['OPEN', 'CLOSING', 'CLOSED', 'ABANDONED']),
    assignedStaffId: z.string().uuid().nullable(),
    lastHeartbeatAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  participants: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      isHost: z.boolean(),
      joinedAt: z.string().datetime(),
      departedAt: z.string().datetime().nullable(),
    })
  ),
  orders: z.array(
    z.object({
      id: z.string().uuid(),
      participantId: z.string().uuid(),
      menuItemId: z.string().uuid(),
      menuItemName: z.string(),
      quantity: z.number().int(),
      unitPrice: z.string(),
      taxRate: z.string(),
      taxAmount: z.string(),
      notes: z.string().nullable(),
      status: z.enum(['PENDING', 'CONFIRMED', 'PREPPING', 'SERVED', 'CANCELLED', 'CASH_PENDING']),
      createdAt: z.string().datetime(),
    })
  ),
  serviceRequests: z.array(
    z.object({
      id: z.string().uuid(),
      participantId: z.string().uuid(),
      type: z.string(),
      status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED']),
      notes: z.string().nullable(),
      createdAt: z.string().datetime(),
    })
  ),
})

export const HeartbeatSchema = z.object({
  participantId: z.string().uuid(),
})

export type SessionState = z.infer<typeof SessionStateSchema>
export type Heartbeat = z.infer<typeof HeartbeatSchema>
