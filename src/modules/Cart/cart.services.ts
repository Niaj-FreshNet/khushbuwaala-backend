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

    // ✅ Determine price
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

    // ✅ Check if the item already exists (same user/guest + product + variant)
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        productId: payload.productId,
        variantId: payload.variantId ?? null,
        userId: payload.userId ?? null,
        status: 'IN_CART',
      },
    });

    if (existingItem) {
      // ✅ If exists, just update quantity
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

    // ✅ Create new cart item (even if userId is null)
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
};
