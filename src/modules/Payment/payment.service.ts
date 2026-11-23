import { prisma } from '../../../prisma/client';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { PaymentState, Prisma } from '@prisma/client';
import { isEnumValue } from '../../utils/enumValue';

const getAllPaymentHistory = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['id', 'gatewayInvoice', 'gatewayPaymentId']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  const { status: rawStatus, ...rest } = prismaQuery.where;
  const where: Prisma.PaymentWhereInput = rest;

  // Accept any case and the British spelling (CANCELLED -> CANCELED); ignore unknown values
  if (typeof rawStatus === 'string') {
    const s = rawStatus.toUpperCase() === 'CANCELLED' ? 'CANCELED' : rawStatus.toUpperCase();
    if (isEnumValue(PaymentState, s)) where.status = s;
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

  const meta = await queryBuilder.getPaginationMeta(() => prisma.payment.count({ where }));

  return { meta, data: payments };
};

export const PaymentServices = {
  getAllPaymentHistory,
};