import httpStatus from 'http-status';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { CartItemStatus, Prisma } from '@prisma/client';
import { isEnumValue } from '../../utils/enumValue';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

type CartActor = { id: string; role: string } | null;

/**
 * The open cart row with this id, if the caller may change it: a signed-in customer's row only by
 * that customer (or staff); a guest row by whoever holds its id. Rows that became order lines
 * (ORDERED / SOLD) are sales history and can never be changed through the cart.
 */
const loadOwnOpenCartItem = async (id: string, user?: CartActor) => {
  if (!OBJECT_ID.test(String(id))) throw new AppError(httpStatus.NOT_FOUND, 'Cart item not found');
  const item = await prisma.cartItem.findUnique({ where: { id } });
  if (!item || item.status !== 'IN_CART') throw new AppError(httpStatus.NOT_FOUND, 'Cart item not found');
  const staff = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  if (item.userId && item.userId !== user?.id && !staff) throw new AppError(httpStatus.NOT_FOUND, 'Cart item not found');
  return item;
};

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
    /** A guest's own cart row from an earlier add (guests have no account to find it by) */
    cartItemId?: string;
  }) {
    const quantity = Math.floor(Number(payload.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Quantity must be between 1 and 999');
    }
    payload = { ...payload, quantity };

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

    // Signed-in customer: one row per product + size in their own cart.
    // Guest: only the row this visitor created earlier (sent back as cartItemId). Guests must never
    // be matched by "no user": that made every visitor share one row, so a first add could come
    // back with another visitor's quantity.
    const guestRowId = !payload.userId && OBJECT_ID.test(String(payload.cartItemId ?? '')) ? String(payload.cartItemId) : null;
    const existingItem = payload.userId
      ? await prisma.cartItem.findFirst({
          where: {
            productId: payload.productId,
            variantId: payload.variantId ?? null,
            userId: payload.userId,
            status: 'IN_CART',
          },
        })
      : guestRowId
        ? await prisma.cartItem.findFirst({
            where: {
              id: guestRowId,
              productId: payload.productId,
              variantId: payload.variantId ?? null,
              OR: [{ userId: null }, { userId: { isSet: false } }],
              status: 'IN_CART',
            },
          })
        : null;

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
    // A guest's cart is on their device; there is no "guest cart" to list (it used to return
    // every visitor's open cart rows).
    if (!userId) return [];
    return prisma.cartItem.findMany({
      where: {
        userId,
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
  async updateCartItem(id: string, quantityInput: number, user?: CartActor) {
    const quantity = Math.floor(Number(quantityInput));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > 999) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Quantity must be between 1 and 999');
    }
    await loadOwnOpenCartItem(id, user);

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
  async removeCartItem(id: string, user?: CartActor) {
    await loadOwnOpenCartItem(id, user);

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

    const where: Prisma.CartItemWhereInput = {};

    if (isEnumValue(CartItemStatus, queryParams.status)) {
      where.status = queryParams.status;
    }

    if (queryParams.userId) {
      where.userId = String(queryParams.userId);
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