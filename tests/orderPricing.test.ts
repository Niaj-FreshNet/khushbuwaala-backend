// Website order pricing rules (server decides every price). No database: pure function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWebsitePricing, type PricingData } from '../src/modules/Order/orderPricing';

const now = new Date('2026-11-22T10:00:00Z');
const product = { id: 'p1', name: 'Oud', published: true };
const v3 = { id: 'v3', productId: 'p1', size: 3, unit: 'ML', price: 300, published: true };
const v6 = { id: 'v6', productId: 'p1', size: 6, unit: 'ML', price: 550, published: true };
type Disc = PricingData['discounts'][number];
const base = { variants: [v3, v6], products: [product], discounts: [] as Disc[] };
const disc = (o: Partial<Disc>): Disc => ({
  code: null, scope: 'PRODUCT', type: 'percentage', value: 10, productId: 'p1', variantId: null,
  startDate: null, endDate: null, maxUsage: null, usedCount: 0, ...o,
});

test('list price, inside Dhaka delivery ৳60', () => {
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 2 }], base, null, 'Dhaka', now);
  assert.equal(r.subtotal, 600);
  assert.equal(r.shipping, 60);
  assert.equal(r.total, 660);
});

test('outside Dhaka delivery ৳120; no district counts as Dhaka', () => {
  assert.equal(computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], base, null, 'Sylhet', now).shipping, 120);
  assert.equal(computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], base, null, '', now).shipping, 60);
});

test('free delivery from ৳1000 after the coupon', () => {
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v6', quantity: 2 }], base, null, 'Sylhet', now);
  assert.equal(r.subtotal, 1100);
  assert.equal(r.shipping, 0);
});

test('automatic product sale (no code) applies, rounded to whole taka', () => {
  const data = { ...base, discounts: [disc({ value: 12.5 })] }; // 300 * 0.875 = 262.5 -> 263
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], data, null, 'Dhaka', now);
  assert.equal(r.lines[0].unitPrice, 263);
  assert.equal(r.lines[0].listPrice, 300);
});

test('size-specific sale wins over product-wide sale', () => {
  const data = { ...base, discounts: [disc({ value: 10 }), disc({ scope: 'VARIANT', variantId: 'v3', type: 'fixed', value: 100 })] };
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], data, null, 'Dhaka', now);
  assert.equal(r.lines[0].unitPrice, 200);
});

test('ORDER coupon works on the sale subtotal (sale first, then coupon) — D-015', () => {
  const data = { ...base, discounts: [disc({ value: 50, type: 'fixed' }), disc({ code: 'ORDER10', scope: 'ORDER', productId: null, value: 10 })] };
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v6', quantity: 2 }], data, 'ORDER10', 'Dhaka', now);
  assert.equal(r.subtotal, 1000); // (550 - 50) * 2
  assert.equal(r.couponDiscount, 100);
  assert.equal(r.shipping, 60); // 900 after coupon is below 1000
  assert.equal(r.total, 960);
  assert.equal(r.couponApplied, true);
});

test('expired or used-up coupon is ignored', () => {
  const expired = { ...base, discounts: [disc({ code: 'OLD', scope: 'ORDER', productId: null, endDate: new Date('2026-01-01') })] };
  assert.equal(computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], expired, 'OLD', 'Dhaka', now).couponDiscount, 0);
  const used = { ...base, discounts: [disc({ code: 'MAX', scope: 'ORDER', productId: null, maxUsage: 5, usedCount: 5 })] };
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], used, 'MAX', 'Dhaka', now);
  assert.equal(r.couponDiscount, 0);
  assert.equal(r.couponApplied, false);
});

test('fixed ORDER coupon never exceeds the subtotal', () => {
  const data = { ...base, discounts: [disc({ code: 'BIG', scope: 'ORDER', productId: null, type: 'fixed', value: 5000 })] };
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], data, 'BIG', 'Dhaka', now);
  assert.equal(r.couponDiscount, 300);
  assert.equal(r.total, 60);
});

test('size found by size+unit when the cart has no variant id', () => {
  const r = computeWebsitePricing([{ productId: 'p1', size: 6, unit: 'ml', quantity: 1 }], base, null, 'Dhaka', now);
  assert.equal(r.lines[0].variantId, 'v6');
});

test('hidden product or hidden size is refused; empty cart refused', () => {
  const hiddenProduct = { ...base, products: [{ ...product, published: false }] };
  assert.throws(() => computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], hiddenProduct, null, 'Dhaka', now), /no longer available/);
  const hiddenSize = { ...base, variants: [{ ...v3, published: false }, v6] };
  assert.throws(() => computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 1 }], hiddenSize, null, 'Dhaka', now), /size is no longer available/);
  assert.throws(() => computeWebsitePricing([], base, null, 'Dhaka', now), /empty/);
});

test('browser quantity is cleaned: 0 or fractions become whole, at least 1', () => {
  const r = computeWebsitePricing([{ productId: 'p1', variantId: 'v3', quantity: 2.7 }, { productId: 'p1', variantId: 'v6', quantity: 0 }], base, null, 'Dhaka', now);
  assert.deepEqual(r.lines.map((l) => l.quantity), [2, 1]);
});
