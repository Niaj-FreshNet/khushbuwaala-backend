// src/modules/Discount/discount.service.ts
import httpStatus from "http-status";
import AppError from "../../errors/AppError";
import { prisma } from "../../../prisma/client";

export interface IDiscountPayload {
  scope: "ORDER" | "PRODUCT" | "VARIANT";
  productId?: string;   // optional now
  variantId?: string;
  code?: string;
  type: "percentage" | "fixed";
  value: number;
  maxUsage?: number;
  startDate?: string;
  endDate?: string;
}

export const DiscountServices = {
  // ── CREATE DISCOUNT ─────────────────────────────
  async createDiscount(payload: IDiscountPayload) {
    const { scope, productId, variantId } = payload;

    const normalizedCode = payload.code?.trim();
    const code = normalizedCode ? normalizedCode.toUpperCase() : null;

    if (scope === "ORDER") {
      if (!normalizedCode) {
        throw new AppError(httpStatus.BAD_REQUEST, "Coupon code is required for order discount");
      }
      if (productId || variantId) {
        throw new AppError(httpStatus.BAD_REQUEST, "Order discount cannot be tied to product/variant");
      }
    }

    if (scope === "PRODUCT") {
      if (!productId) throw new AppError(httpStatus.BAD_REQUEST, "Product is required for product discount");
      if (variantId) throw new AppError(httpStatus.BAD_REQUEST, "Product scope discount cannot have variantId");
    }

    if (scope === "VARIANT") {
      if (!productId) throw new AppError(httpStatus.BAD_REQUEST, "Product is required for variant discount");
      if (!variantId) throw new AppError(httpStatus.BAD_REQUEST, "Variant is required for variant discount");
    }

    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");
    }

    if (variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new AppError(httpStatus.NOT_FOUND, "Variant not found");
    }

    if (code) {
      const exists = await prisma.discount.findUnique({ where: { code } });
      if (exists) throw new AppError(httpStatus.BAD_REQUEST, "Discount code already exists");
    }

    const numericValue = Number(payload.value);
    const numericMaxUsage =
      payload.maxUsage === undefined || payload.maxUsage === null
        ? undefined
        : Number(payload.maxUsage);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Discount value must be a positive number");
    }
    if (numericMaxUsage !== undefined && (!Number.isInteger(numericMaxUsage) || numericMaxUsage < 1)) {
      throw new AppError(httpStatus.BAD_REQUEST, "maxUsage must be a positive integer");
    }

    return prisma.discount.create({
      data: {
        scope,
        productId: scope === "ORDER" ? undefined : productId,
        variantId: scope === "ORDER" ? undefined : variantId,
        code: code,
        type: payload.type,
        value: numericValue,
        maxUsage: numericMaxUsage,
        startDate: payload.startDate ? new Date(payload.startDate) : undefined,
        endDate: payload.endDate ? new Date(payload.endDate) : undefined,
      },
    });
  },

  // ── GET ALL FOR ADMIN ───────────────────────────
  async getAllAdmin() {
    return prisma.discount.findMany({
      include: {
        product: { select: { name: true } },
        variant: { select: { sku: true, size: true, unit: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async getSingle(id: string) {
    const discount = await prisma.discount.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        variant: { select: { sku: true, size: true, unit: true } },
      },
    });

    if (!discount) throw new AppError(httpStatus.NOT_FOUND, "Discount not found");
    return discount;
  },

  // ── UPDATE DISCOUNT ────────────────────────────
  async updateDiscount(id: string, payload: Partial<IDiscountPayload>) {
    const discount = await prisma.discount.findUnique({ where: { id } });
    if (!discount) throw new AppError(httpStatus.NOT_FOUND, "Discount not found");

    const numericValue =
      payload.value === undefined || payload.value === null
        ? undefined
        : Number(payload.value);

    const numericMaxUsage =
      payload.maxUsage === undefined || payload.maxUsage === null || payload.maxUsage === ("" as any)
        ? undefined
        : Number(payload.maxUsage);

    if (numericValue !== undefined && (!Number.isFinite(numericValue) || numericValue <= 0)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Discount value must be a positive number");
    }

    if (numericMaxUsage !== undefined && (!Number.isInteger(numericMaxUsage) || numericMaxUsage < 1)) {
      throw new AppError(httpStatus.BAD_REQUEST, "maxUsage must be a positive integer");
    }

    const toDateOrUndefined = (v?: string | null) => {
      if (v === undefined) return undefined;          // not provided -> don't update
      if (!v || !String(v).trim()) return null;       // blank -> clear date (set null)

      const d = new Date(v); // accepts "YYYY-MM-DDTHH:mm"
      if (isNaN(d.getTime())) throw new AppError(httpStatus.BAD_REQUEST, "Invalid date format");
      return d;
    };

    return prisma.discount.update({
      where: { id },
      data: {
        ...(payload.scope !== undefined && { scope: payload.scope }),
        ...(payload.productId !== undefined && { productId: payload.productId || null }),
        ...(payload.variantId !== undefined && { variantId: payload.variantId || null }),
        ...(payload.code !== undefined && { code: payload.code || null }),
        ...(payload.type !== undefined && { type: payload.type }),

        ...(numericValue !== undefined && { value: numericValue }),
        ...(payload.maxUsage !== undefined && { maxUsage: numericMaxUsage ?? null }),

        ...(payload.startDate !== undefined && { startDate: toDateOrUndefined(payload.startDate) }),
        ...(payload.endDate !== undefined && { endDate: toDateOrUndefined(payload.endDate) }),
      },
    });
  },

  // ── DELETE DISCOUNT ────────────────────────────
  async deleteDiscount(id: string) {
    const discount = await prisma.discount.findUnique({ where: { id } });
    if (!discount) throw new AppError(httpStatus.NOT_FOUND, "Discount not found");

    await prisma.discount.delete({ where: { id } });
  },

  // ── APPLY DISCOUNT AT CHECKOUT ─────────────────
  async applyDiscount(
    code: string | undefined,
    items: { productId: string; variantId?: string; price: number; qty: number }[]
  ) {
    const now = new Date();
    const normalizedCode = code?.trim().toUpperCase();

    const allDiscounts = await prisma.discount.findMany({
      where: {
        AND: [
          {
            OR: [
              ...(normalizedCode
                ? [{ code: { equals: normalizedCode } }]
                : []),
              { code: null },
            ],
          },
          {
            OR: [
              { startDate: null },
              { startDate: { lte: now } },
            ],
          },
          {
            OR: [
              { endDate: null },
              { endDate: { gte: now } },
            ],
          },
        ],
      },
    });

    // If user provided a code, ensure it exists + not overused (BUT DO NOT increment here)
    let codedDiscount: any = null;

    if (normalizedCode) {
      codedDiscount = await prisma.discount.findUnique({
        where: { code: normalizedCode },
      });

      if (!codedDiscount) {
        throw new AppError(httpStatus.NOT_FOUND, "Invalid discount code");
      }

      // date validity (extra safety)
      const startOk = !codedDiscount.startDate || codedDiscount.startDate <= now;
      const endOk = !codedDiscount.endDate || codedDiscount.endDate >= now;
      if (!startOk || !endOk) {
        throw new AppError(httpStatus.BAD_REQUEST, "This coupon is not active right now");
      }

      // usage check (validate only)
      if (codedDiscount.maxUsage && codedDiscount.usedCount >= codedDiscount.maxUsage) {
        throw new AppError(httpStatus.BAD_REQUEST, "This coupon has reached maximum usage");
      }
    }

    // 1) Item-level discounts (AUTO + promo that targets product/variant)
    const results = items.map(item => {
      const originalPrice = item.price;
      let discountedPrice = originalPrice;

      const autoDiscount = allDiscounts.find(d =>
        !d.code &&
        (d.scope === "PRODUCT" || d.scope === "VARIANT") &&
        (d.scope === "VARIANT"
          ? d.variantId === item.variantId
          : d.productId === item.productId)
      );

      const promoItemDiscount = allDiscounts.find(d =>
        normalizedCode &&
        (d.code || "").toUpperCase() === normalizedCode &&
        (d.scope === "PRODUCT" || d.scope === "VARIANT") &&
        (d.scope === "VARIANT"
          ? d.variantId === item.variantId
          : d.productId === item.productId)
      );

      const apply = (d?: typeof allDiscounts[number]) => {
        if (!d) return;
        if (d.type === "percentage") discountedPrice = discountedPrice * (1 - d.value / 100);
        else discountedPrice = Math.max(0, discountedPrice - d.value);
      };

      apply(autoDiscount);
      apply(promoItemDiscount);

      // keep no decimals (your preference)
      discountedPrice = Math.round(discountedPrice);

      return {
        ...item,
        originalPrice,
        discountedPrice,
        appliedDiscounts: [autoDiscount, promoItemDiscount].filter(Boolean),
      };
    });

    const subtotalOriginal = results.reduce((sum, i) => sum + i.originalPrice * i.qty, 0);
    const subtotalAfterItemDiscount = results.reduce((sum, i) => sum + i.discountedPrice * i.qty, 0);

    // 2) ORDER-level coupon discount (applies once)
    const orderDiscount = allDiscounts.find(d =>
      normalizedCode &&
      (d.code || "").toUpperCase() === normalizedCode &&
      d.scope === "ORDER"
    );

    let orderDiscountAmount = 0;

    if (orderDiscount) {
      if (orderDiscount.type === "percentage") {
        orderDiscountAmount = Math.round(subtotalAfterItemDiscount * (orderDiscount.value / 100));
      } else {
        orderDiscountAmount = Math.round(orderDiscount.value);
      }
      orderDiscountAmount = Math.min(orderDiscountAmount, subtotalAfterItemDiscount);
    }

    const grandTotalAfterDiscount = Math.max(0, subtotalAfterItemDiscount - orderDiscountAmount);

    const itemDiscountAmount = subtotalOriginal - subtotalAfterItemDiscount;
    const totalDiscountAmount = itemDiscountAmount + orderDiscountAmount;

    return {
      items: results,
      subtotalOriginal,
      subtotalAfterItemDiscount,
      orderDiscount: orderDiscount || null,
      orderDiscountAmount,
      discountAmount: totalDiscountAmount,
      grandTotalAfterDiscount,
    };
  },

  // ── GET AUTO DISCOUNT FOR PRODUCT LISTINGS ─────
  async getAutoDiscount(productId: string, variantId?: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true, discounts: true },
    });
    if (!product) throw new AppError(httpStatus.NOT_FOUND, "Product not found");

    const now = new Date();
    const activeDiscounts = product.discounts.filter(d => {
      const started = !d.startDate || d.startDate <= now;
      const notEnded = !d.endDate || d.endDate >= now;
      return started && notEnded && (!d.code || String(d.code).trim() === "");
    });
    if (activeDiscounts.length === 0) return { discountedPrice: null };

    let originalPrice = 0;
    let discountToApply = null;

    if (variantId) {
      const variant = product.variants.find(v => v.id === variantId);
      if (!variant) throw new AppError(httpStatus.NOT_FOUND, "Variant not found");
      originalPrice = variant.price;
      discountToApply =
        activeDiscounts.find(d => d.variantId === variantId) ||
        activeDiscounts.find(d => !d.variantId);
    } else {
      const prices = product.variants.map(v => v.price);
      originalPrice = Math.min(...prices);
      discountToApply = activeDiscounts.find(d => !d.variantId);
    }

    if (!discountToApply) return { discountedPrice: null };

    let discountedPrice = originalPrice;
    if (discountToApply.type === "percentage") discountedPrice = originalPrice * (1 - discountToApply.value / 100);
    else discountedPrice = Math.max(0, originalPrice - discountToApply.value);

    return {
      originalPrice,
      discountedPrice,
      discount: discountToApply,
      priceRange: !variantId
        ? { min: Math.min(...product.variants.map(v => v.price)), max: Math.max(...product.variants.map(v => v.price)) }
        : undefined,
    };
  },

  async consumeDiscountUsageByCode(tx: any, code: string, orderId: string) {
    const normalizedCode = code.trim().toUpperCase();

    const discount = await tx.discount.findUnique({
      where: { code: normalizedCode },
    });

    if (!discount) return; // silently ignore (or throw if you prefer strict)

    // Prevent double-consume for same order
    const already = await tx.orderDiscount.findFirst({
      where: { orderId, discountId: discount.id },
    });
    if (already) return;

    // Check active dates again (server truth)
    const now = new Date();
    const startOk = !discount.startDate || discount.startDate <= now;
    const endOk = !discount.endDate || discount.endDate >= now;
    if (!startOk || !endOk) {
      throw new AppError(httpStatus.BAD_REQUEST, "Coupon is not active now");
    }

    // Atomic “maxUsage” enforcement (race-safe)
    if (discount.maxUsage) {
      const updated = await tx.discount.updateMany({
        where: {
          id: discount.id,
          usedCount: { lt: discount.maxUsage },
        },
        data: { usedCount: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new AppError(httpStatus.BAD_REQUEST, "This coupon has reached maximum usage");
      }
    } else {
      await tx.discount.update({
        where: { id: discount.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    // Keep audit link
    await tx.orderDiscount.create({
      data: {
        orderId,
        discountId: discount.id,
      },
    });
  }
};
