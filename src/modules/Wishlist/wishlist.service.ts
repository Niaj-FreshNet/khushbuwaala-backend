// A signed-in customer's saved products. One row per (user, product).
import httpStatus from 'http-status';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import type { ProductRow } from '../../types/records';
import { LEAN_PRODUCT_INCLUDE } from '../Product/product.constant';
import { formatProductListingResponse } from '../Product/product.service';

export const MAX_WISHLIST_ITEMS = 200;

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Keep only well-formed, distinct product ids (anything else would crash the database driver). */
export const cleanProductIds = (input: unknown, max = MAX_WISHLIST_ITEMS): string[] => {
  const raw = Array.isArray(input) ? input : [input];
  const ids = raw.filter((v): v is string => typeof v === 'string' && OBJECT_ID.test(v)).map((v) => v.toLowerCase());
  return Array.from(new Set(ids)).slice(0, max);
};

export type WishlistEntry = { productId: string; createdAt: Date };

/** Newest first, one entry per product (old data or a double tap may have left repeats). */
export const dedupeEntries = (rows: WishlistEntry[]): WishlistEntry[] => {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .filter((r) => (seen.has(r.productId) ? false : (seen.add(r.productId), true)));
};

const getWishlist = async (userId: string) => {
  const rows = dedupeEntries(
    await prisma.wishlist.findMany({ where: { userId }, select: { productId: true, createdAt: true } })
  );
  if (!rows.length) return [];

  const products: ProductRow[] = await prisma.product.findMany({
    where: { id: { in: rows.map((r) => r.productId) } },
    include: LEAN_PRODUCT_INCLUDE,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  return rows.map((row) => {
    const product = byId.get(row.productId);
    // A product that was hidden stays in the list (greyed out) so the customer can remove it
    // and gets it back if it returns. Its price and sizes are not sent.
    if (!product) return { productId: row.productId, addedAt: row.createdAt, available: false, product: null };
    if (!product.published) {
      return {
        productId: row.productId,
        addedAt: row.createdAt,
        available: false,
        product: { id: product.id, name: product.name, slug: product.slug, primaryImage: product.primaryImage },
      };
    }
    return { productId: row.productId, addedAt: row.createdAt, available: true, product: formatProductListingResponse(product) };
  });
};

const addMany = async (userId: string, productIds: string[]) => {
  if (!productIds.length) return 0;
  const [existing, published] = await Promise.all([
    prisma.wishlist.findMany({ where: { userId }, select: { productId: true } }),
    prisma.product.findMany({ where: { id: { in: productIds }, published: true }, select: { id: true } }),
  ]);
  const have = new Set(existing.map((e) => e.productId));
  const room = Math.max(0, MAX_WISHLIST_ITEMS - have.size);
  const toAdd = published.map((p) => p.id).filter((id) => !have.has(id)).slice(0, room);
  if (!toAdd.length) return 0;
  await prisma.wishlist.createMany({ data: toAdd.map((productId) => ({ userId, productId })) });
  return toAdd.length;
};

const addToWishlist = async (userId: string, productId: unknown) => {
  const [id] = cleanProductIds(productId, 1);
  if (!id) throw new AppError(httpStatus.BAD_REQUEST, 'A valid productId is required');
  const product = await prisma.product.findUnique({ where: { id }, select: { published: true } });
  if (!product || !product.published) throw new AppError(httpStatus.NOT_FOUND, 'Product not found');
  await addMany(userId, [id]);
  return { productId: id };
};

/** After login: add what the visitor saved as a guest. Unknown or hidden products are skipped. */
const mergeWishlist = async (userId: string, productIds: unknown) => {
  await addMany(userId, cleanProductIds(productIds));
  return getWishlist(userId);
};

const removeFromWishlist = async (userId: string, productId: string) => {
  const [id] = cleanProductIds(productId, 1);
  if (!id) throw new AppError(httpStatus.BAD_REQUEST, 'A valid productId is required');
  await prisma.wishlist.deleteMany({ where: { userId, productId: id } });
  return { productId: id };
};

const clearWishlist = async (userId: string) => {
  const result = await prisma.wishlist.deleteMany({ where: { userId } });
  return { removed: result.count };
};

export const WishlistServices = { getWishlist, addToWishlist, mergeWishlist, removeFromWishlist, clearWishlist };
