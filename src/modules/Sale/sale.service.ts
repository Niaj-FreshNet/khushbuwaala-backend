import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import { prisma } from '../../../prisma/client';

const addSale = async (payload: any, userId: string) => {
  const {
    cartItems,
    amount,
    method,
    isPaid,
    name,
    phone,
    address,
    status,
    reference,
  } = payload;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    throw new Error('Cart items are required');
  }

  // Optionally, you may validate product existence here

  const result = await prisma.sale.create({
    data: {
      cartItems, // assumes JSON array of { productId, quantity, ... }
      amount,
      method,
      isPaid,
      name,
      phone,
      address,
      status,
      reference,
      salesmanId: userId,
    },
  });

  return result;
};

const getAllSales = async (queryParams: Record<string, unknown>) => {
  const { searchTerm, status, ...rest } = queryParams;

  const queryBuilder = new PrismaQueryBuilder(rest, ['title', 'content']);

  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect()
    .getQuery();

  // Build the complete where clause with all conditions
  const where: any = prismaQuery.where || {};

  // Add searchTerm filter for salesman name
  if (searchTerm) {
    where.OR = [
      ...(where.OR || []),
      {
        salesman: {
          name: {
            contains: String(searchTerm),
            mode: 'insensitive',
          },
        },
      },
    ];
  }

  // Add status filter
  if (status) {
    where.status = status;
  }

  // Execute the main query
  const result = await prisma.sale.findMany({
    ...prismaQuery,
    where,
    include: {
      salesman: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  // Get pagination metadata with the same where clause
  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) =>
      prisma.sale.count({
        where: {
          ...args.where,
          ...where, // Apply the same filters to the count query
        },
      }),
  });

  return {
    meta,
    data: result,
  };
};

// Get Sale details
const getSaleById = async (saleId: string) => {
  // Step 1: Get the sale (with cartItems as JSON)
  const sale = await prisma.sale.findUnique({
    where: {
      id: saleId,
    },
    include: {
      salesman: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  if (!sale) return null;

  // Step 2: Extract productIds from cartItems
  const cartItems = sale.cartItems as {
    productId: string;
    quantity: number;
  }[];
  const productIds = cartItems.map((item) => item.productId);

  // Step 3: Fetch product details
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
  });

  // Step 4: Combine cartItems with product info
  const detailedCartItems = cartItems.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return {
      ...item,
      product,
    };
  });

  // Step 5: Return enriched sale
  return {
    ...sale,
    cartItems: detailedCartItems,
  };
};

// Get user's sales BY ID
const getUserSales = async (
  id: string,
  queryParams: Record<string, unknown>,
) => {
  // Extract searchTerm and rest params
  const { searchTerm, ...rest } = queryParams;

  // Build base query without searchTerm filters
  const queryBuilder = new PrismaQueryBuilder(rest);
  const prismaQuery = queryBuilder
    .buildSort()
    .buildPagination()
    .buildSelect()
    .getQuery();

  // Base where filter by salesman
  const where: any = {
    salesmanId: id,
  };

  // If there's a search term, we need to handle it specially for JSON fields
  if (
    searchTerm &&
    typeof searchTerm === 'string' &&
    searchTerm.trim() !== ''
  ) {
    const s = searchTerm.trim();

    // Define valid OrderStatus enum values
    const validOrderStatuses = [
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'CANCELLED',
    ];

    // Build OR conditions for searchable string fields
    const orConditions: any[] = [
      { id: { contains: s, mode: 'insensitive' } },
      { method: { contains: s, mode: 'insensitive' } },
      { address: { contains: s, mode: 'insensitive' } },
      { email: { contains: s, mode: 'insensitive' } },
    ];

    // Add status search if the search term matches a valid enum value
    const matchingStatus = validOrderStatuses.find(
      (status) => status.toLowerCase() === s.toLowerCase(),
    );

    if (matchingStatus) {
      orConditions.push({ status: { equals: matchingStatus } });
    }

    // For searching in cartItems, we'll need to do it post-query
    // First, get all sales for this salesman
    const allSales = await prisma.sale.findMany({
      where: { salesmanId: id },
      include: {
        salesman: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
      },
      orderBy: prismaQuery.orderBy,
    });

    // Filter sales that match the search term
    const filteredSales = allSales.filter((sale) => {
      // Check string fields
      const stringFieldsMatch =
        sale.id.toLowerCase().includes(s.toLowerCase()) ||
        sale.method.toLowerCase().includes(s.toLowerCase()) ||
        // sale.address.toLowerCase().includes(s.toLowerCase()) ||
        (matchingStatus && sale.status === matchingStatus);

      // Check if search term matches any product name in cartItems
      const cartItemsMatch =
        Array.isArray(sale.cartItems) &&
        sale.cartItems.some(
          (item: any) =>
            item.productName &&
            item.productName.toLowerCase().includes(s.toLowerCase()),
        );

      return stringFieldsMatch || cartItemsMatch;
    });

    // Apply pagination manually
    const skip = prismaQuery.skip || 0;
    const take = prismaQuery.take || 10;
    const paginatedSales = filteredSales.slice(skip, skip + take);

    // Calculate totals for filtered results
    const totalSales = filteredSales.length;
    const totalAmount = filteredSales.reduce(
      (sum, sale) => sum + sale.amount,
      0,
    );

    // Calculate pagination meta
    const totalPages = Math.ceil(totalSales / take);
    const currentPage = Math.floor(skip / take) + 1;

    return {
      meta: {
        total: totalSales,
        totalPage: totalPages,
        page: currentPage,
        limit: take,
      },
      totalSales,
      totalAmount,
      data: paginatedSales,
    };
  }

  // If no search term, use the regular database query
  const sales = await prisma.sale.findMany({
    ...prismaQuery,
    where,
    include: {
      salesman: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  // Get total count and total amount matching filters
  const [totalSales, totalAmount] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where,
      _sum: {
        amount: true,
      },
    }),
  ]);

  // Get pagination meta using PrismaQueryBuilder helper
  const meta = await queryBuilder.getPaginationMeta({
    count: (args: any) => prisma.sale.count({ ...args, where }),
  });

  return {
    meta,
    totalSales,
    totalAmount: totalAmount._sum.amount ?? 0,
    data: sales,
  };
};

const updateSaleStatus = async (
  saleId: string,
  payload: Record<string, unknown>,
) => {
  await prisma.sale.update({
    where: {
      id: saleId,
    },
    data: payload,
  });
  return true;
};

const getMySales = async (
  userId: string,
  queryParams: Record<string, unknown>,
) => {
  // Extend query builder with searchable sale ID
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['id']);

  // Build full query (where + sort + pagination)
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .getQuery();

  // Inject user-based filter (salesmanId)
  prismaQuery.where = {
    ...prismaQuery.where,
    salesmanId: userId,
  };

  // Include salesman details
  prismaQuery.include = {
    salesman: {
      select: {
        id: true,
        name: true,
        imageUrl: true,
      },
    },
  };

  // Execute main query
  const sales = await prisma.sale.findMany(prismaQuery);

  // Get pagination meta
  const meta = await queryBuilder.getPaginationMeta(prisma.sale);

  return {
    meta,
    data: sales,
  };
};

const getMySaleById = async (userId: string, saleId: string) => {
  // Step 1: Get the sale (with cartItems as JSON)
  const sale = await prisma.sale.findUnique({
    where: {
      id: saleId,
      salesmanId: userId,
    },
    include: {
      salesman: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  if (!sale) return null;

  // Step 2: Extract productIds from cartItems
  const cartItems = sale.cartItems as {
    productId: string;
    quantity: number;
  }[];
  const productIds = cartItems.map((item) => item.productId);

  // Step 3: Fetch product details
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
      imageUrl: true,
    },
  });

  // Step 4: Combine cartItems with product info
  const detailedCartItems = cartItems.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    return {
      ...item,
      product,
    };
  });

  // Step 5: Return enriched sale
  return {
    ...sale,
    cartItems: detailedCartItems,
  };
};

const getAllSalesman = async (queryParams: Record<string, unknown>) => {
  const searchableFields = ['name'];

  const queryBuilder = new PrismaQueryBuilder(queryParams, searchableFields)
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect();

  const prismaQuery = queryBuilder.getQuery();

  // Inject fixed condition: users who placed at least one sale
  prismaQuery.where = {
    ...prismaQuery.where,
    role: 'SALESMAN',
    Order: {
      some: {},
    },
  };

  // Add default selection if not provided
  if (!prismaQuery.select) {
    prismaQuery.select = {
      id: true,
      name: true,
      email: true,
      // contact: true,
      // address: true,
      // imageUrl: true,
      // createdAt: true,
    };
  }

  const salesmans = await prisma.user.findMany(prismaQuery);
  const meta = await queryBuilder.getPaginationMeta(prisma.user);

  return {
    meta,
    data: salesmans,
  };
};

export const SaleServices = {
  addSale,
  getAllSales,
  getSaleById,
  getUserSales,
  updateSaleStatus,
  getMySales,
  getMySaleById,
  getAllSalesman,
};
