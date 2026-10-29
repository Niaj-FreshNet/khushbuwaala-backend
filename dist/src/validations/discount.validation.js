"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscountValidation = void 0;
// src/validations/discount.validation.ts
const zod_1 = require("zod");
const discountZodSchema = zod_1.z.object({
    scope: zod_1.z.enum(["ORDER", "PRODUCT", "VARIANT"]).default("PRODUCT"),
    productId: zod_1.z.string().optional(),
    variantId: zod_1.z.string().optional(),
    code: zod_1.z.string().optional(),
    type: zod_1.z.enum(["percentage", "fixed"]),
    value: zod_1.z.coerce.number().positive("Enter a positive number"),
    maxUsage: zod_1.z.union([
        zod_1.z.string().transform(val => (val === "" ? undefined : parseInt(val))),
        zod_1.z.number(),
        zod_1.z.undefined(),
    ]).optional(),
    startDate: zod_1.z.string().default(""),
    endDate: zod_1.z.string().default(""),
}).superRefine((data, ctx) => {
    var _a, _b, _c, _d;
    if (data.scope === "ORDER") {
        if (!((_a = data.code) === null || _a === void 0 ? void 0 : _a.trim())) {
            ctx.addIssue({ code: "custom", path: ["code"], message: "Coupon code is required for order discount" });
        }
    }
    if (data.scope === "PRODUCT") {
        if (!((_b = data.productId) === null || _b === void 0 ? void 0 : _b.trim())) {
            ctx.addIssue({ code: "custom", path: ["productId"], message: "Product is required" });
        }
    }
    if (data.scope === "VARIANT") {
        if (!((_c = data.productId) === null || _c === void 0 ? void 0 : _c.trim())) {
            ctx.addIssue({ code: "custom", path: ["productId"], message: "Product is required" });
        }
        if (!((_d = data.variantId) === null || _d === void 0 ? void 0 : _d.trim())) {
            ctx.addIssue({ code: "custom", path: ["variantId"], message: "Variant is required" });
        }
    }
});
exports.DiscountValidation = {
    discountZodSchema
};
