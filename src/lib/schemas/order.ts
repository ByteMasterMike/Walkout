import { z } from 'zod'

export const OrderCreateSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().max(500).optional(),
})

export const OrderStatusUpdateSchema = z.object({
  status: z.enum(['CONFIRMED', 'PREPPING', 'SERVED', 'CANCELLED']),
  kdsDevicePin: z.string().optional(),
})

export type OrderCreate = z.infer<typeof OrderCreateSchema>
export type OrderStatusUpdate = z.infer<typeof OrderStatusUpdateSchema>
