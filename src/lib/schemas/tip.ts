import { z } from 'zod'

export const TipSubmitSchema = z.object({
  participantId: z.string().uuid(),
  tipToken: z.string().min(10),
  tipCents: z.number().int().min(0),
  tipSource: z.enum(['DINER_CHOICE', 'DINER_DECLINED']),
})

export type TipSubmitBody = z.infer<typeof TipSubmitSchema>
