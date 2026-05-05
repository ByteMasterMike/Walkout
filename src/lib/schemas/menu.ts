import { z } from 'zod'

export const MenuCategoryCreateSchema = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
})

export const MenuCategoryUpdateSchema = MenuCategoryCreateSchema.partial()

export const MenuItemCreateSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  price: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'price must be a decimal string with up to 2 decimal places'),
  imageUrl: z.string().url().optional(),
  isAvailable: z.boolean().optional(),
  allergens: z.array(z.string()).optional(),
  isPopular: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const MenuItemUpdateSchema = MenuItemCreateSchema.partial()

export type MenuCategoryCreate = z.infer<typeof MenuCategoryCreateSchema>
export type MenuCategoryUpdate = z.infer<typeof MenuCategoryUpdateSchema>
export type MenuItemCreate = z.infer<typeof MenuItemCreateSchema>
export type MenuItemUpdate = z.infer<typeof MenuItemUpdateSchema>
