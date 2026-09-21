import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';

export const CartItemServices = {
  // ✅ Add a product/variant to cart
  async addToCart(payload: {
    userId?: string | null;
    productId: string;
    variantId?: string;
    size?: number;
    unit?: string;
    quantity: number;
    price?: number;
  }) {
    let price: number;

    if (payload.variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: payload.variantId },
      });
      if (!variant) throw new AppError(httpStatus.NOT_FOUND, 'Product variant not found');
      price = variant.price;
    } else if (payload.price) {
      price = payload.price;
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, 'Please select a valid variant or provide a price');
    }

    // Find existing active cart item for this user/guest
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        productId: payload.productId,
        variantId: payload.variantId ?? null,
        userId: payload.userId ?? null,
        status: 'IN_CART',
      },
    });

    if (existingItem) {
      return prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: existingItem.quantity + payload.quantity,
          updatedAt: new Date(),
        },
        include: {
          product: true,
          variant: true,
        },
      });
    }

    return prisma.cartItem.create({
      data: {
        userId: payload.userId ?? null,
        productId: payload.productId,
        variantId: payload.variantId ?? null,
        size: payload.size,
        unit: payload.unit,
        quantity: payload.quantity,
        price,
        status: 'IN_CART',
      },
      include: {
        product: true,
        variant: true,
      },
    });
  },

  // ✅ Get user (or guest) cart
  async getUserCart(userId?: string | null) {
    return prisma.cartItem.findMany({
      where: {
        userId: userId ?? null,
        status: 'IN_CART',
      },
      include: {
        product: true,
        variant: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  },

  // ✅ Update quantity of cart item
  async updateCartItem(id: string, quantity: number) {
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item) throw new AppError(httpStatus.NOT_FOUND, 'Cart item not found');

    return prisma.cartItem.update({
      where: { id },
      data: { quantity },
      include: {
        product: true,
        variant: true,
      },
    });
  },

  // ✅ Remove a specific cart item
  async removeCartItem(id: string) {
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item) throw new AppError(httpStatus.NOT_FOUND, 'Cart item not found');

    return prisma.cartItem.delete({ where: { id } });
  },

  // Append to CartItemServices inside src/modules/Cart/cart.services.ts

  async getAllCarts(queryParams: {
    status?: string;
    userId?: string;
    searchTerm?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(queryParams.page || 1));
    const limit = Math.max(1, Number(queryParams.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (queryParams.status) {
      where.status = queryParams.status;
    }

    if (queryParams.userId) {
      where.userId = queryParams.userId;
    }

    if (queryParams.searchTerm) {
      const term = String(queryParams.searchTerm).trim();
      where.OR = [
        { product: { name: { contains: term, mode: 'insensitive' } } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { phone: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.cartItem.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              primaryImage: true,
              slug: true,
            },
          },
          variant: {
            select: {
              id: true,
              sku: true,
              size: true,
              unit: true,
              price: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              imageUrl: true,
            },
          },
          order: {
            select: {
              id: true,
              invoice: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.cartItem.count({ where }),
    ]);

    return {
      meta: {
        page,
        limit,
        total,
        totalPage: Math.ceil(total / limit),
      },
      data: items,
    };
  },
}