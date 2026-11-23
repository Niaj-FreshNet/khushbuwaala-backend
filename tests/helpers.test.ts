// Small shared helpers (no database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OrderStatus, PaymentState } from '@prisma/client';
import { isEnumValue } from '../src/utils/enumValue';
import { errorMessage, httpErrorOf } from '../src/utils/errorInfo';
import { asAddress } from '../src/types/records';
import { parseProductQuery } from '../src/helpers/queryBuilder';

test('enum check: only real values pass (query strings are unchecked text)', () => {
  assert.equal(isEnumValue(OrderStatus, 'RETURNED'), true);
  assert.equal(isEnumValue(OrderStatus, 'returned'), false);
  assert.equal(isEnumValue(PaymentState, 'CANCELLED'), false);
  assert.equal(isEnumValue(OrderStatus, undefined), false);
  assert.equal(isEnumValue(OrderStatus, 5), false);
});

test('error message from anything thrown', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom');
  assert.equal(errorMessage('plain'), 'plain');
  assert.equal(errorMessage({ message: 'obj' }), 'obj');
  assert.equal(errorMessage({ code: 1 }), '{"code":1}');
});

test('HTTP error details from an axios-style error', () => {
  const err = { response: { status: 422, data: { message: 'Invalid phone' } } };
  assert.deepEqual(httpErrorOf(err), { status: 422, data: { message: 'Invalid phone' }, message: 'Invalid phone' });
  assert.deepEqual(httpErrorOf(new Error('x')), { status: undefined, data: undefined, message: undefined });
});

test('order address JSON is read safely', () => {
  assert.deepEqual(asAddress({ name: 'A', district: 'Dhaka' }), { name: 'A', district: 'Dhaka' });
  assert.deepEqual(asAddress(null), {});
  assert.deepEqual(asAddress(['x']), {});
  assert.deepEqual(asAddress('text'), {});
});

test('shop query: lists, sort and gender are parsed; junk is ignored', () => {
  const q = parseProductQuery({ category: 'Attar, Perfume', sortBy: 'popularity', gender: 'female', minPrice: '100', page: '2' });
  assert.deepEqual(q.category, ['Attar', 'Perfume']);
  assert.equal(q.sort, '-salesCount');
  assert.equal(q.gender, 'FEMALE');
  assert.equal(q.minPrice, 100);
  assert.equal(q.page, 2);
  const junk = parseProductQuery({ sortBy: 'hack', gender: 'x' });
  assert.equal(junk.sortBy, undefined);
  assert.equal(junk.gender, undefined);
  assert.equal(junk.sort, '-createdAt');
});
