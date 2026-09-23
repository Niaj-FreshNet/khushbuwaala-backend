import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { IReview } from './review.interface';
import { uploadBase64ToCloudinary } from '../../utils/sendImageToCloudinary';

const createReview = async (userId: string | null, payload: IReview) => {
  const product = await prisma.product.findUnique({
    where: { id: payload.productId },
  });
  if (!product) throw new AppError(404, 'Product not found');

  if (payload.rating < 0 || payload.rating > 5)
    throw new AppError(400, 'Rating must be between 0 and 5');

  if (userId) {
    const existing = await prisma.review.findFirst({
      where: { userId, productId: payload.productId },
    });
    if (existing) throw new AppError(400, 'You already reviewed this product');
  }

  // Upload to Cloudinary if Base64
  let finalImageUrl: string | null = null;
  if (payload.imageUrl && payload.imageUrl.startsWith('data:image')) {
    try {
      const uploaded = await uploadBase64ToCloudinary(
        payload.imageUrl,
        'khushbuwaala_images/reviews',
        `review-${payload.productId}`
      );
      finalImageUrl = uploaded.location;
    } catch (uploadError) {
      console.error("Failed to upload review image to Cloudinary:", uploadError);
      // Fallback: continue without failing the whole review submission
      finalImageUrl = null;
    }
  } else if (payload.imageUrl) {
    finalImageUrl = payload.imageUrl;
  }

  const review = await prisma.review.create({
    data: {
      rating: payload.rating,
      title: payload.title,
      email: payload.email?.trim() || null, // <--- Add this
      comment: payload.comment,
      imageUrl: finalImageUrl,             // <--- Add this
      productId: payload.productId,
      userId: userId ?? undefined,
      isPublished: true,
    },
    include: {
      user: { select: { id: true, name: true, imageUrl: true } },
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

const deleteReview = async (id: string) => {
  const existingReview = await prisma.review.findUnique({
    where: { id },
  });

  if (!existingReview) {
    throw new AppError(404, 'Review not found');
  }

  const deletedReview = await prisma.review.delete({
    where: { id },
  });

  return deletedReview;
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
  deleteReview,
};
