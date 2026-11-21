import { Prisma } from '@prisma/client';

/**
 * One place that moves stock when an order changes state, so stock is never returned or
 * taken twice. `Order.stockReturned` remembers whether this order's stock is back on the shelf.
 *
 *   active -> CANCELED/RETURNED : put stock back   (stockReturned = true)
 *   CANCELED/RETURNED -> active : take stock again (stockReturned = false)
 *   delete                      : put stock back only if it is still out
 *
 * Stock is tracked in liquid units on Product.stock (variant size x quantity), the same way
 * sales and orders deduct it.
 */
export const INACTIVE_ORDER_STATUSES = ['CANCELED', 'RETURNED'];

const isInactive = (status?: string | null) => INACTIVE_ORDER_STATUSES.includes(String(status || '').toUpperCase());

type Tx = Prisma.TransactionClient;

const moveStock = async (tx: Tx, orderId: string, direction: 'return' | 'take', reason: string) => {
  const items = await tx.cartItem.findMany({
    where: { orderId },
    select: { productId: true, variantId: true, quantity: true, size: true, variant: { select: { size: true } } },
  });

  for (const item of items) {
    if (!item.productId) continue;
    const qty = Math.max(1, Number(item.quantity) || 1);
    const amount = (Number(item.variant?.size ?? item.size) || 0) * qty;
    const sign = direction === 'return' ? 1 : -1;

    // The product may have been deleted long ago; skip it instead of failing the whole update.
    const exists = await tx.product.count({ where: { id: item.productId } });
    if (!exists) continue;

    await tx.product.update({
      where: { id: item.productId },
      data: {
        stock: { increment: sign * amount },
        salesCount: { increment: -sign * qty },
      },
    });
    await tx.stockLog.create({
      data: { productId: item.productId, variantId: item.variantId || null, change: sign * amount, reason },
    });
  }
};

/** Call inside the same transaction as the status update, with the order's previous state. */
export const syncStockForStatusChange = async (
  tx: Tx,
  order: { id: string; status: string; stockReturned?: boolean | null },
  nextStatus: string | undefined
) => {
  if (!nextStatus || String(nextStatus).toUpperCase() === String(order.status).toUpperCase()) return;
  const returned = !!order.stockReturned;

  if (isInactive(nextStatus) && !returned) {
    await moveStock(tx, order.id, 'return', `ORDER_${String(nextStatus).toUpperCase()}`);
    await tx.order.update({ where: { id: order.id }, data: { stockReturned: true } });
  } else if (!isInactive(nextStatus) && returned) {
    await moveStock(tx, order.id, 'take', 'ORDER_REACTIVATED');
    await tx.order.update({ where: { id: order.id }, data: { stockReturned: false } });
  }
};

/** Call inside the delete transaction, before the order's lines are removed. */
export const returnStockBeforeDelete = async (tx: Tx, order: { id: string; stockReturned?: boolean | null }) => {
  if (order.stockReturned) return;
  await moveStock(tx, order.id, 'return', 'ORDER_DELETED');
};
