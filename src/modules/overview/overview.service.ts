import { startOfDay, startOfMonth, subDays } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { prisma } from '../../../prisma/client';
import { calculateOrderFinancials } from '../Finance/finance.service';

/**
 * /overview/* uses the SAME rules as the dashboard (/order/dashboard/*) and Finance:
 *  - days and months are Bangladesh (Asia/Dhaka) calendar days, not server UTC days;
 *  - cancelled / returned orders are left out (paid or not);
 *  - "sales" = what the customer pays for products (item lines minus order discounts), via
 *    calculateOrderFinancials, so delivery charges are not counted as sales.
 * Before 2026-11-22 these endpoints counted only isPaid orders, used UTC days and included
 * delivery, so they disagreed with the dashboard. Response shapes are unchanged.
 */
const TZ = 'Asia/Dhaka';

const dhakaStart = (d: Date) => fromZonedTime(startOfDay(d), TZ);

const ordersSince = (from?: Date) =>
  prisma.order.findMany({
    where: from ? { orderTime: { gte: from } } : {},
    include: { orderItems: true },
  });

const getOverview = async () => {
  const nowDhaka = toZonedTime(new Date(), TZ);
  const todayStart = dhakaStart(nowDhaka);
  const monthStart = fromZonedTime(startOfMonth(nowDhaka), TZ);

  const orders = await ordersSince();
  let todayOrders = 0, monthOrders = 0, monthSales = 0, totalSales = 0;
  for (const o of orders) {
    const f = calculateOrderFinancials(o);
    if (f.isCanceledOrReturned) continue;
    totalSales += f.productBill;
    if (o.orderTime >= monthStart) {
      monthOrders++;
      monthSales += f.productBill;
    }
    if (o.orderTime >= todayStart) todayOrders++;
  }
  return { todayOrders, monthOrders, monthSales, totalSales };
};

// Share of the last 7 days' sales per category (actual line prices, not list prices)
export const getWeeklyOverview = async () => {
  const from = dhakaStart(subDays(toZonedTime(new Date(), TZ), 6));
  const lines = await prisma.cartItem.findMany({
    where: { order: { is: { orderTime: { gte: from }, status: { notIn: ['CANCELED', 'RETURNED'] } } } },
    select: { price: true, quantity: true, product: { select: { category: { select: { categoryName: true } } } } },
  });

  const byCategory: Record<string, number> = {};
  for (const l of lines) {
    const name = l.product?.category?.categoryName;
    if (!name) continue;
    byCategory[name] = (byCategory[name] || 0) + Number(l.price || 0) * Number(l.quantity || 1);
  }
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  const categories = await prisma.category.findMany({ select: { categoryName: true } });
  return categories.map(({ categoryName }) => ({
    category: categoryName,
    percentage: total === 0 ? 0 : Number((((byCategory[categoryName] || 0) / total) * 100).toFixed(2)),
  }));
};

// Sales per weekday for the last 7 Dhaka days
const getWeeklySales = async () => {
  const from = dhakaStart(subDays(toZonedTime(new Date(), TZ), 6));
  const orders = await ordersSince(from);

  const salesSummary: Record<string, number> = {
    Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0,
  };
  for (const o of orders) {
    const f = calculateOrderFinancials(o);
    if (f.isCanceledOrReturned) continue;
    const day = o.orderTime.toLocaleDateString('en-US', { weekday: 'long', timeZone: TZ });
    salesSummary[day] += f.productBill;
  }
  return salesSummary;
};

export const OverviewServices = {
  getOverview,
  getWeeklyOverview,
  getWeeklySales,
};
