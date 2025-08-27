// services/cartItem.service.ts
import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';

export const CartItemServices = {
  // Add a product/variant to cart (price is auto-calculated)
  async addToCart(payload: { userId: string; productId: string; variantId?: string; quantity: number }) {
    let price: number;

    if (payload.variantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: payload.variantId } });
      if (!variant) throw new AppError(httpStatus.NOT_FOUND, 'Product variant not found');
      price = variant.price;
    } else {
      const product = await prisma.product.findUnique({ where: { id: payload.productId } });
      if (!product) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
      // You may want product-level price if variant not selected
      // For now, assume it's not allowed to add product without variant
      throw new AppError(httpStatus.BAD_REQUEST, 'Please select a variant for this product');
    }

    return prisma.cartItem.create({
      data: {
        userId: payload.userId,
        productId: payload.productId,
        variantId: payload.variantId,
        quantity: payload.quantity,
        price,
      },
      include: { product: true, variant: true },
    });
  },

  async getUserCart(userId: string) {
    return prisma.cartItem.findMany({
      where: { userId, status: 'IN_CART' },
      include: { product: true, variant: true },
    });
  },

  async updateCartItem(id: string, quantity: number) {
    const item = await prisma.cartItem.findUnique({ where: { id } });
    if (!item) throw new AppError(httpStatus.NOT_FOUND, 'Cart item not found');

    return prisma.cartItem.update({
      where: { id },
      data: { quantity },
      include: { product: true, variant: true },
    });
  },

  async removeCartItem(id: string) {
    return prisma.cartItem.delete({ where: { id } });
  },
};
