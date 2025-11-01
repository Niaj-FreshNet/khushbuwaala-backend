// src/validations/discount.validation.ts
import { z } from "zod";

export const DiscountValidation = {
  createDiscountZodSchema: z.object({
    body: z.object({
      productId: z.string(),
      variantId: z.string().optional(),
      code: z.string().optional(),
      type: z.enum(["percentage", "fixed"]),
      value: z.number().positive(),
      maxUsage: z.number().int().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),

  updateDiscountZodSchema: z.object({
    body: z.object({
      productId: z.string().optional(),
      variantId: z.string().optional(),
      code: z.string().optional(),
      type: z.enum(["percentage", "fixed"]).optional(),
      value: z.number().positive().optional(),
      maxUsage: z.number().int().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }),
  }),
};