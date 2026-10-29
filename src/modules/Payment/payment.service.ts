import { prisma } from '../../../prisma/client';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';

const getAllPaymentHistory = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['id', 'gatewayInvoice', 'gatewayPaymentId']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const where: any = prismaQuery.where || {};

  // ✅ Match your exact schema PaymentState enums and safely auto-correct common spelling variations (like CANCELLED -> CANCELED)
  if (where.status && typeof where.status === 'string') {
    const statusVal = where.status.toUpperCase();
    const validStatuses = ['INITIATED', 'COMPLETED', 'FAILED', 'CANCELED', 'CANCELLED', 'REFUNDED'];

    if (validStatuses.includes(statusVal)) {
      // Normalize 'CANCELLED' to 'CANCELED' to match your schema enum
      where.status = statusVal === 'CANCELLED' ? 'CANCELED' : statusVal;
    } else {
      delete where.status;
    }
  }

  const payments = await prisma.payment.findMany({
    ...prismaQuery,
    where,
    include: {
      order: {
        select: {
          id: true,
          invoice: true,
          amount: true,
          method: true,
          status: true,
          isPaid: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.payment.count({ where: args.where }),
  });

  return { meta, data: payments };
};

export const PaymentServices = {
  getAllPaymentHistory,
};