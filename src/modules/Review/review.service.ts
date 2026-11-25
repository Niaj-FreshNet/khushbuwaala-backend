import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { IReview } from './review.interface';
import { uploadBase64ToCloudinary } from '../../utils/sendImageToCloudinary';
import { Prisma } from '@prisma/client';
import {
  type HomeChoice,
  type HomeReviewSettings,
  canShowOnHome,
  choiceOf,
  cleanHomeReviewSettings,
  pickHomeReviews,
  withChoice,
} from './homeReviews';

// A reviewer's email is for the shop only: it is never sent to the storefront.
const withoutEmail = <T extends { email?: string | null }>(review: T): Omit<T, 'email'> => {
  const copy: Partial<T> = { ...review };
  delete copy.email;
  return copy as Omit<T, 'email'>;
};

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
      // Product has no thumbnail field (asking for it made this endpoint fail every time)
      product: { select: { name: true, slug: true, primaryImage: true } },
    },
  });

  const meta = await queryBuilder.getPaginationMeta((where) => prisma.review.count({ where }));
  return { meta, data: reviews.map(withoutEmail) };
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

  const meta = await queryBuilder.getPaginationMeta((where) => prisma.review.count({ where }));
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
  return withoutEmail(review);
};

const getUserReviews = async (userId: string) => {
  const reviews = await prisma.review.findMany({
    where: { userId },
    include: {
      product: { select: { name: true, slug: true, primaryImage: true } },
    },
  });

  return reviews.map((r) => ({
    ...withoutEmail(r),
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
    ...withoutEmail(r),
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

// ── Reviews on the home page ───────────────────────────────────────────────────────────────
// The owner's choices (section on/off, pinned and hidden reviews) live in one settings document,
// next to the other storefront content.
const HOME_KEY = 'home-reviews';

const readHomeSettings = async (): Promise<HomeReviewSettings> => {
  const row = await prisma.storefrontSetting.findFirst({ where: { key: HOME_KEY }, orderBy: { updatedAt: 'desc' } });
  return cleanHomeReviewSettings(row?.data);
};

const saveHomeSettings = async (settings: HomeReviewSettings, userId: string): Promise<HomeReviewSettings> => {
  const data = settings as unknown as Prisma.InputJsonValue;
  const existing = await prisma.storefrontSetting.findFirst({ where: { key: HOME_KEY }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  if (existing) await prisma.storefrontSetting.update({ where: { id: existing.id }, data: { data, updatedById: userId } });
  else await prisma.storefrontSetting.create({ data: { key: HOME_KEY, data, updatedById: userId } });
  return settings;
};

const fiveStarReviews = () =>
  prisma.review.findMany({
    where: { isPublished: true, rating: 5 },
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      imageUrl: true,
      isPublished: true,
      createdAt: true,
      user: { select: { name: true, imageUrl: true } },
      product: { select: { name: true, slug: true, primaryImage: true, published: true } },
    },
  });

/** Public: the reviews the home page shows, ready to draw. No emails, no ids of people. */
const getHomeReviews = async () => {
  const [settings, reviews] = await Promise.all([readHomeSettings(), fiveStarReviews()]);
  return pickHomeReviews(reviews, settings).map((r) => ({
    id: r.id,
    rating: r.rating,
    // the review form stores the reviewer's name in "title"
    name: (r.user?.name || r.title || '').trim() || 'Customer',
    avatar: r.user?.imageUrl || null,
    comment: r.comment.trim(),
    imageUrl: r.imageUrl || null,
    createdAt: r.createdAt,
    // a hidden product is not linked to (its page answers "not found")
    product: r.product?.published ? { name: r.product.name, slug: r.product.slug, primaryImage: r.product.primaryImage } : null,
  }));
};

/** Admin: the settings, and which reviews are on the home page right now. */
const getHomeReviewsAdmin = async () => {
  const [settings, reviews] = await Promise.all([readHomeSettings(), fiveStarReviews()]);
  return { ...settings, shownIds: pickHomeReviews(reviews, settings).map((r) => r.id) };
};

const setHomeChoice = async (reviewId: string, choice: HomeChoice, userId: string) => {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, rating: true, comment: true, isPublished: true, createdAt: true } });
  if (!review) throw new AppError(404, 'Review not found');
  if (choice === 'pinned' && !canShowOnHome(review)) {
    throw new AppError(400, 'Only a published 5-star review can be pinned to the home page.');
  }
  const settings = await saveHomeSettings(withChoice(await readHomeSettings(), reviewId, choice), userId);
  return { reviewId, choice: choiceOf(settings, reviewId) };
};

const setHomeSectionEnabled = async (enabled: boolean, userId: string) => {
  const settings = await saveHomeSettings({ ...(await readHomeSettings()), enabled }, userId);
  return { enabled: settings.enabled };
};

export const ReviewServices = {
  getHomeReviews,
  getHomeReviewsAdmin,
  setHomeChoice,
  setHomeSectionEnabled,
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
