import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { IReview } from './review.interface';

const createReview = async (userId: string | null, payload: IReview) => {
  const product = await prisma.product.findUnique({
    where: { id: payload.productId },
  });
  if (!product) throw new AppError(404, 'Product not found');

  if (payload.rating < 0 || payload.rating > 5)
    throw new AppError(400, 'Rating must be between 0 and 5');

  // ✅ Only block duplicate if user is logged in
  if (userId) {
    const existing = await prisma.review.findFirst({
      where: { userId, productId: payload.productId },
    });
    if (existing) throw new AppError(400, 'You already reviewed this product');
  }

  const review = await prisma.review.create({
    data: {
      rating: payload.rating,
      title: payload.title,         // (your "name" stored here)
      comment: payload.comment,
      productId: payload.productId,
      userId: userId ?? undefined,  // ✅ allow null
      isPublished: true,
    },
    include: {
      user: { select: { name: true, imageUrl: true } },
    },
  });

  return review;
};

const getAllReviews = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['title', 'comment']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect()
    .getQuery();

  prismaQuery.where = { ...prismaQuery.where, isPublished: true };

  const reviews = await prisma.review.findMany({
    ...prismaQuery,
    include: {
      user: {
        select: {
          name: true,
          imageUrl: true,
        },
      },
      product: { select: { name: true, slug: true, thumbnail: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta(prisma.review);
  return { meta, data: reviews };
};

const getAllReviewsAdmin = async (queryParams: Record<string, unknown>) => {
  const queryBuilder = new PrismaQueryBuilder(queryParams, ['title', 'comment']);
  const prismaQuery = queryBuilder
    .buildWhere()
    .buildSort()
    .buildPagination()
    .buildSelect()
    .getQuery();

  const reviews = await prisma.review.findMany({
    ...prismaQuery,
    include: {
      user: { select: { name: true, email: true, imageUrl: true } },
      product: { select: { name: true, slug: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta(prisma.review);
  return { meta, data: reviews };
};

const getReviewById = async (id: string) => {
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, imageUrl: true } },
      product: { select: { name: true, slug: true } },
    },
  });
  if (!review) throw new AppError(404, 'Review not found');
  return review;
};

const getUserReviews = async (userId: string) => {
  const reviews = await prisma.review.findMany({
    where: { userId },
    include: {
      product: { select: { name: true, slug: true, primaryImage: true } },
    },
  });

  return reviews.map((r) => ({
    ...r,
    reviewerName: r.userId ? undefined : 'Anonymous',
  }));
};

const getProductReviews = async (productId: string) => {
  const reviews = await prisma.review.findMany({
    where: { productId, isPublished: true },
    include: {
      user: {
        select: {
          name: true,
          imageUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Replace null user with anonymous label
  return reviews.map((r) => ({
    ...r,
    user: r.user || { name: 'Anonymous', imageUrl: '/default-avatar.png' },
  }));
};

const updateReview = async (id: string, payload: Partial<IReview>) => {
  const review = await prisma.review.update({
    where: { id },
    data: payload,
    include: {
      user: { select: { name: true, imageUrl: true } },
    },
  });
  return review;
};

const publishReview = async (id: string) => {
  // ✅ First fetch current status
  const existingReview = await prisma.review.findUnique({
    where: { id },
  });

  if (!existingReview) {
    throw new Error("Review not found");
  }

  // ✅ Toggle publish status
  const updatedReview = await prisma.review.update({
    where: { id },
    data: { isPublished: !existingReview.isPublished },
    include: {
      user: { select: { name: true, imageUrl: true } },
      product: { select: { name: true } },
    },
  });

  return updatedReview;
};

export const ReviewServices = {
  createReview,
  getAllReviews,
  getAllReviewsAdmin,
  getReviewById,
  getUserReviews,
  getProductReviews,
  updateReview,
  publishReview,
};
