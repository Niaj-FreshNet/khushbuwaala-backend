/**
 * Steadfast courier settlement (D-026). One place decides what a courier outcome means for an
 * order; the webhook, the status sync and the payout sync all use it.
 *
 * Order life cycle (industry standard, cash on delivery):
 *   SHIPPED   booked with Steadfast (in_review / pending / hold / *_approval_pending: rider has
 *             reported, Steadfast has not approved yet; nothing changes on our side)
 *   DELIVERED Steadfast approved "delivered" (money is with Steadfast)
 *   COMPLETED + PAID   the parcel is in a PAID Steadfast payout ("Cleared" in the Steadfast panel)
 *   CANCELED  Steadfast "partial_delivered": customer refused but paid (part of) the delivery
 *             charge; parcel back; returnChargeCollected = cod_amount            (D-025)
 *   RETURNED  Steadfast "cancelled": refused and paid nothing; parcel back; courier fee = loss
 *
 * Anything that would undo a closed sale (e.g. Steadfast says returned but we show it completed)
 * is NOT changed automatically: the order gets a `courierReview` note for a person to check.
 */
import { prisma } from '../../../prisma/client';
import { syncStockForStatusChange } from '../../utils/orderStock';
import { errorMessage } from '../../utils/errorInfo';
import type { OrderStatus, Prisma } from '@prisma/client';

const BASE_URL = 'https://portal.packzy.com/api/v1';
const headers = () => ({
  'Api-Key': process.env.STEADFAST_API_KEY || '',
  'Secret-Key': process.env.STEADFAST_SECRET_KEY || '',
  'Content-Type': 'application/json',
});

export const steadfastConfigured = () => !!process.env.STEADFAST_API_KEY && !!process.env.STEADFAST_SECRET_KEY;

/** A parcel inside a Steadfast payout */
type SfParcel = {
  consignment_id?: number;
  invoice?: string;
  tracking_code?: string;
  cod_amount?: number | string;
  status?: string;
  created_at?: string;
};
/** A Steadfast payout ("Payments" in their panel); the detail call adds consignments */
type SfPayout = {
  payment_id: string;
  status_label?: string;
  amount?: number | string;
  method?: string | null;
  due_bills?: number | string;
  paid_bills?: number | string;
  charges?: number | string;
  total?: number | string;
  created_at?: string;
  ready_at?: string;
  paid_at?: string;
  consignments?: SfParcel[];
};

/** GET from the Steadfast API; T describes the fields this file reads */
const sfGet = async <T>(path: string): Promise<T> => {
  const res = await fetch(`${BASE_URL}/${path}`, { headers: headers(), signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Steadfast ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
};

/** Steadfast writes dates as "2026-11-14 12:54:00" (Dhaka time) or ISO with Z. */
const sfDate = (v?: string | null) => {
  if (!v) return null;
  const s = String(v);
  const d = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? new Date(s) : new Date(s.replace(' ', 'T') + '+06:00');
  return Number.isNaN(d.getTime()) ? null : d;
};

const cleanInvoice = (v: unknown) => String(v ?? '').replace(/^#/, '').trim();
const isCod = (method?: string | null) => /cash|cod/i.test(String(method || ''));
const money = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`;

const ACTIVE: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

type Outcome = {
  status: string;                 // Steadfast delivery status
  codAmount?: number | null;      // what the rider collected
  deliveryCharge?: number | null; // Steadfast's fee
  payout?: { payoutId: string; paidAt: Date | null; paid: boolean } | null;
  consignmentId?: number | null;
  trackingCode?: string | null;
};

/**
 * The rules, with no database: what this Steadfast outcome means for this order.
 * Returns the new status (or null), fields to set, and a review note (undefined = leave as is,
 * null = clear, text = a person must check).
 */
export const decideCourierOutcome = (
  order: { status: string; isPaid: boolean; method?: string | null; amount?: number | null; shippingCost?: number | null },
  o: Outcome,
  cod: number | null
) => {
  const sf = String(o.status || '').toLowerCase();
  const current = order.status as string;
  const data: Prisma.OrderUpdateInput = {};
  let next: OrderStatus | null = null;
  let review: string | null | undefined;

    if (sf === 'delivered') {
      if (current === 'CANCELED' || current === 'RETURNED') {
        review = `Steadfast says DELIVERED${cod !== null ? ` (collected ${money(cod)})` : ''}, but the order is ${current}. Check and correct.`;
      } else if (o.payout?.paid) {
        next = 'COMPLETED';
        data.isPaid = true;
        // Cash-on-delivery check: did Steadfast collect what the customer owed?
        if (cod !== null && isCod(order.method)) {
          const due = Number(order.amount) || 0;
          if (Math.abs(cod - due) >= 1) {
            review = `Steadfast collected ${money(cod)} but the order total is ${money(due)} (${cod < due ? 'short' : 'over'} ${money(Math.abs(due - cod))}). Check the items or the amount.`;
          } else review = null;
        } else review = null;
      } else if (current !== 'COMPLETED') {
        next = 'DELIVERED';
      }
    } else if (sf === 'partial_delivered' || sf === 'cancelled') {
      const target = sf === 'partial_delivered' ? 'CANCELED' : 'RETURNED';
      if (current === 'COMPLETED' || (current === 'DELIVERED' && order.isPaid)) {
        review = `Steadfast says ${sf === 'partial_delivered' ? 'returned with the delivery charge paid' : 'returned unpaid'}${cod !== null ? ` (collected ${money(cod)})` : ''}, but the order is ${current}${order.isPaid ? ' and paid' : ''}. Check and correct.`;
      } else {
        if (current !== target) next = target; // includes RETURNED <-> CANCELED (stock already back, no movement)
        // Steadfast cod_amount: on partial_delivered the rider changes it to what was actually
        // collected; on cancelled it is still the BOOKED amount (nothing was collected).
        data.returnChargeCollected = target === 'RETURNED' ? 0 : cod !== null ? Math.max(0, cod) : Number(order.shippingCost) || 0;
        // Far more than a delivery charge means the customer KEPT some items (a real partial
        // delivery): the money is kept as collected, and a person records the kept items.
        const charge = Number(order.shippingCost) || 120;
        review = target === 'CANCELED' && cod !== null && cod > Math.max(2 * charge, 250)
          ? `Steadfast collected ${money(cod)} on this returned parcel, far more than a delivery charge (${money(charge)}). If the customer kept some items, record them as a sale.`
          : null;
      }
    }

  return { next, data, review };
};

/**
 * Apply one Steadfast outcome to one order, inside a transaction. Returns a short description of
 * what changed (or null when nothing did).
 */
export const applyCourierOutcome = async (orderId: string, o: Outcome) => {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return null;
    const sf = String(o.status || '').toLowerCase(); // courier status as stored
    const cod = o.codAmount === undefined || o.codAmount === null || !Number.isFinite(Number(o.codAmount)) ? null : Number(o.codAmount);
    const data: Prisma.OrderUpdateInput = { courierStatus: sf || order.courierStatus, courierSyncedAt: new Date() };
    const notes: string[] = [];

    if (o.deliveryCharge !== undefined && o.deliveryCharge !== null && Number(o.deliveryCharge) > 0) data.deliveryCharge = Number(o.deliveryCharge);
    if (o.consignmentId && Number(o.consignmentId) !== order.consignmentId) {
      // Re-booked parcels have a new consignment id; keep the one Steadfast actually settled.
      const taken = await tx.order.count({ where: { consignmentId: Number(o.consignmentId), NOT: { id: order.id } } });
      if (!taken) { data.consignmentId = Number(o.consignmentId); notes.push(`consignment ${order.consignmentId ?? '-'} -> ${o.consignmentId}`); }
    }
    if (o.trackingCode && o.trackingCode !== order.trackingCode) data.trackingCode = o.trackingCode;
    // Money actually collected: delivered / partial_delivered amounts; a cancelled parcel collected
    // nothing (its cod_amount is the booked amount). In-between states carry the booked amount only.
    const sfNow = String(o.status || '').toLowerCase();
    if (cod !== null && (sfNow === 'delivered' || sfNow === 'partial_delivered')) data.courierCodCollected = cod;
    if (sfNow === 'cancelled') data.courierCodCollected = 0;

    const decided = decideCourierOutcome(order, o, cod);
    Object.assign(data, decided.data);
    const next = decided.next;
    const current = order.status as string;
    const review = decided.review;

    if (o.payout) {
      data.courierPayoutId = o.payout.payoutId;
      data.courierPaidAt = o.payout.paidAt;
    }
    if (review !== undefined) data.courierReview = review;

    if (next && next !== current) {
      await syncStockForStatusChange(tx, order, next); // returns/takes stock exactly once
      data.status = next;
      notes.unshift(`${current} -> ${next}`);
    }
    if (data.isPaid && !order.isPaid) notes.push('DUE -> PAID');
    if (data.returnChargeCollected !== undefined && data.returnChargeCollected !== order.returnChargeCollected) notes.push(`collected ${money(Number(data.returnChargeCollected))}`);
    if (review && review !== order.courierReview) notes.push(`REVIEW: ${review}`);

    await tx.order.update({ where: { id: order.id }, data });
    return notes.length ? `#${order.invoice}: ${notes.join('; ')}` : null;
  }, { maxWait: 10000, timeout: 20000 });
};

/** Find our order for a Steadfast parcel: same invoice, parcel booked within -2..+45 days; else same consignment id. */
const findOrderForParcel = async (parcel: { invoice?: string; consignment_id?: number; created_at?: string }) => {
  const inv = cleanInvoice(parcel.invoice);
  const booked = sfDate(parcel.created_at);
  if (inv && inv.toUpperCase() !== 'N/A') {
    const o = await prisma.order.findUnique({ where: { invoice: inv }, select: { id: true, orderTime: true } });
    if (o) {
      const days = booked ? (booked.getTime() - o.orderTime.getTime()) / 864e5 : 0;
      if (days >= -2 && days <= 45) return o.id;
    }
  }
  if (parcel.consignment_id) {
    const o = await prisma.order.findUnique({ where: { consignmentId: Number(parcel.consignment_id) }, select: { id: true } });
    if (o) return o.id;
  }
  return null;
};

/** Payouts (Steadfast "Payments"): newest first, stop after a page with nothing new. */
const syncPayouts = async (log: string[], full = false) => {
  let created = 0, updated = 0, parcelsApplied = 0;
  for (let page = 1; page <= 60; page++) {
    const list = (await sfGet<{ payments?: SfPayout[] }>(`payments?sort=desc&page=${page}`)).payments || [];
    if (!list.length) break;
    let newOnPage = 0;
    for (const p of list) {
      const existing = await prisma.courierPayout.findUnique({ where: { payoutId: p.payment_id } });
      const paid = String(p.status_label).toLowerCase() === 'paid';
      if (existing && existing.statusLabel === p.status_label && existing.processed && !full) continue;
      newOnPage++;
      const detail = (await sfGet<{ payment?: SfPayout }>(`payments/${p.payment_id}`)).payment || p;
      const paidAt = sfDate(detail.paid_at);
      const parcels: { consignmentId?: number; invoice: string | null; trackingCode: string | null; codAmount: number; status?: string; bookedAt: string | null; orderId: string | null }[] = [];
      for (const c of detail.consignments || []) {
        const orderId = await findOrderForParcel(c);
        let result: string | null = null;
        if (orderId) {
          result = await applyCourierOutcome(orderId, {
            status: c.status ?? '', codAmount: c.cod_amount === undefined ? null : Number(c.cod_amount), consignmentId: c.consignment_id, trackingCode: c.tracking_code,
            payout: { payoutId: p.payment_id, paidAt, paid },
          });
          if (result) { parcelsApplied++; log.push(result); }
        }
        parcels.push({
          consignmentId: c.consignment_id, invoice: cleanInvoice(c.invoice) || null, trackingCode: c.tracking_code || null,
          codAmount: Number(c.cod_amount) || 0, status: c.status, bookedAt: c.created_at || null, orderId,
        });
      }
      const data = {
        provider: 'STEADFAST', amount: Number(detail.amount) || 0, method: detail.method || null,
        dueBills: Number(detail.due_bills) || 0, paidBills: Number(detail.paid_bills) || 0, charges: Number(detail.charges) || 0,
        total: Number(detail.total) || 0, statusLabel: String(detail.status_label || p.status_label),
        courierCreatedAt: sfDate(detail.created_at), readyAt: sfDate(detail.ready_at), paidAt,
        parcels, parcelCount: parcels.length, matchedCount: parcels.filter((x) => x.orderId).length,
        processed: paid, syncedAt: new Date(),
      };
      if (existing) { await prisma.courierPayout.update({ where: { id: existing.id }, data }); updated++; }
      else { await prisma.courierPayout.create({ data: { payoutId: p.payment_id, ...data } }); created++; }
    }
    if (!newOnPage && !full) break; // everything older is already in
  }
  return { created, updated, parcelsApplied };
};

/** Open courier orders: ask Steadfast for the current status (in case a webhook was missed). */
const syncOpenOrders = async (log: string[]) => {
  const open = await prisma.order.findMany({
    where: { consignmentId: { not: null }, status: { in: ACTIVE } },
    select: { id: true, invoice: true },
  });
  let checked = 0, changed = 0;
  for (const o of open) {
    try {
      const r = await sfGet<{ delivery_status?: string }>(`status_by_invoice/${encodeURIComponent(o.invoice)}`);
      checked++;
      if (r?.delivery_status) {
        const res = await applyCourierOutcome(o.id, { status: r.delivery_status });
        if (res) { changed++; log.push(res); }
      }
    } catch (e) {
      log.push(`#${o.invoice}: status check failed (${errorMessage(e)})`);
    }
  }
  return { checked, changed };
};

type SyncResult = {
  at: string; ok: boolean; ms: number; changes: string[]; error?: string; trigger: string;
  openOrders?: { checked: number; changed: number };
  payouts?: { created: number; updated: number; parcelsApplied: number };
};
let running: Promise<SyncResult> | null = null;
let last: SyncResult | null = null;

export const getLastCourierSync = () => last;

export const runCourierSync = (trigger: string, opts: { full?: boolean } = {}): Promise<SyncResult> => {
  if (running) return running; // never two at once
  running = (async () => {
    const t0 = Date.now();
    const changes: string[] = [];
    const out: SyncResult = { at: new Date().toISOString(), ok: true, ms: 0, changes, trigger };
    try {
      if (!steadfastConfigured()) throw new Error('Steadfast keys are not set');
      out.openOrders = await syncOpenOrders(changes);
      out.payouts = await syncPayouts(changes, !!opts.full);
    } catch (e) {
      out.ok = false;
      out.error = errorMessage(e);
    }
    out.ms = Date.now() - t0;
    last = out;
    console.log(`[courier sync] ${trigger}: ${out.ok ? 'ok' : 'FAILED ' + out.error} in ${out.ms} ms; ${changes.length} change(s)`);
    for (const c of changes) console.log(`[courier sync]   ${c}`);
    return out;
  })().finally(() => { running = null; });
  return running;
};

/** Every 30 minutes on the live server (not in local development). */
export const startCourierSyncSchedule = () => {
  if (process.env.NODE_ENV !== 'production' || !steadfastConfigured() || process.env.COURIER_SYNC === 'off') return;
  const every = 30 * 60 * 1000;
  setTimeout(() => void runCourierSync('startup'), 60 * 1000);
  setInterval(() => void runCourierSync('schedule'), every).unref();
  console.log('[courier sync] scheduled every 30 minutes');
};
