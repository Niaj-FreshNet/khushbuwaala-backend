import { subDays, subMonths } from 'date-fns';
import { prisma } from '../../../prisma/client';
import AppError from '../../errors/AppError';
import { deleteFile } from '../../helpers/fileDelete';
import QueryBuilder from '../../helpers/queryBuilder';
import {
  IProduct,
  IUpdateProduct,
  IProductQuery,
  IProductResponse,
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
  productInclude,
  productDetailInclude,
  productAdminInclude,
  QUERY_DEFAULTS,
  PRODUCT_ERROR_MESSAGES,
} from './product.constant';
import { Unit } from '@prisma/client';
import slugify from 'slugify';

// Create Product
export const createProduct = async (payload: IProduct): Promise<IProductResponse> => {
  // Check if category exists
  const categoryExists = await prisma.category.findUnique({
    where: { id: payload.categoryId },
  });
  if (!categoryExists) {
    throw new AppError(404, 'Category not found');
  }

  // Check for duplicate SKUs
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

  // Generate slug
  const slug = slugify(payload.name, { lower: true, strict: true });

  // 1️⃣ Create the product first
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
          unit: Unit.ML,
          price: v.price,
        })),
      },
    },
    include: {
      variants: true,
      category: true,
    },
  });

  // 2️⃣ Add Material relations using upsert (safe for MongoDB)
  if (payload.materialIds?.length) {
    for (const materialId of payload.materialIds) {
      await prisma.productMaterial.upsert({
        where: {
          productId_materialId: {
            productId: result.id,
            materialId,
          },
        },
        create: { productId: result.id, materialId },
        update: {}, // do nothing if exists
      });
    }
  }

  // 3️⃣ Add Fragrance relations using upsert
  if (payload.fragranceIds?.length) {
    for (const fragranceId of payload.fragranceIds) {
      await prisma.productFragrance.upsert({
        where: {
          productId_fragranceId: {
            productId: result.id,
            fragranceId,
          },
        },
        create: { productId: result.id, fragranceId },
        update: {}, // do nothing if exists
      });
    }
  }

  // 4️⃣ Fetch the product again including materials & fragrances
  const finalProduct = await prisma.product.findUnique({
    where: { id: result.id },
    include: {
      variants: true,
      category: true,
      ProductMaterial: { include: { material: true } },
      ProductFragrance: { include: { fragrance: true } },
    },
  });

  return formatProductResponse(finalProduct!);
};

// Get All Products (Public)
const getAllProducts = async (query: IProductQuery) => {
  const queryBuilder = new QueryBuilder(query, prisma.product);

  let results = await queryBuilder
    .filter(productFilterFields)
    .search(productSearchFields)
    // .arraySearch(productArraySearchFields)
    .nestedFilter(productNestedFilters)
    .sort()
    .paginate()
    .include(productInclude)
    .fields()
    .filterByRange(productRangeFilter)
    .rawFilter({ published: true })
    .execute();

  const meta = await queryBuilder.countTotal();

  // Apply stock filtering
  if (query.stock === 'in') {
    results = results.filter((product: any) =>
      product.variants.some((v: any) => v.stock > 0)
    );
  } else if (query.stock === 'out') {
    results = results.filter((product: any) =>
      product.variants.every((v: any) => v.stock === 0)
    );
  }

  // Apply custom sorting
  results = applySorting(results, query.sortBy);

  return {
    data: results.map(formatProductResponse),
    meta,
  };
};

// Get All Products (Admin)
const getAllProductsAdmin = async (query: IProductQuery) => {
  const queryBuilder = new QueryBuilder(query, prisma.product);

  let results = await queryBuilder
    .filter(productFilterFields)
    .search(productSearchFields)
    // .arraySearch(productArraySearchFields)
    .nestedFilter(productNestedFilters)
    .sort()
    .paginate()
    .include(productAdminInclude)
    .fields()
    .filterByRange(productRangeFilter)
    .execute();

  const meta = await queryBuilder.countTotal();

  // Apply stock filtering
  if (query.stock === 'in') {
    results = results.filter((product: any) =>
      product.variants.some((v: any) => v.stock > 0)
    );
  } else if (query.stock === 'out') {
    results = results.filter((product: any) =>
      product.variants.every((v: any) => v.stock === 0)
    );
  }

  // Apply custom sorting
  results = applySorting(results, query.sortBy);

  return {
    data: results.map(formatProductResponse),
    meta,
  };
};

// Get Single Product
const getProduct = async (id: string): Promise<IProductResponse | null> => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productDetailInclude,
  });

  if (!product) return null;

  // Get related products
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
    include: productInclude,
    take: QUERY_DEFAULTS.RELATED_LIMIT,
    orderBy: { salesCount: 'desc' },
  });

  const formattedProduct = formatProductResponse(product);

  return {
    ...formattedProduct,
    relatedProducts: relatedProducts.map(formatProductResponse),
  } as any;
};

// Get Product By Slug
const getProductBySlug = async (slug: string): Promise<IProductResponse | null> => {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: productDetailInclude,
  });

  if (!product) return null;

  // Get related products (similar to getProduct)
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
    include: productInclude,
    take: QUERY_DEFAULTS.RELATED_LIMIT,
    orderBy: { salesCount: 'desc' },
  });

  const formattedProduct = formatProductResponse(product);

  return {
    ...formattedProduct,
    relatedProducts: relatedProducts.map(formatProductResponse),
  } as any;
};

// Update Product
export const updateProduct = async (
  id: string,
  payload: IUpdateProduct
): Promise<IProductResponse> => {
  // 1️⃣ Fetch existing product
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

  // 2️⃣ Check category if provided
  if (payload.categoryId) {
    const categoryExists = await prisma.category.findUnique({
      where: { id: payload.categoryId },
    });
    if (!categoryExists) {
      throw new AppError(404, 'Category not found');
    }
  }

  // 3️⃣ Handle image updates
  let primaryImage = existingProduct.primaryImage;
  let otherImages = existingProduct.otherImages;

  if (payload.imagesToKeep || payload.newImages) {
    const imagesToKeep = payload.imagesToKeep || [];
    const newImages = payload.newImages || [];

    const currentImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
    const imagesToDelete = currentImages.filter(
      img => img && !imagesToKeep.includes(img) && !newImages.includes(img)
    );

    await Promise.all(imagesToDelete.map(deleteFile));

    const allNewImages = [...imagesToKeep, ...newImages];
    if (allNewImages.length > 0) {
      primaryImage = allNewImages[0];
      otherImages = allNewImages.slice(1);
    }
  }

  // 4️⃣ Check for duplicate SKUs if variants are being updated
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

  // 5️⃣ Update main product
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

  // 6️⃣ Update variants
  if (payload.variants?.length) {
    await prisma.productVariant.deleteMany({ where: { productId: id } });

    await prisma.productVariant.createMany({
      data: payload.variants.map(v => ({
        sku: v.sku,
        size: v.size,
        unit: Unit.ML,
        price: v.price,
        productId: id,
      })),
    });
  }

  // 7️⃣ Update Material relations using upsert
  if (payload.materialIds) {
    // Delete any material that is not in the payload
    await prisma.productMaterial.deleteMany({
      where: { productId: id, materialId: { notIn: payload.materialIds } },
    });

    // Upsert each material
    for (const materialId of payload.materialIds) {
      await prisma.productMaterial.upsert({
        where: {
          productId_materialId: { productId: id, materialId },
        },
        create: { productId: id, materialId },
        update: {}, // do nothing
      });
    }
  }

  // 8️⃣ Update Fragrance relations using upsert
  if (payload.fragranceIds) {
    await prisma.productFragrance.deleteMany({
      where: { productId: id, fragranceId: { notIn: payload.fragranceIds } },
    });

    for (const fragranceId of payload.fragranceIds) {
      await prisma.productFragrance.upsert({
        where: {
          productId_fragranceId: { productId: id, fragranceId },
        },
        create: { productId: id, fragranceId },
        update: {},
      });
    }
  }

  // 9️⃣ Fetch the updated product with all relations
  const finalProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: true,
      category: true,
      ProductMaterial: { include: { material: true } },
      ProductFragrance: { include: { fragrance: true } },
    },
  });

  return formatProductResponse(finalProduct!);
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

  // Check if product has active orders (optional business rule)


  const hasActiveOrders = await prisma.order.findFirst({
    where: {
      productIds: { has: id }, // ✅ works on String[]
      status: { not: 'CANCEL' },
    },
  });

  if (hasActiveOrders && existingProduct.published) {
    throw new AppError(400, PRODUCT_ERROR_MESSAGES.PRODUCT_PUBLISHED_CANNOT_DELETE);
  }


  // Delete related data
  await prisma.$transaction(async (tx) => {
    // Delete wishlist items
    await tx.wishlist.deleteMany({ where: { productId: id } });

    // Delete combo variants
    await tx.comboVariant.deleteMany({ where: { productId: id } });

    // Delete reviews
    await tx.review.deleteMany({ where: { productId: id } });

    // Delete variants
    await tx.productVariant.deleteMany({ where: { productId: id } });

    // Delete discounts
    await tx.discount.deleteMany({ where: { productId: id } });

    // Delete product
    await tx.product.delete({ where: { id } });
  });

  // Delete images from storage
  const allImages = [existingProduct.primaryImage, ...existingProduct.otherImages];
  await Promise.all(allImages.filter(Boolean).map(deleteFile));

  return { id };
};

// Get Trending Products
const getTrendingProducts = async (): Promise<ITrendingProduct[]> => {
  const threeMonthsAgo = subMonths(new Date(), 3);

  const recentOrders = await prisma.order.findMany({
    where: {
      orderTime: { gte: threeMonthsAgo },
      isPaid: true,
      status: { not: 'CANCEL' },
    },
    select: { cartItems: true },
  });

  const productSales: Record<string, number> = {};

  for (const order of recentOrders) {
    const cart = order.cartItems as Array<{ productId: string; quantity: number }>;
    for (const item of cart) {
      if (item?.productId) {
        productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
      }
    }
  }

  const topProductIds = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, QUERY_DEFAULTS.TRENDING_LIMIT)
    .map(([productId]) => productId);

  const trendingProducts = await prisma.product.findMany({
    where: {
      id: { in: topProductIds },
      published: true,
    },
    include: productInclude,
  });

  return trendingProducts.map((product) => ({
    ...formatProductResponse(product),
    totalSold: productSales[product.id] || 0,
    trendingScore: Math.round((productSales[product.id] || 0) * 1.5), // Custom trending algorithm
  }));
};

// Get Navbar Products
const getNavbarProducts = async () => {
  const threeMonthsAgo = subMonths(new Date(), 3);

  const recentOrders = await prisma.order.findMany({
    where: {
      orderTime: { gte: threeMonthsAgo },
      isPaid: true,
      status: { not: 'CANCEL' },
    },
    select: { cartItems: true },
  });

  const productSales: Record<string, number> = {};

  for (const order of recentOrders) {
    const cart = order.cartItems as Array<{ productId: string; quantity: number }>;
    for (const item of cart) {
      if (item?.productId) {
        productSales[item.productId] = (productSales[item.productId] || 0) + item.quantity;
      }
    }
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: Object.keys(productSales) },
      published: true,
    },
    include: { category: true },
  });

  const categoryWise: Record<string, { id: string; name: string; sold: number }[]> = {};
  const overallList: Array<{ id: string; name: string; totalSold: number }> = [];

  for (const product of products) {
    const sold = productSales[product.id] || 0;
    const catName = product.category.categoryName;

    if (!categoryWise[catName]) {
      categoryWise[catName] = [];
    }

    categoryWise[catName].push({
      id: product.id,
      name: product.name,
      sold,
    });

    overallList.push({
      id: product.id,
      name: product.name,
      totalSold: sold,
    });
  }

  const publishedCategories = await prisma.category.findMany({
    where: { published: true },
  });

  const trendingByCategory: Record<string, { id: string; name: string }[]> = {};

  for (const category of publishedCategories) {
    const catName = category.categoryName;
    const productsInCategory = categoryWise[catName] || [];

    const topProducts = productsInCategory
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        name: p.name,
      }));

    trendingByCategory[catName] = topProducts;
  }

  const overallTrending = overallList
    .sort((a, b) => b.totalSold - a.totalSold)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
    }));

  return {
    trendingByCategory,
    overallTrending,
  };
};

// Get Featured Products
const getFeaturedProducts = async (): Promise<IProductResponse[]> => {
  const products = await prisma.product.findMany({
    where: {
      published: true,
      salesCount: { gte: 10 }, // Products with good sales
    },
    include: productInclude,
    orderBy: [
      { salesCount: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 12,
  });

  return products.map(formatProductResponse);
};

// Get New Arrivals
const getNewArrivals = async (): Promise<IProductResponse[]> => {
  const cutoffDate = subDays(new Date(), QUERY_DEFAULTS.NEW_ARRIVALS_DAYS);

  const products = await prisma.product.findMany({
    where: {
      published: true,
      createdAt: { gte: cutoffDate },
    },
    include: productInclude,
    orderBy: { createdAt: 'desc' },
    take: 12,
  });

  return products.map(formatProductResponse);
};

// Get Products by Category
const getProductsByCategory = async (categoryId: string, query: IProductQuery) => {
  const categoryQuery = { ...query, category: categoryId };
  const queryBuilder = new QueryBuilder(categoryQuery, prisma.product);

  let results = await queryBuilder
    .filter(productFilterFields)
    .search(productSearchFields)
    .arraySearch(productArraySearchFields)
    .nestedFilter(productNestedFilters)
    .sort()
    .paginate()
    .include(productInclude)
    .fields()
    .filterByRange(productRangeFilter)
    .rawFilter({ published: true, categoryId })
    .execute();

  const meta = await queryBuilder.countTotal();

  // Apply custom sorting
  results = applySorting(results, query.sortBy);

  return {
    data: results.map(formatProductResponse),
    meta,
  };
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
    // Same brand products
    prisma.product.findMany({
      where: {
        brand: product.brand,
        id: { not: productId },
        published: true,
      },
      include: productInclude,
      take: 4,
      orderBy: { salesCount: 'desc' },
    }),

    // Same category products
    prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: productId },
        published: true,
      },
      include: productInclude,
      take: 4,
      orderBy: { salesCount: 'desc' },
    }),

    // Similar accords
    prisma.product.findMany({
      where: {
        accords: { hasSome: product.accords },
        id: { not: productId },
        published: true,
      },
      include: productInclude,
      take: 4,
      orderBy: { salesCount: 'desc' },
    }),
  ]);

  return {
    sameBrand: sameBrand.map(formatProductResponse),
    sameCategory: sameCategory.map(formatProductResponse),
    similarAccords: similarAccords.map(formatProductResponse),
  };
};

// Search Products
const searchProducts = async (query: IProductQuery): Promise<IProductSearchResult> => {
  const result = await getAllProducts(query);

  // Get available filters
  const [brands, categories, priceRange, origins, accords] = await Promise.all([
    prisma.product.findMany({
      where: { published: true, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
    }),
    prisma.category.findMany({
      where: { published: true },
      select: { id: true, categoryName: true },
    }),
    prisma.productVariant.aggregate({
      _min: { price: true },
      _max: { price: true },
    }),
    prisma.product.findMany({
      where: { published: true, origin: { not: null } },
      select: { origin: true },
      distinct: ['origin'],
    }),
    prisma.product.findMany({
      where: { published: true },
      select: { accords: true },
    }),
  ]);

  const uniqueAccords = [...new Set(accords.flatMap(p => p.accords))];

  return {
    ...result,
    filters: {
      brands: brands.map(b => b.brand!).filter(Boolean),
      categories: categories.map(c => ({ id: c.id, name: c.categoryName })),
      priceRange: {
        min: priceRange._min.price || 0,
        max: priceRange._max.price || 0,
      },
      origins: origins.map(o => o.origin!).filter(Boolean),
      accords: uniqueAccords,
    },
    meta: {
      ...result.meta,
      totalPages: result.meta.totalPage,
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

// Update Variant Stock
// const updateVariantStock = async (variantId: string, newStock: number, reason?: string) => {
//   const variant = await prisma.productVariant.findUnique({
//     where: { id: variantId },
//   });

//   if (!variant) {
//     throw new AppError(404, PRODUCT_ERROR_MESSAGES.VARIANT_NOT_FOUND);
//   }

//   const updatedVariant = await prisma.productVariant.update({
//     where: { id: variantId },
//     data: { stock: newStock },
//   });

//   // Optional: Log stock change for audit trail
//   // You can create a StockLog model for this

//   return updatedVariant;
// };

// Update Product Stock
const updateProductStock = async (productId: string, addedStock: number, reason?: string) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new AppError(404, PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND);
  }

  const newTotalStock = (product.stock ?? 0) + addedStock;

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      stock: newTotalStock,
    },
  });

  // 🔥 Optional: create a StockLog entry for auditing
  // await prisma.stockLog.create({
  //   data: {
  //     productId,
  //     change: addedStock,
  //     newStock: newTotalStock,
  //     reason: reason || "Stock updated",
  //   },
  // });

  return updatedProduct;
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
    prisma.productVariant.aggregate({
      _avg: { price: true },
      _sum: { price: true },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
      where: { published: true },
    }),
    prisma.product.groupBy({
      by: ['brand'],
      _count: { _all: true },
      where: { published: true, brand: { not: null } },
    }),
    // prisma.productVariant.aggregate({
    //   where: { stock: { lte: QUERY_DEFAULTS.LOW_STOCK_THRESHOLD } },
    //   _count: { _all: true },
    // }),
    prisma.product.aggregate({
      where: { stock: { lte: QUERY_DEFAULTS.LOW_STOCK_THRESHOLD } },
      _count: { _all: true },
    }),
  ]);

  // Get category names
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

  // const outOfStockCount = await prisma.productVariant.count({
  //   where: { stock: 0 },
  // });

  const outOfStockCount = await prisma.product.count({
    where: { stock: 0 },
  });

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
// const getLowStockProducts = async (threshold: number = QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) => {
//   const products = await prisma.product.findMany({
//     where: {
//       variants: {
//         some: {
//           stock: { lte: threshold },
//         },
//       },
//     },
//     include: {
//       variants: {
//         where: { stock: { lte: threshold } },
//       },
//       category: { select: { categoryName: true } },
//     },
//     orderBy: { name: 'asc' },
//   });

//   return products.map(product => ({
//     id: product.id,
//     name: product.name,
//     category: product.category.categoryName,
//     lowStockVariants: product.variants.map(v => ({
//       id: v.id,
//       sku: v.sku,
//       size: v.size,
//       unit: v.unit,
//       stock: v.stock,
//     })),
//   }));
// };

// Get Low Stock Products
const getLowStockProducts = async (threshold: number = QUERY_DEFAULTS.LOW_STOCK_THRESHOLD) => {
  const products = await prisma.product.findMany({
    where: {
      stock: { lte: threshold }, // check stock on product
    },
    include: {
      variants: true, // include variants for display
      category: { select: { categoryName: true } },
    },
    orderBy: { name: 'asc' },
  });

  return products.map(product => ({
    id: product.id,
    name: product.name,
    category: product.category.categoryName,
    stock: product.stock, // product-level stock
    variants: product.variants.map(v => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      unit: v.unit,
      price: v.price,
      // discount: v.discount,
    })),
  }));
};

// Get Bestsellers
const getBestsellers = async (): Promise<ITrendingProduct[]> => {
  const products = await prisma.product.findMany({
    where: { published: true },
    include: productInclude,
    orderBy: { salesCount: 'desc' },
    take: 20,
  });

  return products.map((product, index) => ({
    ...formatProductResponse(product),
    totalSold: product.salesCount,
    trendingScore: 100 - index, // Simple ranking score
  }));
};

// Helper Functions
const formatProductResponse = (product: any): IProductResponse => {
  const variants = product.variants || [];
  const prices = variants.map((v: any) => v.price);
  // const stocks = variants.map((v: any) => v.stock);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    primaryImage: product.primaryImage,
    otherImages: product.otherImages || [],
    videoUrl: product.videoUrl,
    tags: product.tags || [],
    salesCount: product.salesCount,
    published: product.published,

    // Perfume specifications
    origin: product.origin,
    brand: product.brand,
    gender: product.gender,
    perfumeNotes: product.perfumeNotes,
    accords: product.accords || [],
    performance: product.performance,
    longevity: product.longevity,
    projection: product.projection,
    sillage: product.sillage,
    bestFor: product.bestFor || [],

    categoryId: product.categoryId,
    category: product.category,

    // New: map material/fragrance IDs
    materialIds: product.ProductMaterial?.map((pm: any) => pm.material.id) || [],
    fragranceIds: product.ProductFragrance?.map((pf: any) => pf.fragrance.id) || [],

    supplier: product.supplier,

    variants: variants,

    // Computed fields
    minPrice: prices.length > 0 ? Math.min(...prices) : 0,
    maxPrice: prices.length > 0 ? Math.max(...prices) : 0,
    totalStock: product.stock,
    inStock: product.stock > 0,

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
  getProductsByCategory,
  getRelatedProducts,
  searchProducts,
  getProductVariants,
  // updateVariantStock,
  updateProductStock,
  getProductAnalytics,
  getLowStockProducts,
  getBestsellers,
};