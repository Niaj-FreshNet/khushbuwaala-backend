// src/validations/discount.validation.ts
import { z } from "zod";

const discountZodSchema = z.object({
  scope: z.enum(["ORDER", "PRODUCT", "VARIANT"]).default("PRODUCT"),

  productId: z.string().optional(),
  variantId: z.string().optional(),

  code: z.string().optional(),

  type: z.enum(["percentage", "fixed"]),
  value: z.coerce.number().positive("Enter a positive number"),

  maxUsage: z.union([
    z.string().transform(val => (val === "" ? undefined : parseInt(val))),
    z.number(),
    z.undefined(),
  ]).optional(),

  startDate: z.string().default(""),
  endDate: z.string().default(""),
}).superRefine((data, ctx) => {
  if (data.scope === "ORDER") {
    if (!data.code?.trim()) {
      ctx.addIssue({ code: "custom", path: ["code"], message: "Coupon code is required for order discount" });
    }
  }

  if (data.scope === "PRODUCT") {
    if (!data.productId?.trim()) {
      ctx.addIssue({ code: "custom", path: ["productId"], message: "Product is required" });
    }
  }

  if (data.scope === "VARIANT") {
    if (!data.productId?.trim()) {
      ctx.addIssue({ code: "custom", path: ["productId"], message: "Product is required" });
    }
    if (!data.variantId?.trim()) {
      ctx.addIssue({ code: "custom", path: ["variantId"], message: "Variant is required" });
    }
  }
})

export const DiscountValidation = {
  discountZodSchema
};