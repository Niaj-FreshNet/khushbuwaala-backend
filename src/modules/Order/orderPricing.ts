import httpStatus from 'http-status';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';

/**
 * Server-side prices for WEBSITE orders. The browser's prices/totals are never trusted.
 * Rules mirror the storefront exactly:
 *  - unit price = size price minus the active automatic sale (size-specific first, else
 *    product-wide; percentage or fixed), rounded to whole taka;
 *  - a coupon that targets a product/size is applied to that item next (as /discount/apply does);
 *  - an ORDER-level coupon is applied once to the subtotal (rounded, never above it);
 *  - delivery: ৳60 inside Dhaka, ৳120 outside; free when (subtotal − coupon) ≥ ৳1000.
 */
export const FREE_SHIPPING_MIN = 1000;
const SHIPPING_INSIDE_DHAKA = 60;
const SHIPPING_OUTSIDE_DHAKA = 120;

type Line = { productId: string; variantId?: string | null; size?: number | null; unit?: string | null; quantity: number };

const isActive = (d: { startDate: Date | null; endDate: Date | null }, now: Date) =>
  (!d.startDate || d.startDate <= now) && (!d.endDate || d.endDate >= now);

const applyDiscount = (price: number, d: { type: string; value: number }) =>
  d.type === 'percentage' ? price * (1 - d.value / 100) : Math.max(0, price - d.value);

export const priceWebsiteOrder = async (lines: Line[], couponCode?: string | null, district?: string | null) => {
  if (!lines.length) throw new AppError(httpStatus.BAD_REQUEST, 'Your cart is empty.');
  const code = couponCode ? String(couponCode).trim().toUpperCase() : null;

  const productIds = [...new Set(lines.map((l) => String(l.productId)))];
  const [variants, products, discounts] = await Promise.all([
    prisma.productVariant.findMany({ where: { productId: { in: productIds } } }),
    prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, published: true } }),
    prisma.discount.findMany({ where: { OR: [{ productId: { in: productIds } }, ...(code ? [{ code }] : [])] } }),
  ]);
  return computeWebsitePricing(lines, { variants, products, discounts }, code, district, new Date());
};

type PricingData = {
  variants: Array<{ id: string; productId: string; size: number; unit: string; price: number; published?: boolean | null; [k: string]: any }>;
  products: Array<{ id: string; name: string; published: boolean | null }>;
  discounts: Array<{
    code: string | null; scope: string; type: string; value: number; productId: string | null; variantId: string | null;
    startDate: Date | null; endDate: Date | null; maxUsage: number | null; usedCount: number;
  }>;
};

/** The pricing rules on already-loaded data (no database), so they can be unit-tested. */
export const computeWebsitePricing = (lines: Line[], data: PricingData, code: string | null, district: string | null | undefined, now: Date) => {
  if (!lines.length) throw new AppError(httpStatus.BAD_REQUEST, 'Your cart is empty.');
  const { variants, products, discounts } = data;
  const productMap = new Map(products.map((p) => [p.id, p]));
  const active = discounts.filter((d) => isActive(d, now));
  const coupon = code ? discounts.find((d) => (d.code || '').toUpperCase() === code) : undefined;
  const couponUsable = !!coupon && isActive(coupon, now) && !(coupon.maxUsage && coupon.usedCount >= coupon.maxUsage);

  const priced = lines.map((l) => {
    const product = productMap.get(String(l.productId));
    if (!product || !product.published) {
      throw new AppError(httpStatus.BAD_REQUEST, 'An item in your cart is no longer available. Please refresh your cart.');
    }
    const own = variants.filter((v) => v.productId === product.id);
    const variant =
      (l.variantId && own.find((v) => v.id === String(l.variantId))) ||
      (l.size != null && (own.find((v) => Number(v.size) === Number(l.size) && (!l.unit || String(v.unit).toUpperCase() === String(l.unit).toUpperCase())) ?? own.find((v) => Number(v.size) === Number(l.size)))) ||
      null;
    if (!variant || variant.published === false) {
      throw new AppError(httpStatus.BAD_REQUEST, `${product.name}: the selected size is no longer available. Please refresh your cart.`);
    }
    const qty = Math.max(1, Math.floor(Number(l.quantity) || 1));
    const listPrice = Number(variant.price) || 0;

    // Automatic sale (no code): exact size first, else product-wide
    const auto =
      active.find((d) => !d.code && d.scope === 'VARIANT' && d.variantId === variant.id) ||
      active.find((d) => !d.code && d.scope === 'PRODUCT' && d.productId === product.id);
    let unit = auto ? applyDiscount(listPrice, auto) : listPrice;

    // Coupon that targets this product/size
    if (couponUsable && coupon && (coupon.scope === 'PRODUCT' || coupon.scope === 'VARIANT')) {
      const hits = coupon.scope === 'VARIANT' ? coupon.variantId === variant.id : coupon.productId === product.id;
      if (hits) unit = applyDiscount(unit, coupon);
    }
    unit = Math.max(0, Math.round(unit));
    return { productId: product.id, variantId: variant.id, size: variant.size, unit: variant.unit, variant, quantity: qty, listPrice, unitPrice: unit };
  });

  const subtotal = priced.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  let couponDiscount = 0;
  if (couponUsable && coupon && coupon.scope === 'ORDER') {
    couponDiscount = coupon.type === 'percentage' ? Math.round(subtotal * (coupon.value / 100)) : Math.round(coupon.value);
    couponDiscount = Math.min(Math.max(0, couponDiscount), subtotal);
  }

  const afterCoupon = Math.max(0, subtotal - couponDiscount);
  // Storefront: starts on the inside-Dhaka rate and switches to outside-Dhaka only when a
  // district other than "Dhaka" is selected (no district → inside-Dhaka rate).
  const d = String(district || '').trim().toLowerCase();
  const insideDhaka = !d || d === 'dhaka';
  const shipping = afterCoupon >= FREE_SHIPPING_MIN ? 0 : insideDhaka ? SHIPPING_INSIDE_DHAKA : SHIPPING_OUTSIDE_DHAKA;

  return {
    lines: priced,
    subtotal,
    couponDiscount,
    couponApplied: couponUsable && !!coupon,
    shipping,
    total: afterCoupon + shipping,
  };
};
