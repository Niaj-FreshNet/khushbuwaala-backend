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
  IVariantPackagingCostInput,
  IStockPurchaseInput,
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
export const createProduct = async (payload: IProduct, isSuperAdmin = false): Promise<IProductDetailResponse> => {
  const slug = slugify(payload.name, { lower: true, strict: true });

  // 1. Run category and SKU duplicate validation concurrently
  const [categoryExists, existingSKUs] = await Promise.all([
    prisma.category.findUnique({ where: { id: payload.categoryId }, select: { id: true } }),
    prisma.productVariant.findMany({
      where: { sku: { in: payload.variants.map(v => v.sku) } },
      select: { sku: true },
    }),
  ]);

  if (!categoryExists) {
    throw new AppError(404, 'Category not found');
  }

  if (existingSKUs.length > 0) {
    throw new AppError(
      400,
      `SKU already exists: ${existingSKUs.map(s => s.sku).join(', ')}`
    );
  }

  // 2. Use a transaction to perform product creation and relations in a single fast batch
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: payload.name,
        description: payload.description,
        slug,
        primaryImage: payload.primaryImage,
        otherImages: payload.otherImages || [],
        videos: payload.videos || [],
        tags: payload.tags,
        brand: payload.brand,
        condition: payload.condition || 'new',
        itemGroupId: payload.itemGroupId,
        googleProductCategory: payload.googleProductCategory,
        origin: payload.origin,
        gender: payload.gender,
        metaTitle: payload.metaTitle,
        metaDescription: payload.metaDescription,
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
            stock: v.stock ?? 0,
            published: v.published ?? true,
            isDefault: v.isDefault ?? false,
            gtin: v.gtin,
            mpn: v.mpn,
            barcode: v.barcode,
            compareAtPrice: v.compareAtPrice,
            costPrice: isSuperAdmin ? v.costPrice : undefined, // only Super Admin can set cost
            weightGrams: v.weightGrams,
            attributes: v.attributes || {},
            images: v.images || [],
          })),
        },
      },
    });

    // Bulk insert or link product materials safely
    if (payload.materialIds?.length) {
      for (const materialId of payload.materialIds) {
        await tx.productMaterial.upsert({
          where: { productId_materialId: { productId: product.id, materialId } },
          create: { productId: product.id, materialId },
          update: {},
        });
      }
    }

    // Bulk insert or link product fragrances safely
    if (payload.fragranceIds?.length) {
      for (const fragranceId of payload.fragranceIds) {
        await tx.productFragrance.upsert({
          where: { productId_fragranceId: { productId: product.id, fragranceId } },
          create: { productId: product.id, fragranceId },
          update: {},
        });
      }
    }

    return product;
  });

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

const toArray = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

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

const getAllProducts = async (query: IProductQuery) => {
  const { results, meta } = await runProductQuery(query);
  return { data: results.map(formatProductListingResponse), meta };
};

const getAllProductsAdmin = async (query: IProductQuery, isSuperAdmin = false) => {
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

  return { data: results.map((p: any) => formatProductAdminListingResponse(p, isSuperAdmin)), meta };
};

const getProduct = async (id: string, isSuperAdmin = false): Promise<IProductDetailResponse | null> => {
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

  const formattedProduct = formatProductAdminDetailResponse(product, isSuperAdmin);

  return {
    ...formattedProduct,
    relatedProducts: {
      sameBrand: relatedProducts.map(formatProductListingResponse),
      sameCategory: relatedProducts.map(formatProductListingResponse),
      similarAccords: relatedProducts.map(formatProductListingResponse),
    },
  };
};

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

export const updateProduct = async (
  id: string,
  payload: IUpdateProduct,
  isSuperAdmin = false
): Promise<IProductDetailResponse> => {
  // 1. Fetch product and category existence check concurrently if categoryId is updated
  const [existingProduct, categoryExists] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        ProductMaterial: true,
        ProductFragrance: true,
      },
    }),
    payload.categoryId
      ? prisma.category.findUnique({ where: { id: payload.categoryId }, select: { id: true } })
      : Promise.resolve(true),
  ]);

  if (!existingProduct) {
    throw new AppError(404, 'Product not found');
  }

  if (payload.categoryId && !categoryExists) {
    throw new AppError(404, 'Category not found');
  }

  // Cost is protected: variants are re-created on every edit, so carry the stored cost over by SKU
  const existingCostBySku = new Map<string, number | null>(
    existingProduct.variants.map((v) => [v.sku, v.costPrice ?? null])
  );

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

    Promise.all(imagesToDelete.map(safeDeleteCloudinary)).catch(err =>
      console.error('Cloudinary cleanup error:', err)
    );

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

  // 2. Wrap update operations in an atomic transaction with an increased timeout (15s)
  await prisma.$transaction(
    async (tx) => {
      // Update basic product info
      await tx.product.update({
        where: { id },
        data: {
          ...(payload.name && { name: payload.name, slug: slugify(payload.name, { lower: true, strict: true }) }),
          ...(payload.description && { description: payload.description }),
          ...(primaryImage && { primaryImage }),
          ...(otherImages && { otherImages }),
          ...(payload.videos && { videos: payload.videos }),
          ...(payload.tags && { tags: payload.tags }),
          ...(payload.brand !== undefined && { brand: payload.brand }),
          ...(payload.condition !== undefined && { condition: payload.condition }),
          ...(payload.itemGroupId !== undefined && { itemGroupId: payload.itemGroupId }),
          ...(payload.googleProductCategory !== undefined && { googleProductCategory: payload.googleProductCategory }),
          ...(payload.origin !== undefined && { origin: payload.origin }),
          ...(payload.gender !== undefined && { gender: payload.gender }),
          ...(payload.metaTitle !== undefined && { metaTitle: payload.metaTitle }),
          ...(payload.metaDescription !== undefined && { metaDescription: payload.metaDescription }),
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

      // Replace variants if provided
      if (payload.variants?.length) {
        await tx.productVariant.deleteMany({ where: { productId: id } });

        await tx.productVariant.createMany({
          data: payload.variants.map(v => ({
            sku: v.sku,
            size: v.size,
            unit: v.unit,
            price: v.price,
            stock: v.stock ?? 0,
            published: v.published ?? true,
            isDefault: v.isDefault ?? false,
            gtin: v.gtin,
            mpn: v.mpn,
            barcode: v.barcode,
            compareAtPrice: v.compareAtPrice,
            costPrice:
              isSuperAdmin && v.costPrice !== undefined
                ? v.costPrice
                : existingCostBySku.get(v.sku) ?? undefined,
            weightGrams: v.weightGrams,
            attributes: v.attributes || {},
            images: v.images || [],
            productId: id,
          })),
        });
      }

      // ⚡ Update materials concurrently using Promise.all
      if (payload.materialIds) {
        await tx.productMaterial.deleteMany({
          where: { productId: id, materialId: { notIn: payload.materialIds } },
        });

        if (payload.materialIds.length > 0) {
          await Promise.all(
            payload.materialIds.map(materialId =>
              tx.productMaterial.upsert({
                where: { productId_materialId: { productId: id, materialId } },
                create: { productId: id, materialId },
                update: {},
              })
            )
          );
        }
      }

      // ⚡ Update fragrances concurrently using Promise.all
      if (payload.fragranceIds) {
        await tx.productFragrance.deleteMany({
          where: { productId: id, fragranceId: { notIn: payload.fragranceIds } },
        });

        if (payload.fragranceIds.length > 0) {
          await Promise.all(
            payload.fragranceIds.map(fragranceId =>
              tx.productFragrance.upsert({
                where: { productId_fragranceId: { productId: id, fragranceId } },
                create: { productId: id, fragranceId },
                update: {},
              })
            )
          );
        }
      }
    },
    {
      maxWait: 10000, // 10s max wait to acquire connection
      timeout: 15000, // 15s timeout limit for the transaction
    }
  );

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

  // ⚡ 1. Execute DB transaction with an expanded timeout window (e.g. 15 seconds)
  await prisma.$transaction(
    async (tx) => {
      await tx.cartItem.deleteMany({ where: { productId: id } });
      await tx.wishlist.deleteMany({ where: { productId: id } });
      await tx.comboVariant.deleteMany({ where: { productId: id } });
      await tx.review.deleteMany({ where: { productId: id } });
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.discount.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    },
    {
      maxWait: 10000, // Max wait time to connect to transaction pool
      timeout: 15000, // Increased transaction timeout to 15 seconds
    }
  );

  // ⚡ 2. Handle Cloudinary cleanup AFTER the transaction has safely closed
  const safeDeleteCloudinary = async (url: string) => {
    try {
      const publicId = getPublicIdFromCloudinaryUrl(url);
      if (!publicId) return;
      await deleteFromCloudinaryByPublicId(publicId);
    } catch (err) {
      console.error('Cloudinary deletion failed for URL:', url, err);
    }
  };

  const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];

  // Run image deletions asynchronously in the background so they don't block the response
  Promise.all(allImages.filter(Boolean).map(safeDeleteCloudinary)).catch((err) =>
    console.error('Background image cleanup error:', err)
  );

  return { id };
};

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
      stock: v.stock,
    })),
  }));
};

const getBestsellers = async (): Promise<ITrendingProduct[]> => {
  const products = await prisma.product.findMany({
    where: { published: true },
    include: LEAN_PRODUCT_INCLUDE,
    orderBy: { salesCount: 'desc' },
    take: 20,
  });

  return products.map((product, index) => ({
    ...formatProductAdminListingResponse(product),
    totalSold: product.salesCount,
    trendingScore: 100 - index,
  }));
};

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

const computeRating = (reviews: any[]) => {
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviewCount
      : 0;
  return { averageRating: parseFloat(averageRating.toFixed(2)), reviewCount };
};

const pickBestDiscount = (discounts: any[] = []) => {
  if (!discounts.length) return undefined;

  const now = new Date();

  const active = discounts.filter((d) => {
    if (d.code && String(d.code).trim() !== '') return false;
    const startOk = !d.startDate || new Date(d.startDate) <= now;
    const endOk = !d.endDate || new Date(d.endDate) >= now;
    return startOk && endOk;
  });

  if (!active.length) return undefined;

  const best = active.reduce((a, b) => (b.value > a.value ? b : a));
  return { type: best.type, value: best.value };
};

const formatProductListingResponse = (product: any): IProductListingResponse => {
  const variants = (product.variants || []).filter((v: any) => v.published !== false);
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
      stock: v.stock,
      isDefault: v.isDefault,
      published: v.published,
      compareAtPrice: v.compareAtPrice,
      images: v.images || [],
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

const formatProductAdminListingResponse = (product: any, isSuperAdmin = false): IProductAdminListingResponse => {
  const base = formatProductListingResponse(product);
  const variants = product.variants || [];

  return {
    ...base,
    supplier: product.supplier || null,
    brand: product.brand || null,
    categoryId: product.categoryId,
    category: product.category,
    variants: variants.map((v: any) => ({
      id: v.id, sku: v.sku, unit: v.unit, size: v.size, price: v.price, stock: v.stock,
      isDefault: v.isDefault, published: v.published ?? true,
      compareAtPrice: v.compareAtPrice, images: v.images || [],
      lowStockAlert: v.lowStockAlert, barcode: v.barcode, gtin: v.gtin, mpn: v.mpn, weightGrams: v.weightGrams,
      ...(isSuperAdmin ? { costPrice: v.costPrice ?? null } : {}),
    })),
  } as any;
};
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

const formatProductDetailResponse = (product: any): IProductDetailResponse => {
  const variants = (product.variants || []).filter((v: any) => v.published !== false);
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
    condition: product.condition,
    itemGroupId: product.itemGroupId,
    googleProductCategory: product.googleProductCategory,
    gender: product.gender,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
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
    // costPrice is never exposed in this (public) response
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    variants: variants.map(({ costPrice: _hiddenCost, ...v }: any) => ({
      ...v,
      images: v.images || [],
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

const formatProductAdminDetailResponse = (product: any, isSuperAdmin = false): IProductDetailResponse => {
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
    condition: product.condition,
    itemGroupId: product.itemGroupId,
    googleProductCategory: product.googleProductCategory,
    gender: product.gender,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
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
    videos: product.videos || [],
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

    // ⚡ Explicitly preserve variant publication status for admin views
    variants: variants.map(({ costPrice, ...v }: any) => ({
      ...v,
      ...(isSuperAdmin ? { costPrice: costPrice ?? null } : {}), // cost only for Super Admin
      published: v.published ?? true,
      images: v.images || [],
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

const upsertVariantPackagingCost = async (sku: string, payload: IVariantPackagingCostInput) => {
  const totalCost = payload.costLines.reduce((sum, line) => sum + line.amount, 0);

  const variant = await prisma.productVariant.findUnique({ where: { sku } });
  if (!variant) {
    throw new AppError(404, `Variant with SKU ${sku} not found.`);
  }

  return await prisma.variantPackagingCost.upsert({
    where: { sku },
    update: {
      costLines: payload.costLines,
      totalCost,
    },
    create: {
      sku,
      costLines: payload.costLines,
      totalCost,
    },
  });
};

const addStockPurchaseAndUpdateWAC = async (payload: IStockPurchaseInput) => {
  const { productId, quantity, costLines, supplier, billNo, note, unit, createdById } = payload;

  const totalPurchaseCost = costLines.reduce((sum, line) => sum + line.amount, 0);
  const costPerUnit = totalPurchaseCost / quantity;

  return await prisma.$transaction(async (tx) => {
    // 1. Get current stock and current live cost
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError(404, PRODUCT_ERROR_MESSAGES.NOT_FOUND);

    const currentCostData = await tx.productCost.findUnique({ where: { productId } });

    const currentStock = product.stock || 0;
    const currentAvgCost = currentCostData?.avgCostPerUnit || 0;

    // 2. Calculate New Weighted Average Cost (WAC)
    // Formula: ((Old Stock * Old Avg Cost) + New Purchase Cost) / (Old Stock + New Stock)
    const totalCurrentValue = currentStock * currentAvgCost;
    const newTotalStock = currentStock + quantity;
    const newAvgCostPerUnit = (totalCurrentValue + totalPurchaseCost) / newTotalStock;

    // 3. Log the Financial Purchase
    const purchase = await tx.stockPurchase.create({
      data: {
        productId,
        quantity,
        unit,
        totalCost: totalPurchaseCost,
        costPerUnit,
        costLines,
        supplier,
        billNo,
        note,
        createdById,
        isOpening: currentStock === 0, // Flag as opening stock if it was 0
      },
    });

    // 4. Update the live ProductCost WAC
    await tx.productCost.upsert({
      where: { productId },
      update: {
        avgCostPerUnit: newAvgCostPerUnit,
        lastCostPerUnit: costPerUnit,
      },
      create: {
        productId,
        avgCostPerUnit: costPerUnit, // Fallback if no history
        lastCostPerUnit: costPerUnit,
      },
    });

    // 5. Update actual Product Stock
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });

    // 6. Push a standard Stock Log for frontend history
    await tx.stockLog.create({
      data: {
        productId,
        change: quantity,
        reason: `Purchase Bill: ${billNo || 'N/A'} - Supp: ${supplier || 'N/A'}`,
      },
    });

    return purchase;
  });
};

export interface IQuickCellUpdatePayload {
  entity: 'PRODUCT' | 'VARIANT';
  id: string;
  field: string;
  value: string | number | boolean | null;
}

const ALLOWED_PRODUCT_FIELDS = ['name', 'published', 'categoryId', 'supplier', 'stock', 'brand'] as const;
const ALLOWED_VARIANT_FIELDS = [
  'price', 'compareAtPrice', 'costPrice', 'stock', 'published', 'sku', 'size', 'unit',
  'lowStockAlert', 'barcode', 'gtin', 'mpn', 'weightGrams',
] as const;

const quickUpdateCell = async (payload: IQuickCellUpdatePayload, isSuperAdmin = false) => {
  const { entity, id, field, value } = payload;

  if (entity === 'PRODUCT') {
    if (!ALLOWED_PRODUCT_FIELDS.includes(field as (typeof ALLOWED_PRODUCT_FIELDS)[number])) {
      throw new AppError(400, `Field '${field}' is not editable on Product.`);
    }

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, PRODUCT_ERROR_MESSAGES.NOT_FOUND);
    }

    const data: Record<string, any> = {};

    if (field === 'name') {
      const cleanName = String(value ?? '').trim();
      if (!cleanName) {
        throw new AppError(400, 'Product name cannot be empty.');
      }
      data.name = cleanName;
      data.slug = slugify(cleanName, { lower: true, strict: true });
    } else if (field === 'published') {
      data.published = Boolean(value);
    } else if (field === 'stock') {
      data.stock = Number(value);
    } else if (field === 'categoryId') {
      const category = await prisma.category.findUnique({
        where: { id: String(value) },
        select: { id: true },
      });
      if (!category) {
        throw new AppError(404, 'Category not found.');
      }
      data.categoryId = String(value);
    } else {
      data[field] = value === '' ? null : value;
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        published: true,
        stock: true,
        supplier: true,
        categoryId: true,
        minPrice: true,
        maxPrice: true,
        updatedAt: true,
      },
    });

    return {
      entity: 'PRODUCT',
      data: updatedProduct,
    };
  }

  if (entity === 'VARIANT') {
    if (!ALLOWED_VARIANT_FIELDS.includes(field as (typeof ALLOWED_VARIANT_FIELDS)[number])) {
      throw new AppError(400, `Field '${field}' is not editable on ProductVariant.`);
    }

    if (field === 'costPrice' && !isSuperAdmin) {
      throw new AppError(403, 'Only Super Admin can edit cost price.');
    }

    const existingVariant = await prisma.productVariant.findUnique({
      where: { id },
      select: { id: true, productId: true, sku: true },
    });
    if (!existingVariant) {
      throw new AppError(404, 'Product variant not found.');
    }

    const data: Record<string, any> = {};

    if (field === 'sku') {
      const cleanSku = String(value ?? '').trim().toUpperCase();
      if (!cleanSku) {
        throw new AppError(400, 'SKU cannot be empty.');
      }
      const duplicateSku = await prisma.productVariant.findFirst({
        where: {
          sku: cleanSku,
          id: { not: id },
        },
        select: { id: true },
      });
      if (duplicateSku) {
        throw new AppError(400, `SKU '${cleanSku}' is already in use by another variant.`);
      }
      data.sku = cleanSku;
    } else if (field === 'unit') {
      const cleanUnit = String(value ?? '').trim().toUpperCase();
      if (!cleanUnit) {
        throw new AppError(400, 'Unit cannot be empty.');
      }
      data.unit = cleanUnit;
    } else if (field === 'published') {
      data.published = Boolean(value);
    } else if (['price', 'compareAtPrice', 'costPrice', 'stock', 'size', 'lowStockAlert', 'weightGrams'].includes(field)) {
      data[field] = Number(value);
    } else if (['barcode', 'gtin', 'mpn'].includes(field)) {
      data[field] = String(value ?? '').trim() || null;
    } else {
      data[field] = value;
    }

    const updatedVariant = await prisma.productVariant.update({
      where: { id },
      data,
    });

    // Keep parent Product minPrice & maxPrice in sync whenever price or published state changes
    let parentPriceRange: { minPrice: number; maxPrice: number } | undefined;
    if (field === 'price' || field === 'published') {
      const activeVariants = await prisma.productVariant.findMany({
        where: {
          productId: existingVariant.productId,
          published: { not: false },
        },
        select: { price: true },
      });

      const prices = activeVariants.map((v) => Number(v.price) || 0);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const maxPrice = prices.length ? Math.max(...prices) : 0;

      await prisma.product.update({
        where: { id: existingVariant.productId },
        data: { minPrice, maxPrice },
      });

      parentPriceRange = { minPrice, maxPrice };
    }

    return {
      entity: 'VARIANT',
      data: updatedVariant,
      parentPriceRange,
    };
  }

  throw new AppError(400, 'Invalid entity type. Expected PRODUCT or VARIANT.');
};


const escapeXml = (value: unknown): string => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const stripHtml = (value: string): string => {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const generateGoogleShoppingFeed = async (): Promise<string> => {
  const products = await prisma.product.findMany({
    where: { published: true },
    include: {
      variants: true,
      category: {
        select: { categoryName: true },
      },
    },
  });

  const domain = (
    process.env.FRONTEND_LIVE_URL || "https://khushbuwaala.com"
  ).replace(/\/+$/, "");

  const defaultCategory =
    "Health & Beauty > Personal Care > Cosmetics > Perfume";

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;

  xml += `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n`;
  xml += `  <channel>\n`;
  xml += `    <title>${escapeXml("Khushbuwaala Product Catalog")}</title>\n`;
  xml += `    <link>${escapeXml(domain)}</link>\n`;
  xml += `    <description>${escapeXml(
    "Bespoke fragrances, attars, and custom perfumes catalog"
  )}</description>\n`;

  // Helper to generate common XML fields
  const addCommonFields = (
    product: any,
    itemId: string,
    title: string,
    description: string,
    link: string,
    imageLink: string,
    price: string,
    availability: string,
    brand: string,
    category: string,
    gender: string,
    ageGroup: string
  ) => {
    xml += `    <item>\n`;

    xml += `      <g:id>${escapeXml(itemId)}</g:id>\n`;
    xml += `      <g:title>${escapeXml(title)}</g:title>\n`;
    xml += `      <g:description>${escapeXml(description)}</g:description>\n`;
    xml += `      <g:link>${escapeXml(link)}</g:link>\n`;
    xml += `      <g:image_link>${escapeXml(imageLink)}</g:image_link>\n`;

    xml += `      <g:condition>${escapeXml(
      product.condition || "new"
    )}</g:condition>\n`;

    xml += `      <g:availability>${escapeXml(
      availability
    )}</g:availability>\n`;

    xml += `      <g:price>${escapeXml(price)}</g:price>\n`;
    xml += `      <g:brand>${escapeXml(brand)}</g:brand>\n`;

    xml += `      <g:google_product_category>${escapeXml(
      category
    )}</g:google_product_category>\n`;

    xml += `      <g:gender>${escapeXml(gender)}</g:gender>\n`;
    xml += `      <g:age_group>${escapeXml(ageGroup)}</g:age_group>\n`;

    // Additional product images
    const additionalImages = product.otherImages || [];

    for (const imgLink of additionalImages.slice(0, 10)) {
      if (imgLink) {
        xml += `      <g:additional_image_link>${escapeXml(
          imgLink
        )}</g:additional_image_link>\n`;
      }
    }

    // Product videos
    for (const videoLink of product.videos || []) {
      if (videoLink) {
        xml += `      <g:video_link>${escapeXml(
          videoLink
        )}</g:video_link>\n`;
      }
    }
    // GTIN and shipping weight are added separately per variant/product
    xml += `    </item>\n`;
  };

  for (const product of products) {
    const parentId = product.id;
    const brand = product.brand || "Khushbuwaala";
    const category =
      product.googleProductCategory ||
      product.category?.categoryName ||
      defaultCategory;

    const description = stripHtml(product.description || "");

    const gender = product.gender?.toLowerCase() || "unisex";
    const ageGroup = product.bestFor?.join(", ") || "all";

    const productVideos = product.videos || [];

    if (product.variants && product.variants.length > 0) {
      for (const variant of product.variants) {
        // Skip unpublished variants
        if (variant.published === false) continue;

        const variantImages = variant.images?.length
          ? variant.images
          : [product.primaryImage];

        const primaryVariantImage =
          variantImages[0] || product.primaryImage;

        const variantAdditionalImages = [
          ...variantImages.slice(1),
          ...(product.otherImages || []),
        ].filter(Boolean).slice(0, 10);

        const variantUrl = `${domain}/products/${product.slug}?variant=${variant.id}`;

        const availability =
          variant.stock > 0 || product.stock > 0
            ? "in_stock"
            : "out_of_stock";

        const priceStr = `${variant.price.toFixed(2)} BDT`;

        const compareAtPrice = variant.compareAtPrice;

        const hasSalePrice =
          compareAtPrice != null && compareAtPrice > variant.price;

        const regularPriceStr = hasSalePrice
          ? `${compareAtPrice!.toFixed(2)} BDT`
          : priceStr;

        const title = `${product.name} - ${variant.size}${variant.unit}`;

        xml += `    <item>\n`;

        xml += `      <g:id>${escapeXml(variant.sku)}</g:id>\n`;
        xml += `      <g:title>${escapeXml(title)}</g:title>\n`;
        xml += `      <g:description>${escapeXml(description)}</g:description>\n`;
        xml += `      <g:link>${escapeXml(variantUrl)}</g:link>\n`;

        if (primaryVariantImage) {
          xml += `      <g:image_link>${escapeXml(
            primaryVariantImage
          )}</g:image_link>\n`;
        }

        // Variant-specific additional images
        for (const imgLink of variantAdditionalImages) {
          xml += `      <g:additional_image_link>${escapeXml(
            imgLink
          )}</g:additional_image_link>\n`;
        }

        // Condition
        xml += `      <g:condition>${escapeXml(
          product.condition || "new"
        )}</g:condition>\n`;

        // Availability
        xml += `      <g:availability>${escapeXml(
          availability
        )}</g:availability>\n`;

        // Price
        xml += `      <g:price>${escapeXml(
          regularPriceStr
        )}</g:price>\n`;

        // Sale price
        if (hasSalePrice) {
          xml += `      <g:sale_price>${escapeXml(
            priceStr
          )}</g:sale_price>\n`;
        }

        // Brand
        xml += `      <g:brand>${escapeXml(brand)}</g:brand>\n`;

        // Group variants together
        xml += `      <g:item_group_id>${escapeXml(
          parentId
        )}</g:item_group_id>\n`;

        // Google product category
        xml += `      <g:google_product_category>${escapeXml(
          category
        )}</g:google_product_category>\n`;

        // Gender and age group
        xml += `      <g:gender>${escapeXml(gender)}</g:gender>\n`;
        xml += `      <g:age_group>${escapeXml(ageGroup)}</g:age_group>\n`;

        // GTIN
        if (variant.gtin) {
          xml += `      <g:gtin>${escapeXml(
            variant.gtin
          )}</g:gtin>\n`;
        }

        // Shipping weight
        if (variant.weightGrams) {
          xml += `      <g:shipping_weight>${escapeXml(
            `${variant.weightGrams} g`
          )}</g:shipping_weight>\n`;
        }

        // Product videos
        for (const videoLink of productVideos) {
          if (videoLink) {
            xml += `      <g:video_link>${escapeXml(
              videoLink
            )}</g:video_link>\n`;
          }
        }

        xml += `    </item>\n`;
      }
    } else {
      // Products without variants
      const availability =
        product.stock > 0 ? "in_stock" : "out_of_stock";

      const link = `${domain}/products/${product.slug}`;

      const price = `${product.minPrice.toFixed(2)} BDT`;

      const imageLink = product.primaryImage || "";

      addCommonFields(
        product,
        product.id,
        product.name,
        description,
        link,
        imageLink,
        price,
        availability,
        brand,
        category,
        gender,
        ageGroup
      );
    }
  }

  xml += `  </channel>\n`;
  xml += `</rss>`;

  return xml;
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
  upsertVariantPackagingCost,
  addStockPurchaseAndUpdateWAC,
  quickUpdateCell,
  generateGoogleShoppingFeed,
};