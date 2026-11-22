// Courier returns (owner's rule, D-025). No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderFinancials, courierReturnResult, resolveCourierCharge, resolveOrderItemCosts } from '../src/modules/Finance/finance.service';

const base = { orderSource: 'WEBSITE', method: 'cashOnDelivery', amount: 770, shippingCost: 120, orderItems: [{ price: 650, quantity: 1 }] };

test('refused but delivery charge paid (CANCELED + collected): about no loss', () => {
  const o = { ...base, status: 'CANCELED', returnChargeCollected: 120 };
  assert.deepEqual(courierReturnResult(o), { fee: 120, collected: 120, net: 0 });
  assert.equal(calculateOrderFinancials(o).netReceivable, 0);
  assert.equal(calculateOrderFinancials(o).productBill, 0); // not a sale
  assert.deepEqual(resolveOrderItemCosts(o), [{ profit: 0 }]);
});

test('customer paid less or more than the fee: the difference is the result', () => {
  assert.equal(courierReturnResult({ ...base, status: 'CANCELED', returnChargeCollected: 100 })!.net, -20);
  assert.equal(courierReturnResult({ ...base, status: 'CANCELED', returnChargeCollected: 150 })!.net, 30);
});

test('refused and not paid (RETURNED): the courier fee is a loss', () => {
  const o = { ...base, status: 'RETURNED' };
  assert.deepEqual(courierReturnResult(o), { fee: 120, collected: 0, net: -120 });
  assert.equal(calculateOrderFinancials(o).netReceivable, -120);
});

test('plain cancellation (never shipped) costs nothing and is not a courier return', () => {
  const o = { ...base, status: 'CANCELED' };
  assert.equal(courierReturnResult(o), null);
  assert.equal(calculateOrderFinancials(o).netReceivable, 0);
  assert.deepEqual(resolveOrderItemCosts(o), [{ profit: 0 }]);
});

test('showroom sales never have a courier return', () => {
  assert.equal(courierReturnResult({ ...base, orderSource: 'SHOWROOM', status: 'RETURNED' }), null);
});

test("Steadfast's real fee wins over the estimate", () => {
  assert.equal(resolveCourierCharge({ ...base, deliveryCharge: 110 }), 110);
  assert.equal(resolveCourierCharge({ ...base, deliveryCharge: 0 }), 120);
  assert.equal(resolveCourierCharge({ shippingCost: 0, shipping: { district: 'Dhaka' } }) > 0, true);
});
