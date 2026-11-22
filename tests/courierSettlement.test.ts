// Steadfast settlement rules (D-026). Pure decision function, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideCourierOutcome } from '../src/modules/Steadfast/courierSync';

const cod = { status: 'SHIPPED', isPaid: false, method: 'cashOnDelivery', amount: 770, shippingCost: 120 };
const paidPayout = { payoutId: 'SFC-1', paidAt: new Date(), paid: true };

test('approval pending (rider reported, Steadfast not approved): nothing changes', () => {
  for (const s of ['in_review', 'pending', 'hold', 'delivered_approval_pending', 'partial_delivered_approval_pending', 'cancelled_approval_pending', 'unknown']) {
    const r = decideCourierOutcome(cod, { status: s }, null);
    assert.equal(r.next, null, s);
    assert.deepEqual(r.data, {}, s);
  }
});

test('delivered (approved) -> DELIVERED, still due', () => {
  const r = decideCourierOutcome(cod, { status: 'delivered' }, 770);
  assert.equal(r.next, 'DELIVERED');
  assert.equal(r.data.isPaid, undefined);
});

test('cleared in a paid payout -> COMPLETED + PAID, amounts match -> no review', () => {
  const r = decideCourierOutcome({ ...cod, status: 'DELIVERED' }, { status: 'delivered', payout: paidPayout }, 770);
  assert.equal(r.next, 'COMPLETED');
  assert.equal(r.data.isPaid, true);
  assert.equal(r.review, null);
});

test('cleared but Steadfast collected less than the order total -> COMPLETED + PAID with a review note', () => {
  const r = decideCourierOutcome({ ...cod, amount: 1300 }, { status: 'delivered', payout: paidPayout }, 770);
  assert.equal(r.next, 'COMPLETED');
  assert.match(String(r.review), /short ৳530/);
});

test('prepaid (online) order cleared with ৳0 collected is fine', () => {
  const r = decideCourierOutcome({ ...cod, method: 'online', isPaid: true }, { status: 'delivered', payout: paidPayout }, 0);
  assert.equal(r.next, 'COMPLETED');
  assert.equal(r.review, null);
});

test('a payout that is only "ready" (not paid yet) does not complete the order', () => {
  const r = decideCourierOutcome(cod, { status: 'delivered', payout: { payoutId: 'SFC-2', paidAt: null, paid: false } }, 770);
  assert.equal(r.next, 'DELIVERED');
  assert.equal(r.data.isPaid, undefined);
});

test('partial_delivered -> CANCELED with the amount the rider collected (also corrects RETURNED)', () => {
  assert.deepEqual(decideCourierOutcome(cod, { status: 'partial_delivered' }, 100), { next: 'CANCELED', data: { returnChargeCollected: 100 }, review: null });
  assert.equal(decideCourierOutcome({ ...cod, status: 'RETURNED' }, { status: 'partial_delivered' }, 100).next, 'CANCELED');
  assert.equal(decideCourierOutcome(cod, { status: 'partial_delivered' }, null).data.returnChargeCollected, 120); // no amount sent: the delivery charge
});

test('cancelled -> RETURNED, nothing collected (courier fee is the loss)', () => {
  assert.deepEqual(decideCourierOutcome(cod, { status: 'cancelled' }, 0), { next: 'RETURNED', data: { returnChargeCollected: 0 }, review: null });
});

test('conflicts are never changed automatically, only flagged', () => {
  const back = decideCourierOutcome({ ...cod, status: 'CANCELED' }, { status: 'delivered', payout: paidPayout }, 770);
  assert.equal(back.next, null);
  assert.match(String(back.review), /says DELIVERED/);
  const sold = decideCourierOutcome({ ...cod, status: 'COMPLETED', isPaid: true }, { status: 'cancelled' }, 0);
  assert.equal(sold.next, null);
  assert.match(String(sold.review), /returned unpaid/);
});

test('partial_delivered with far more than a delivery charge: kept items -> flagged for a person', () => {
  const r = decideCourierOutcome(cod, { status: 'partial_delivered' }, 1080);
  assert.equal(r.next, 'CANCELED');
  assert.equal(r.data.returnChargeCollected, 1080);
  assert.match(String(r.review), /kept some items/);
  assert.equal(decideCourierOutcome(cod, { status: 'partial_delivered' }, 150).review, null); // a bit extra is normal
});
