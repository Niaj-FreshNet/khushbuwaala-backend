import { subDays, subMonths } from 'date-fns';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import QueryBuilder from '../../helpers/queryBuilder';
import {
  IProduct,
  IUpdateProduct,
  IProductQuery,
  IProductDetailResponse,
  IProductListingResponse,
  IProductAdminListingResponse,
  IProductSearchResponse,
  IProductAnalytics,
  ITrendingProduct,
  IRelatedProductsResponse,
  IProductSearchResult,
} from './product.interface';
import {
  productFilterFields,
  productSearchFields,
  productArraySearchFields,
  productNestedFilters,
  productRangeFilter,
  productDetailInclude,
  productAdminInclude,
  LEAN_PRODUCT_INCLUDE,
  QUERY_DEFAULTS,
  PRODUCT_ERROR_MESSAGES,
} from './product.constant';
import slugify from 'slugify';
import { deleteFromCloudinaryByPublicId, getPublicIdFromCloudinaryUrl } from '../../utils/sendImageToCloudinary';

// Create Product
export const createProduct = async (payload: IProduct): Promise<IProductDetailResponse> => {
  const categoryExists = await prisma.category.findUnique({
    where: { id: payload.categoryId },
  });
  if (!categoryExists) {
    throw new AppError(404, 'Category not found');
  }

  const existingSKUs = await prisma.productVariant.findMany({
    where: { sku: { in: payload.variants.map(v => v.sku) } },
    select: { sku: true },
  });

  if (existingSKUs.length > 0) {
    throw new AppError(
      400,
      `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`
    );
  }

  const slug = slugify(payload.name, { lower: true, strict: true });

  const result = await prisma.product.create({
    data: {
      name: payload.name,
      description: payload.description,
      slug,
      primaryImage: payload.primaryImage,
      otherImages: payload.otherImages || [],
      videoUrl: payload.videoUrl,
      tags: payload.tags,
      origin: payload.origin,
      brand: payload.brand,
      gender: payload.gender,
      perfumeNotes: payload.perfumeNotes,
      accords: payload.accords,
      performance: payload.performance,
      longevity: payload.longevity,
      projection: payload.projection,
      sillage: payload.sillage,
      bestFor: payload.bestFor,
      categoryId: payload.categoryId,
      published: payload.published,
      supplier: payload.supplier,
      stock: payload.stock,
      variants: {
        create: payload.variants.map(v => ({
          sku: v.sku,
          size: v.size,
          unit: v.unit,
          price: v.price,
        })),
      },
    },
    include: {
      variants: true,
      category: true,
    },
  });

  if (payload.materialIds?.length) {
    for (const materialId of payload.materialIds) {
      await prisma.productMaterial.upsert({
        where: { productId_materialId: { productId: result.id, materialId } },
        create: { productId: result.id, materialId },
        update: {},
      });
    }
  }

  if (payload.fragranceIds?.length) {
    for (const fragranceId of payload.fragranceIds) {
      await prisma.productFragrance.upsert({
        where: { productId_fragranceId: { productId: result.id, fragranceId } },
        create: { productId: result.id, fragranceId },
        update: {},
      });
    }
  }

  const finalProduct = await prisma.product.findUnique({
    where: { id: result.id },
    include: {
      variants: true,
      category: true,
      ProductMaterial: { include: { material: true } },
      ProductFragrance: { include: { fragrance: true } },
    },
  });

  return formatProductDetailResponse(finalProduct!);
};

// Shared: normalizes a comma-string or array into a clean string[]
const toArray = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

// Shared: builds all the manual array/range/exact filters both public
// listing and admin/category listing need. Does NOT force `published`
// or add pagination/sort/include — callers do that themselves.
const applyProductFilters = (queryBuilder: QueryBuilder<any>, query: IProductQuery) => {
  if (query.gender && query.gender !== 'all') {
    queryBuilder.rawFilter({ gender: { equals: String(query.gender), mode: 'insensitive' } });
  }

  const accords = toArray(query.accords);
  if (accords.length) queryBuilder.rawFilter({ accords: { hasSome: accords } });

  const bestFor = toArray(query.bestFor);
  if (bestFor.length) queryBuilder.rawFilter({ bestFor: { hasSome: bestFor } });

  const tags = toArray(query.tags);
  if (tags.length) queryBuilder.rawFilter({ tags: { hasSome: tags } });

  const performance = toArray(query.performance);
  if (performance.length) queryBuilder.rawFilter({ performance: { in: performance } });

  const projection = toArray(query.projection);
  if (projection.length) queryBuilder.rawFilter({ projection: { in: projection } });

  const perfumeNotes = toArray(query.perfumeNotes);
  if (perfumeNotes.length) {
    queryBuilder.rawFilter({
      OR: [
        { perfumeNotes: { is: { top: { hasSome: perfumeNotes } } } },
        { perfumeNotes: { is: { middle: { hasSome: perfumeNotes } } } },
        { perfumeNotes: { is: { base: { hasSome: perfumeNotes } } } },
      ],
    });
  }

  const minPrice = query.minPrice != null ? Number(query.minPrice) : undefined;
  const maxPrice = query.maxPrice != null ? Number(query.maxPrice) : undefined;
  if (minPrice != null || maxPrice != null) {
    queryBuilder.rawFilter({
      variants: {
        some: {
          price: {
            ...(minPrice != null ? { gte: minPrice } : {}),
            ...(maxPrice != null ? { lte: maxPrice } : {}),
          },
        },
      },
    });
  }
};

const runProductQuery = async (query: IProductQuery) => {
  const queryBuilder = new QueryBuilder(query, prisma.product);

  const categories = toArray(query.category);
  if (categories.length) {
    const cats = await prisma.category.findMany({
      where: { OR: categories.map(cat => ({ categoryName: { equals: cat, mode: 'insensitive' } })) },
      select: { id: true },
    });
    const categoryIds = cats.map(c => c.id);
    if (!categoryIds.length) {
      return {
        results: [] as any[],
        meta: { page: Number(query.page) || 1, limit: Number(query.limit) || 20, total: 0, totalPage: 0 },
      };
    }
    queryBuilder.rawFilter({ categoryId: { in: categoryIds } });
  }

  applyProductFilters(queryBuilder, query);
  queryBuilder.rawFilter({ published: true });

  let results = await queryBuilder
    .search(productSearchFields)
    .sort()
    .paginate()
    .include(LEAN_PRODUCT_INCLUDE)
    .execute();

  const meta = await queryBuilder.countTotal();
  results = applySorting(results, query.sortBy as string);

  return { results, meta };
};

// Get All Products (Public)
const getAllProducts = async (query: IProductQuery) => {
  const { results, meta } = await runProductQuery(query);
  return { data: results.map(formatProductListingResponse), meta };
};

// Get All Products (Admin)
const getAllProductsAdmin = async (query: IProductQuery) => {
  const queryBuilder = new QueryBuilder(query, prisma.product);

  if (query.stock === 'in') queryBuilder.rawFilter({ stock: { gt: 0 } });
  else if (query.stock === 'out') queryBuilder.rawFilter({ stock: { lte: 0 } });

  applyProductFilters(queryBuilder, query);

  let results = await queryBuilder
    .search(productSearchFields)
    .sort()
    .paginate()
    .include(productAdminInclude)
    .execute();

  const meta = await queryBuilder.countTotal();
  results = applySorting(results, query.sortBy);

  return { data: results.map(formatProductAdminListingResponse), meta };
};

// Get Single Product
const getProduct = async (id: string): Promise<IProductDetailResponse | null> => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productDetailInclude,
  });

  if (!product) return null;

  const relatedProducts = await prisma.product.findMany({
    where: {
      OR: [
        { categoryId: product.categoryId },
        { brand: product.brand },
        { accords: { hasSome: product.accords } },
      ],
      id: { not: id },
      published: true,
    },
    include: LEAN_PRODUCT_INCLUDE,
    take: QUERY_DEFAULTS.RELATED_LIMIT,
    orderBy: { salesCount: 'desc' },
  });

  const formattedProduct = formatProductDetailResponse(product);

  return {
    ...formattedProduct,
    relatedProducts: {
      sameBrand: relatedProducts.map(formatProductListingResponse),
      sameCategory: relatedProducts.map(formatProductListingResponse),
      similarAccords: relatedProducts.map(formatProductListingResponse),
    },
  };
};

// Get Product By Slug
const getProductBySlug = async (slug: string): Promise<IProductDetailResponse | null> => {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: productDetailInclude,
  });

  if (!product) return null;

  const relatedProducts = await prisma.product.findMany({
    where: {
      OR: [
        { categoryId: product.categoryId },
        { brand: product.brand },
        { accords: { hasSome: product.accords } },
      ],
      id: { not: product.id },
      published: true,
    },
    include: LEAN_PRODUCT_INCLUDE,
    take: QUERY_DEFAULTS.RELATED_LIMIT,
    orderBy: { salesCount: 'desc' },
  });

  const formattedProduct = formatProductDetailResponse(product);

  return {
    ...formattedProduct,
    relatedProducts: {
      sameBrand: relatedProducts.map(formatProductListingResponse),
      sameCategory: relatedProducts.map(formatProductListingResponse),
      similarAccords: relatedProducts.map(formatProductListingResponse),
    },
  };
};

// Update Product
export const updateProduct = async (
  id: string,
  payload: IUpdateProduct
): Promise<IProductDetailResponse> => {
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: true,
      ProductMaterial: true,
      ProductFragrance: true,
    },
  });

  if (!existingProduct) {
    throw new AppError(404, 'Product not found');
  }

  if (payload.categoryId) {
    const categoryExists = await prisma.category.findUnique({
      where: { id: payload.categoryId },
    });
    if (!categoryExists) {
      throw new AppError(404, 'Category not found');
    }
  }

  let primaryImage = existingProduct.primaryImage;
  let otherImages = existingProduct.otherImages;

  if (payload.imagesToKeep || payload.newImages) {
    const imagesToKeep = payload.imagesToKeep || [];
    const newImages = payload.newImages || [];

    const currentImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
    const imagesToDelete = currentImages.filter(
      img => img && !imagesToKeep.includes(img) && !newImages.includes(img)
    );

    const safeDeleteCloudinary = async (url: string) => {
      const publicId = getPublicIdFromCloudinaryUrl(url);
      if (!publicId) return;
      await deleteFromCloudinaryByPublicId(publicId);
    };

    await Promise.all(imagesToDelete.map(safeDeleteCloudinary));

    const allNewImages = [...imagesToKeep, ...newImages];
    if (allNewImages.length > 0) {
      primaryImage = allNewImages[0];
      otherImages = allNewImages.slice(1);
    }
  }

  if (payload.variants?.length) {
    const existingSKUs = await prisma.productVariant.findMany({
      where: {
        sku: { in: payload.variants.map(v => v.sku) },
        productId: { not: id },
      },
      select: { sku: true },
    });
    if (existingSKUs.length > 0) {
      throw new AppError(400, `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`);
    }
  }

  const updatedProduct = await prisma.product.update({
    where: { id },
    data: {
      ...(payload.name && { name: payload.name, slug: slugify(payload.name, { lower: true, strict: true }) }),
      ...(payload.description && { description: payload.description }),
      ...(primaryImage && { primaryImage }),
      ...(otherImages && { otherImages }),
      ...(payload.videoUrl !== undefined && { videoUrl: payload.videoUrl }),
      ...(payload.tags && { tags: payload.tags }),
      ...(payload.origin !== undefined && { origin: payload.origin }),
      ...(payload.brand !== undefined && { brand: payload.brand }),
      ...(payload.gender !== undefined && { gender: payload.gender }),
      ...(payload.perfumeNotes !== undefined && { perfumeNotes: payload.perfumeNotes }),
      ...(payload.accords && { accords: payload.accords }),
      ...(payload.performance !== undefined && { performance: payload.performance }),
      ...(payload.longevity !== undefined && { longevity: payload.longevity }),
      ...(payload.projection !== undefined && { projection: payload.projection }),
      ...(payload.sillage !== undefined && { sillage: payload.sillage }),
      ...(payload.bestFor && { bestFor: payload.bestFor }),
      ...(payload.stock !== undefined && { stock: payload.stock }),
      ...(payload.categoryId && { categoryId: payload.categoryId }),
      ...(typeof payload.published === 'boolean' && { published: payload.published }),
    },
  });

  if (payload.variants?.length) {
    await prisma.productVariant.deleteMany({ where: { productId: id } });

    await prisma.productVariant.createMany({
      data: payload.variants.map(v => ({
        sku: v.sku,
        size: v.size,
        unit: v.unit,
        price: v.price,
        productId: id,
      })),
    });
  }

  if (payload.materialIds) {
    await prisma.productMaterial.deleteMany({
      where: { productId: id, materialId: { notIn: payload.materialIds } },
    });

    for (const materialId of payload.materialIds) {
      await prisma.productMaterial.upsert({
        where: { productId_materialId: { productId: id, materialId } },
        create: { productId: id, materialId },
        update: {},
      });
    }
  }

  if (payload.fragranceIds) {
    await prisma.productFragrance.deleteMany({
      where: { productId: id, fragranceId: { notIn: payload.fragranceIds } },
    });

    for (const fragranceId of payload.fragranceIds) {
      await prisma.productFragrance.upsert({
        where: { productId_fragranceId: { productId: id, fragranceId } },
        create: { productId: id, fragranceId },
        update: {},
      });
    }
  }

  const finalProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: true,
      category: true,
      ProductMaterial: { include: { material: true } },
      ProductFragrance: { include: { fragrance: true } },
    },
  });

  return formatProductDetailResponse(finalProduct!);
};

// Delete Product
const deleteProduct = async (id: string) => {
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: true,
      Review: true,
      wishlist: true,
      comboVariants: true,
    },
  });

  if (!existingProduct) {
    throw new AppError(404, PRODUCT_ERROR_MESSAGES.NOT_FOUND);
  }

  const hasActiveOrders = await prisma.order.findFirst({
    where: {
      productIds: { has: id },
      status: { not: 'CANCELED' },
    },
  });

  if (hasActiveOrders && existingProduct.published) {
    throw new AppError(400, PRODUCT_ERROR_MESSAGES.PRODUCT_PUBLISHED_CANNOT_DELETE);
  }

  await prisma.$transaction(async (tx) => {
    // 1. Delete associated cart items to prevent orphaned references
    await tx.cartItem.deleteMany({ where: { productId: id } });

    // 2. Delete other related documents
    await tx.wishlist.deleteMany({ where: { productId: id } });
    await tx.comboVariant.deleteMany({ where: { productId: id } });
    await tx.review.deleteMany({ where: { productId: id } });
    await tx.productVariant.deleteMany({ where: { productId: id } });
    await tx.discount.deleteMany({ where: { productId: id } });

    // 3. Delete the main product
    await tx.product.delete({ where: { id } });
  });

  const safeDeleteCloudinary = async (url: string) => {
    const publicId = getPublicIdFromCloudinaryUrl(url);
    if (!publicId) return;
    await deleteFromCloudinaryByPublicId(publicId);
  };

  const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
  await Promise.all(allImages.filter(Boolean).map(safeDeleteCloudinary));

  return { id };
};

// Get Trending Products
const getTrendingProducts = async (): Promise<ITrendingProduct[]> => {
  const trendingProducts = await prisma.product.findMany({
    where: { published: true },
    include: LEAN_PRODUCT_INCLUDE,
    orderBy: { salesCount: 'desc' },
    take: QUERY_DEFAULTS.TRENDING_LIMIT,
  });

  return trendingProducts.map((product) => ({
    ...formatProductListingResponse(product),
    totalSold: product.salesCount || 0,
    trendingScore: Math.round((product.salesCount || 0) * 1.5),
  }));
};

// Get Navbar Products
const getNavbarProducts = async () => {
  const overallTrendingProducts = await prisma.product.findMany({
    where: { published: true },
    select: { id: true, name: true, salesCount: true, categoryId: true },
    orderBy: { salesCount: 'desc' },
    take: 3,
  });

  const publishedCategories = await prisma.category.findMany({
    where: { published: true },
    select: { id: true, categoryName: true }
  });

  const trendingByCategory: Record<string, { id: string; name: string }[]> = {};

  await Promise.all(publishedCategories.map(async (category) => {
    const topCatProducts = await prisma.product.findMany({
      where: { categoryId: category.id, published: true },
      select: { id: true, name: true },
      orderBy: { salesCount: 'desc' },
      take: 3,
    });
    trendingByCategory[category.categoryName] = topCatProducts;
  }));

  const overallTrending = overallTrendingProducts.map(p => ({
    id: p.id,
    name: p.name,
  }));

  return { trendingByCategory, overallTrending };
};

// Get Featured Products
const getFeaturedProducts = async (): Promise<IProductListingResponse[]> => {
  const products = await prisma.product.findMany({
    where: {
      published: true,
      salesCount: { gte: 10 },
    },
    include: LEAN_PRODUCT_INCLUDE,
    orderBy: [{ salesCount: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  });

  return products.map(formatProductListingResponse);
};

// Get New Arrivals
const getNewArrivals = async (): Promise<IProductListingResponse[]> => {
  const cutoffDate = subDays(new Date(), QUERY_DEFAULTS.NEW_ARRIVALS_DAYS);

  const products = await prisma.product.findMany({
    where: {
      published: true,
      createdAt: { gte: cutoffDate },
    },
    include: LEAN_PRODUCT_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return products.map(formatProductListingResponse);
};

// Get Products by Category Name
const getProductsByCategoryName = async (categoryName: string, query: IProductQuery) => {
  const category = await prisma.category.findFirst({
    where: { categoryName: { equals: categoryName, mode: 'insensitive' } },
    select: { id: true }
  });

  if (!category) {
    return { data: [], meta: { total: 0, page: 1, limit: query.limit || 20, totalPage: 0 } };
  }

  return getProductsByCategoryId(category.id, query);
};

const getProductsByCategoryId = async (categoryId: string, query: IProductQuery) => {
  const queryBuilder = new QueryBuilder(query, prisma.product);

  applyProductFilters(queryBuilder, query);
  queryBuilder.rawFilter({ published: true, categoryId });

  let results = await queryBuilder
    .search(productSearchFields)
    .sort()
    .paginate()
    .include(LEAN_PRODUCT_INCLUDE)
    .execute();

  const meta = await queryBuilder.countTotal();
  results = applySorting(results, query.sortBy as string);

  return { data: results.map(formatProductListingResponse), meta };
};

// Get Related Products
const getRelatedProducts = async (productId: string): Promise<IRelatedProductsResponse> => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { categoryId: true, brand: true, accords: true },
  });

  if (!product) {
    throw new AppError(404, PRODUCT_ERROR_MESSAGES.NOT_FOUND);
  }

  const [sameBrand, sameCategory, similarAccords] = await Promise.all([
    prisma.product.findMany({
      where: { brand: product.brand, id: { not: productId }, published: true },
      include: LEAN_PRODUCT_INCLUDE,
      take: 4,
      orderBy: { salesCount: 'desc' },
    }),
    prisma.product.findMany({
      where: { categoryId: product.categoryId, id: { not: productId }, published: true },
      include: LEAN_PRODUCT_INCLUDE,
      take: 4,
      orderBy: { salesCount: 'desc' },
    }),
    prisma.product.findMany({
      where: { accords: { hasSome: product.accords }, id: { not: productId }, published: true },
      include: LEAN_PRODUCT_INCLUDE,
      take: 4,
      orderBy: { salesCount: 'desc' },
    }),
  ]);

  return {
    sameBrand: sameBrand.map(formatProductListingResponse),
    sameCategory: sameCategory.map(formatProductListingResponse),
    similarAccords: similarAccords.map(formatProductListingResponse),
  };
};

// Search Products
const searchProducts = async (query: IProductQuery): Promise<IProductSearchResult> => {
  const { results, meta } = await runProductQuery(query);

  return {
    data: results.map(formatProductSearchResponse),
    meta: {
      total: meta.total,
      page: meta.page,
      limit: meta.limit,
      totalPages: meta.totalPage,
    },
  };
};

// Get Product Variants
const getProductVariants = async (productId: string) => {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: [{ size: 'asc' }, { price: 'asc' }],
  });

  if (!variants.length) {
    throw new AppError(404, 'No variants found for this product');
  }

  return variants;
};

// Get Product Analytics
const getProductAnalytics = async (): Promise<IProductAnalytics> => {
  const [
    totalProducts,
    publishedProducts,
    totalVariants,
    priceStats,
    categoryStats,
    brandStats,
    stockStats,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { published: true } }),
    prisma.productVariant.count(),
    prisma.productVariant.aggregate({ _avg: { price: true }, _sum: { price: true } }),
    prisma.product.groupBy({ by: ['categoryId'], _count: { _all: true }, where: { published: true } }),
    prisma.product.groupBy({ by: ['brand'], _count: { _all: true }, where: { published: true, brand: { not: null } } }),
    prisma.product.aggregate({ where: { stock: { lte: QUERY_DEFAULTS.LOW_STOCK_THRESHOLD } }, _count: { _all: true } }),
  ]);

  const categories = await prisma.category.findMany({
    where: { id: { in: categoryStats.map(c => c.categoryId) } },
  });

  const categoryMap = categories.reduce((acc, cat) => {
    acc[cat.id] = cat.categoryName;
    return acc;
  }, {} as Record<string, string>);

  const topCategories = categoryStats.map(stat => ({
    categoryName: categoryMap[stat.categoryId] || 'Unknown',
    productCount: stat._count._all,
    percentage: Math.round((stat._count._all / publishedProducts) * 100),
  }));

  const topBrands = brandStats.map(stat => ({
    brand: stat.brand || 'Unknown',
    productCount: stat._count._all,
    percentage: Math.round((stat._count._all / publishedProducts) * 100),
  }));

  const outOfStockCount = await prisma.product.count({ where: { stock: 0 } });

  return {
    totalProducts,
    publishedProducts,
    unpublishedProducts: totalProducts - publishedProducts,
    totalVariants,
    lowStockProducts: stockStats._count._all,
    outOfStockProducts: outOfStockCount,
    totalValue: priceStats._sum.price || 0,
    averagePrice: priceStats._avg.price || 0,
    topCategories: topCategories.slice(0, 5),
    topBrands: topBrands.slice(0, 5),
  };
};

// Get Low Stock Products
const getLowStockProducts = async (threshold: number = QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) => {
  const products = await prisma.product.findMany({
    where: { stock: { lte: threshold } },
    include: {
      variants: true,
      category: { select: { categoryName: true } },
    },
    orderBy: { name: 'asc' },
  });

  return products.map(product => ({
    id: product.id,
    name: product.name,
    category: product.category.categoryName,
    stock: product.stock,
    variants: product.variants.map(v => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      unit: v.unit,
      price: v.price,
    })),
  }));
};

// Get Bestsellers
const getBestsellers = async (): Promise<ITrendingProduct[]> => {
  const products = await prisma.product.findMany({
    where: { published: true },
    include: LEAN_PRODUCT_INCLUDE,
    orderBy: { salesCount: 'desc' },
    take: 20,
  });

  return products.map((product, index) => ({
    ...formatProductListingResponse(product),
    totalSold: product.salesCount,
    trendingScore: 100 - index,
  }));
};

// Update Product Stock
const updateProductStock = async (productId: string, addedStock: number, reason?: string) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    throw new AppError(404, PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
  }

  const newTotalStock = (product.stock ?? 0) + addedStock;

  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { stock: newTotalStock } });
    await tx.stockLog.create({
      data: { productId, change: addedStock, reason: reason || 'Stock updated', createdAt: new Date() },
    });
  });

  const updatedProduct = await prisma.product.findUnique({
    where: { id: productId },
    include: productAdminInclude,
  });

  return formatProductDetailResponse(updatedProduct);
};

// Get Stock Logs
const getStockLogs = async (productId: string) => {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    throw new AppError(404, PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
  }

  const logs = await prisma.stockLog.findMany({
    where: { productId },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return logs.map((log) => ({
    id: log.id,
    productId: log.productId,
    change: log.change,
    reason: log.reason,
    createdAt: log.createdAt.toISOString(),
    product: { name: log.product.name },
  }));
};

// Shared helper — avoids repeating rating math across formatters
const computeRating = (reviews: any[]) => {
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount
      : 0;
  return { averageRating: parseFloat(averageRating.toFixed(2)), reviewCount };
};

// Pick the single best currently-active, non-coupon discount for a card badge
const pickBestDiscount = (discounts: any[] = []) => {
  if (!discounts.length) return undefined;

  const now = new Date();

  const active = discounts.filter((d) => {
    if (d.code && String(d.code).trim() !== '') return false; // Ignore promo coupons
    const startOk = !d.startDate || new Date(d.startDate) <= now;
    const endOk = !d.endDate || new Date(d.endDate) >= now;
    return startOk && endOk;
  });

  if (!active.length) return undefined;

  const best = active.reduce((a, b) => (b.value > a.value ? b : a));
  return { type: best.type, value: best.value };
};

// ============================================================
// 1) LISTING formatter (public storefront)
// ============================================================
const formatProductListingResponse = (product: any): IProductListingResponse => {
  const variants = product.variants || [];
  const prices = variants.map((v: any) => v.price);
  const { averageRating, reviewCount } = computeRating(product.Review || []);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    primaryImage: product.primaryImage,
    otherImages: product.otherImages || [],
    accords: product.accords || [],
    published: product.published,
    salesCount: product.salesCount,

    variants: variants.map((v: any) => ({
      id: v.id,
      sku: v.sku,
      unit: v.unit,
      size: v.size,
      price: v.price,
    })),

    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    totalStock: product.stock,
    inStock: product.stock > 0,

    averageRating,
    reviewCount,

    discount: pickBestDiscount(product.discounts),

    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

// ============================================================
// 1b) ADMIN LISTING formatter — keeps category + variant list
// ============================================================
const formatProductAdminListingResponse = (product: any): IProductAdminListingResponse => {
  const base = formatProductListingResponse(product);
  const variants = product.variants || [];

  return {
    ...base,
    category: product.category,
    variants: variants.map((v: any) => ({
      id: v.id,
      sku: v.sku,
      unit: v.unit,
      size: v.size,
      price: v.price,
    })),
  };
};

// ============================================================
// 2) SEARCH formatter (minimal, fast)
// ============================================================
const formatProductSearchResponse = (product: any): IProductSearchResponse => {
  const variants = product.variants || [];
  const prices = variants.map((v: any) => v.price);
  const { averageRating, reviewCount } = computeRating(product.Review || []);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    primaryImage: product.primaryImage,
    accords: product.accords || [],

    categoryName: product.category?.categoryName,

    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    inStock: product.stock > 0,

    averageRating,
    reviewCount,

    discount: pickBestDiscount(product.discounts),
  };
};

// ============================================================
// 3) DETAIL formatter (single product page)
// ============================================================
const formatProductDetailResponse = (product: any): IProductDetailResponse => {
  const variants = product.variants || [];
  const prices = variants.map((v: any) => v.price);
  const reviews = product.Review || [];
  const { averageRating, reviewCount } = computeRating(reviews);

  const materials = product.ProductMaterial?.map((pm: any) => pm.material) || [];
  const fragrances = product.ProductFragrance?.map((pf: any) => pf.fragrance) || [];

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    primaryImage: product.primaryImage,
    brand: product.brand,
    gender: product.gender,
    origin: product.origin,
    accords: product.accords || [],
    bestFor: product.bestFor || [],
    tags: product.tags || [],
    published: product.published,
    salesCount: product.salesCount,

    categoryId: product.categoryId,
    category: product.category,

    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    totalStock: product.stock,
    inStock: product.stock > 0,

    averageRating,
    reviewCount,

    description: product.description,
    videoUrl: product.videoUrl,
    otherImages: product.otherImages || [],

    perfumeNotes: product.perfumeNotes,
    performance: product.performance,
    longevity: product.longevity,
    projection: product.projection,
    sillage: product.sillage,

    materialIds: product.ProductMaterial?.map((m: any) => m.material.id) || [],
    fragranceIds: product.ProductFragrance?.map((f: any) => f.fragrance.id) || [],
    materials: materials.map((m: any) => ({ id: m.id, name: m.materialName })),
    fragrances: fragrances.map((f: any) => ({ id: f.id, name: f.fragranceName })),

    supplier: product.supplier,

    discounts: product.discounts || [],
    variants: variants.map((v: any) => ({
      ...v,
      discounts: v.discounts || [],
    })),

    reviews: reviews.map((r: any) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      isPublished: r.isPublished,
      productId: r.productId,
      userId: r.userId,
      user: r.user
        ? { name: r.user.name, imageUrl: r.user.imageUrl || '/default-avatar.png' }
        : { name: 'Anonymous', imageUrl: '/default-avatar.png' },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),

    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
};

const applySorting = (results: any[], sortBy?: string) => {
  if (sortBy === 'price_asc') {
    return results.sort((a, b) => {
      const minA = Math.min(...a.variants.map((v: any) => v.price));
      const minB = Math.min(...b.variants.map((v: any) => v.price));
      return minA - minB;
    });
  } else if (sortBy === 'price_desc') {
    return results.sort((a, b) => {
      const minA = Math.min(...a.variants.map((v: any) => v.price));
      const minB = Math.min(...b.variants.map((v: any) => v.price));
      return minB - minA;
    });
  } else if (sortBy === 'rating_asc') {
    return results.sort((a, b) => {
      const avgA = a.Review?.length ? a.Review.reduce((s: number, r: any) => s + r.rating, 0) / a.Review.length : 0;
      const avgB = b.Review?.length ? b.Review.reduce((s: number, r: any) => s + r.rating, 0) / b.Review.length : 0;
      return avgA - avgB;
    });
  } else if (sortBy === 'rating_desc') {
    return results.sort((a, b) => {
      const avgA = a.Review?.length ? a.Review.reduce((s: number, r: any) => s + r.rating, 0) / a.Review.length : 0;
      const avgB = b.Review?.length ? b.Review.reduce((s: number, r: any) => s + r.rating, 0) / b.Review.length : 0;
      return avgB - avgA;
    });
  }

  return results;
};

export const ProductServices = {
  createProduct,
  getAllProducts,
  getAllProductsAdmin,
  getProduct,
  getProductBySlug,
  updateProduct,
  deleteProduct,
  getTrendingProducts,
  getNavbarProducts,
  getFeaturedProducts,
  getNewArrivals,
  getProductsByCategoryId,
  getProductsByCategoryName,
  getRelatedProducts,
  searchProducts,
  getProductVariants,
  getProductAnalytics,
  getLowStockProducts,
  getBestsellers,
  updateProductStock,
  getStockLogs,
};