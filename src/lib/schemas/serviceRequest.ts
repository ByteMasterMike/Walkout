import { z } from 'zod'

export const ServiceRequestTypeEnum = z.enum([
  'WATER',
  'REFILL',
  'SILVERWARE',
  'EXTRA_PLATE',
  'TOGO_CONTAINER',
  'HIGH_CHAIR',
  'CLEAR_TABLE',
  'SPEAK_TO_SERVER',
  'CLOSE_TAB',
])

export const ServiceRequestCreateSchema = z.object({
  type: ServiceRequestTypeEnum,
  participantId: z.string().uuid(),
  notes: z.string().max(500).optional(),
})

export type ServiceRequestCreate = z.infer<typeof ServiceRequestCreateSchema>
