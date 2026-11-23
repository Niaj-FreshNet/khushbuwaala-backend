// The Purchase event sent to Meta from the server (no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { buildMetaPurchasePayload, metaPurchaseEventId, normalizeBdPhone } from '../src/utils/metaPurchase';

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const order = {
  id: 'abc123',
  amount: 1130,
  shippingCost: 130,
  shipping: { name: '  Rahim  Uddin Ahmed ', district: 'Cox\'s Bazar', fbp: 'fb.1.1.2', fbc: null },
  orderItems: [{ productId: 'p1', quantity: 2, price: 500 }, { productId: null, product: null, quantity: 1, price: 1 }],
};
const build = (extra = {}) =>
  buildMetaPurchasePayload(order, { email: ' Rahim@Example.com ', phone: '01712-345678', nowSeconds: 1000, siteUrl: 'https://khushbuwaala.com', ...extra });

test('phone numbers are sent to Meta with the country code', () => {
  assert.equal(normalizeBdPhone('01712-345678'), '8801712345678');
  assert.equal(normalizeBdPhone('+880 1712 345678'), '8801712345678');
  assert.equal(normalizeBdPhone('1712345678'), '8801712345678');
  assert.equal(normalizeBdPhone(''), undefined);
  assert.equal(normalizeBdPhone('123'), undefined);
});

test('purchase event: same id as the browser event, order totals, only real items', () => {
  const event = build().data[0];
  assert.equal(event.event_id, 'kw_abc123');
  assert.equal(event.event_id, metaPurchaseEventId('abc123'));
  assert.equal(event.event_name, 'Purchase');
  assert.equal(event.action_source, 'website');
  assert.deepEqual(event.custom_data, {
    currency: 'BDT', value: 1130, shipping: 130, order_id: 'abc123',
    contents: [{ id: 'p1', quantity: 2, item_price: 500 }], content_type: 'product',
  });
});

test('customer details are hashed, cleaned first, and never sent in the clear', () => {
  const user = build().data[0].user_data;
  assert.deepEqual(user.em, [sha('rahim@example.com')]);
  assert.deepEqual(user.ph, [sha('8801712345678')]);
  assert.deepEqual(user.fn, [sha('rahim')]);
  assert.deepEqual(user.ln, [sha('uddin ahmed')]);
  assert.deepEqual(user.ct, [sha("cox'sbazar")]);
  assert.deepEqual(user.country, [sha('bd')]);
  assert.equal(user.fbp, 'fb.1.1.2');
  assert.equal(user.fbc, undefined);
  const text = JSON.stringify(build());
  assert.ok(!/rahim|1712345678|example\.com/i.test(text));
});

test('missing details are left out; the test code is only added when set', () => {
  const bare = buildMetaPurchasePayload({ id: 'x' }, { nowSeconds: 1, siteUrl: 'https://khushbuwaala.com' });
  const user = bare.data[0].user_data;
  assert.deepEqual([user.em, user.ph, user.fn, user.ln, user.ct], [undefined, undefined, undefined, undefined, undefined]);
  assert.equal('test_event_code' in bare, false);
  assert.equal(build({ testEventCode: 'TEST1' }).test_event_code, 'TEST1');
});
