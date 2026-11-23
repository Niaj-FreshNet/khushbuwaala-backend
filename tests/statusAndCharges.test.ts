// Shared checks for status changes and courier return charges (orders and sales). No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrderStatus, parseReturnCharge } from '../src/utils/returnCharge';
import { isCodMethod } from '../src/modules/Finance/finance.service';

test('order status: any case is accepted, a typo is a 400 (not a database error)', () => {
  assert.equal(parseOrderStatus('returned'), 'RETURNED');
  assert.equal(parseOrderStatus('COMPLETED'), 'COMPLETED');
  assert.throws(() => parseOrderStatus('CANCEL'), (e: { statusCode?: number }) => e.statusCode === 400);
  assert.throws(() => parseOrderStatus(undefined), (e: { statusCode?: number }) => e.statusCode === 400);
});

test('return charge: not sent, cleared, or a number for a cancelled/returned parcel', () => {
  assert.equal(parseReturnCharge({ status: 'CANCELED' }, 'CANCELED'), undefined);
  assert.equal(parseReturnCharge({ returnChargeCollected: null }, 'RETURNED'), null);
  assert.equal(parseReturnCharge({ returnChargeCollected: '' }, 'RETURNED'), null);
  assert.equal(parseReturnCharge({ returnChargeCollected: '120' }, 'CANCELED'), 120);
  assert.equal(parseReturnCharge({ returnChargeCollected: 0 }, 'RETURNED'), 0);
});

test('return charge: refused when negative, not a number, or the order is not a return', () => {
  const is400 = (e: { statusCode?: number }) => e.statusCode === 400;
  assert.throws(() => parseReturnCharge({ returnChargeCollected: -5 }, 'CANCELED'), is400);
  assert.throws(() => parseReturnCharge({ returnChargeCollected: 'abc' }, 'CANCELED'), is400);
  assert.throws(() => parseReturnCharge({ returnChargeCollected: 100 }, 'DELIVERED'), is400);
});

test('COD fee only for cash on delivery, not for a plain cash payment', () => {
  assert.equal(isCodMethod('cashOnDelivery'), true);
  assert.equal(isCodMethod('COD'), true);
  assert.equal(isCodMethod('cash'), false); // paid in cash beforehand: no Steadfast COD fee
  assert.equal(isCodMethod('bkash'), false);
  assert.equal(isCodMethod(null), false);
});
