// Shared money formula, Dhaka day boundaries and the stock "claim" guard. No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderFinancials } from '../src/modules/Finance/finance.service';
import { dhakaDayEnd, dhakaDayStart } from '../src/utils/dhakaTime';
import { cancelAbandonedCheckout, syncStockForStatusChange } from '../src/utils/orderStock';

test('sales = item lines minus order discount; delivery is not sales', () => {
  const f = calculateOrderFinancials({
    status: 'PENDING', orderSource: 'WEBSITE', method: 'cashOnDelivery', amount: 1060, shippingCost: 60, discountAmount: 100,
    orderItems: [{ price: 550, quantity: 2 }],
  });
  assert.equal(f.productBill, 1000);
  assert.equal(f.isValidOrderCount, 1);
});

test('cancelled and returned orders count as 0 sales', () => {
  for (const status of ['CANCELED', 'RETURNED']) {
    const f = calculateOrderFinancials({ status, orderSource: 'WEBSITE', amount: 500, orderItems: [{ price: 500, quantity: 1 }] });
    assert.equal(f.productBill, 0);
    assert.equal(f.isValidOrderCount, 0);
  }
});

test('showroom sale counts what was charged', () => {
  const f = calculateOrderFinancials({ status: 'COMPLETED', orderSource: 'SHOWROOM', amount: 900, discountAmount: 100, orderItems: [{ price: 500, quantity: 2 }] });
  assert.equal(f.productBill, 900);
  assert.equal(f.netReceivable, 900);
});

test('order with only the JSON item list falls back to amount minus delivery', () => {
  const f = calculateOrderFinancials({ status: 'DELIVERED', orderSource: 'WEBSITE', amount: 720, shippingCost: 120, cartItems: [] });
  assert.equal(f.productBill, 600);
});

test('a "2026-11-21" filter means the Bangladesh calendar day', () => {
  assert.equal(dhakaDayStart('2026-11-21').toISOString(), '2026-11-20T18:00:00.000Z');
  assert.equal(dhakaDayEnd('2026-11-21').toISOString(), '2026-11-21T17:59:59.999Z');
  assert.equal(dhakaDayStart('2026-11-21T05:00:00Z').toISOString(), '2026-11-21T05:00:00.000Z');
});

// A fake transaction that records stock moves
const fakeTx = (opts: { claimCount: number; stockReturned?: boolean }) => {
  const moves: Array<{ productId: string; change: number }> = [];
  const tx: any = {
    order: {
      updateMany: async () => ({ count: opts.claimCount }),
      update: async () => ({}),
      findUnique: async () => ({ stockReturned: !!opts.stockReturned }),
    },
    cartItem: { findMany: async () => [{ productId: 'p1', variantId: 'v6', quantity: 2, size: 6, variant: { size: 6 } }] },
    product: {
      count: async () => 1,
      update: async ({ data }: any) => { moves.push({ productId: 'p1', change: data.stock.increment }); return {}; },
    },
    stockLog: { create: async () => ({}) },
  };
  return { tx, moves };
};

test('abandoned checkout: stock goes back only for the request that claims the order', async () => {
  const first = fakeTx({ claimCount: 1 });
  assert.equal(await cancelAbandonedCheckout(first.tx, 'o1'), true);
  assert.deepEqual(first.moves, [{ productId: 'p1', change: 12 }]);

  const second = fakeTx({ claimCount: 0 }); // already claimed by the first request
  assert.equal(await cancelAbandonedCheckout(second.tx, 'o1'), false);
  assert.deepEqual(second.moves, []);
});

test('status change returns stock once and takes it again on re-open', async () => {
  const cancel = fakeTx({ claimCount: 1 });
  await syncStockForStatusChange(cancel.tx, { id: 'o1', status: 'PENDING', stockReturned: false }, 'CANCELED');
  assert.deepEqual(cancel.moves, [{ productId: 'p1', change: 12 }]);

  const again = fakeTx({ claimCount: 1 });
  await syncStockForStatusChange(again.tx, { id: 'o1', status: 'CANCELED', stockReturned: true }, 'RETURNED');
  assert.deepEqual(again.moves, []); // already back on the shelf

  const reopen = fakeTx({ claimCount: 1 });
  await syncStockForStatusChange(reopen.tx, { id: 'o1', status: 'CANCELED', stockReturned: true }, 'PROCESSING');
  assert.deepEqual(reopen.moves, [{ productId: 'p1', change: -12 }]);
});
