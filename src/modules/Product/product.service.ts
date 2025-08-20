import { subDays, subMonths } from 'date-fns';
import { PrismaQueryBuilder } from '../../builder/QueryBuilder';
import AppError from '../../errors/AppError';
import { prisma } from '../../../prisma/client';
import { deleteFromDigitalOceanAWS } from '../../utils/sendImageToCloudinary';
import QueryBuilder from '../../helpers/queryBuilder';
import {
  productFilterFields,
  productInclude,
  productNestedFilters,
  productRangeFilter,
  productSearchFields,
} from './product.constant';
import { deleteFile } from '../../helpers/fileDelete';

const createProduct = async (payload: IProduct) => {
  const result = await prisma.product.create({
    data: {
      name: payload.name,
      description: payload.description,
      imageUrl: payload.imageUrl,
      tags: payload.tags,
      materialId: payload.materialId,
      categoryId: payload.categoryId,
      published: payload.published,
      variants: {
        create: payload.variants.map((v) => ({
          size: v.size,
          color: v.color,
          price: v.price,
          quantity: v.quantity,
        })),
      },
    },
    include: {
      variants: true,
    },
  });

  return result;
};

const getAllProducts = async (req: any) => {
  const sortBy = req.query.sortBy as string;
  const stockFilter = req.query.stock; // 'in' | 'out'

  const queryBuilder = new QueryBuilder(req.query, prisma.product);
  let results = await queryBuilder
    .filter(productFilterFields)
    .search(productSearchFields)
    .nestedFilter(productNestedFilters)
    .sort() // Default Prisma sort
    .paginate()
    .include(productInclude)
    .fields()
    .filterByRange(productRangeFilter)
    .rawFilter({ published: true })
    .execute();

  const meta = await queryBuilder.countTotal();

  // 🔁 Apply stock filter after query
  if (stockFilter === 'in') {
    results = results.filter((product: any) =>
      product.variants.some((v: any) => v.quantity > 0),
    );
  } else if (stockFilter === 'out') {
    results = results.filter((product: any) =>
      product.variants.every((v: any) => v.quantity === 0),
    );
  }

  // 🔁 Apply price-based sorting after stock filtering
  if (sortBy === 'price_asc') {
    results = results.sort((a: any, b: any) => {
      const minA = Math.min(...a.variants.map((v: any) => v.price));
      const minB = Math.min(...b.variants.map((v: any) => v.price));
      return minA - minB;
    });
  } else if (sortBy === 'price_desc') {
    results = results.sort((a: any, b: any) => {
      const minA = Math.min(...a.variants.map((v: any) => v.price));
      const minB = Math.min(...b.variants.map((v: any) => v.price));
      return minB - minA;
    });
  }

  return { data: results, meta };
};

const getAllProductsAdmin = async (req: any) => {
  const sortBy = req.query.sortBy as string;
  const stockFilter = req.query.stock; // 'in' | 'out'

  const queryBuilder = new QueryBuilder(req.query, prisma.product);
  let results = await queryBuilder
    .filter(productFilterFields)
    .search(productSearchFields)
    .nestedFilter(productNestedFilters)
    .sort() // Default Prisma sort
    .paginate()
    .include(productInclude)
    .fields()
    .filterByRange(productRangeFilter)
    .execute();

  const meta = await queryBuilder.countTotal();

  // 🔁 Apply stock filter after query
  if (stockFilter === 'in') {
    results = results.filter((product: any) =>
      product.variants.some((v: any) => v.quantity > 0),
    );
  } else if (stockFilter === 'out') {
    results = results.filter((product: any) =>
      product.variants.every((v: any) => v.quantity === 0),
    );
  }

  // 🔁 Apply price-based sorting after stock filtering
  if (sortBy === 'price_asc') {
    results = results.sort((a: any, b: any) => {
      const minA = Math.min(...a.variants.map((v: any) => v.price));
      const minB = Math.min(...b.variants.map((v: any) => v.price));
      return minA - minB;
    });
  } else if (sortBy === 'price_desc') {
    results = results.sort((a: any, b: any) => {
      const minA = Math.min(...a.variants.map((v: any) => v.price));
      const minB = Math.min(...b.variants.map((v: any) => v.price));
      return minB - minA;
    });
  }

  return { data: results, meta };
};

// Get Product By ID
const getProduct = async (id: string) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      material: true,
      variants: true,
    },
  });

  if (!product) return null;

  // Get other products from the same category
  const relatedProducts = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: id },
      published: true,
    },
    include: {
      category: true,
      material: true,
      variants: true,
    },
    take: 6,
    orderBy: { createdAt: 'desc' },
  });

  // Get good reviews (rating >= 4)
  const goodReviews = await prisma.review.findMany({
    where: {
      productId: id,
      isPublished: true,
      rating: { gte: 4 },
    },
    include: {
      user: {
        select: {
          name: true,
          imageUrl: true,
        },
      },
    },
    take: 6,
    orderBy: { createdAt: 'desc' },
  });

  return {
    ...product,
    relatedProducts,
    goodReviews,
  };
};

interface ProductVariantPayload {
  size: string;
  color: string;
  price: number;
  quantity: number;
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  tags?: string[];
  materialId?: string;
  categoryId?: string;
  published?: boolean;
  imageUrlsToKeep?: string[];
  newImageUrls?: string[];
  variants?: ProductVariantPayload[];
}

// Update Product
export const updateProduct = async (
  id: string,
  payload: UpdateProductPayload,
) => {
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: { variants: true },
  });

  if (!existingProduct) throw new AppError(404, 'Product not found!');

  // 🖼 Handle image updates
  let finalImageUrls = existingProduct.imageUrl || [];

  const hasImageUpdate =
    (payload.imageUrlsToKeep?.length || 0) > 0 ||
    (payload.newImageUrls?.length || 0) > 0;

  if (hasImageUpdate) {
    finalImageUrls = [
      ...(payload.imageUrlsToKeep || []),
      ...(payload.newImageUrls || []),
    ];

    const imagesToDelete = existingProduct.imageUrl.filter(
      (url) => !finalImageUrls.includes(url),
    );

    await Promise.all(imagesToDelete.map(deleteFile));
  }

  // 🛠 Build product update payload
  const updateProductData: any = {
    ...(payload.name && { name: payload.name }),
    ...(payload.description && { description: payload.description }),
    ...(payload.tags && { tags: payload.tags }),
    ...(payload.materialId && { materialId: payload.materialId }),
    ...(payload.categoryId && { categoryId: payload.categoryId }),
    ...(typeof payload.published === 'boolean' && {
      published: payload.published,
    }),
    ...(hasImageUpdate &&
      finalImageUrls.length > 0 && {
        imageUrl: finalImageUrls,
      }),
  };

  // Update product
  const updatedProduct = await prisma.product.update({
    where: { id },
    data: updateProductData,
    include: { variants: true, category: true, material: true },
  });

  // Replace all variants
  if (Array.isArray(payload.variants)) {
    await prisma.productVariant.deleteMany({ where: { productId: id } });

    const newVariants = payload.variants.map((variant) => ({
      size: variant.size,
      color: variant.color,
      price: parseFloat(String(variant.price)),
      quantity: parseInt(String(variant.quantity)),
      productId: id,
    }));

    await prisma.productVariant.createMany({ data: newVariants });
  }

  return updatedProduct;
};

// Delete Product
const deleteProduct = async (id: string) => {
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: { variants: true, Review: true }, // include reviews too
  });

  if (!existingProduct) throw new AppError(404, 'Product not found!');

  // Delete product images from storage
  if (existingProduct.imageUrl && existingProduct.imageUrl.length > 0) {
    await Promise.all(existingProduct.imageUrl.map((url) => deleteFile(url)));
  }

  // Delete all variants
  if (existingProduct.variants.length > 0) {
    await prisma.productVariant.deleteMany({
      where: { productId: id },
    });
  }

  // Delete all reviews
  if (existingProduct.Review.length > 0) {
    await prisma.review.deleteMany({
      where: { productId: id },
    });
  }

  // Now safe to delete the product itself
  const result = await prisma.product.delete({ where: { id } });

  return result;
};

// Get Trending Products
const getTrendingProducts = async () => {
  const threeMonthsAgo = subMonths(new Date(), 3);

  // Step 1: Fetch orders in the last 3 months
  const recentOrders = await prisma.order.findMany({
    where: {
      orderTime: {
        gte: threeMonthsAgo,
      },
      isPaid: true,
    },
    select: {
      cartItems: true,
    },
  });

  // Step 2: Aggregate product sales count
  const productSales: Record<string, number> = {};

  for (const order of recentOrders) {
    const cart = order.cartItems as Array<{
      productId: string;
      quantity: number;
    }>;
    for (const item of cart) {
      if (item?.productId) {
        productSales[item.productId] =
          (productSales[item.productId] || 0) + item.quantity;
      }
    }
  }

  // Step 3: Sort productIds by quantity sold
  const sortedProductIds = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1]) // descending order
    .map(([productId]) => productId);

  // Optional: limit top N trending products
  const topProductIds = sortedProductIds.slice(0, 10);

  // Step 4: Get full product details
  const trendingProducts = await prisma.product.findMany({
    where: {
      id: { in: topProductIds },
    },
    include: {
      category: true,
      material: true,
      variants: true,
    },
  });

  // Optional: Return with sales count info
  const trendingWithSales = trendingProducts.map((product) => ({
    ...product,
    totalSold: productSales[product.id] || 0,
  }));

  return trendingWithSales;
};

const getNavbarProducts = async () => {
  const threeMonthsAgo = subMonths(new Date(), 3);

  // Step 1: Fetch paid orders in last 3 months
  const recentOrders = await prisma.order.findMany({
    where: {
      orderTime: { gte: threeMonthsAgo },
      isPaid: true,
    },
    select: {
      cartItems: true,
    },
  });

  // Step 2: Build product sales map
  const productSales: Record<string, number> = {};

  for (const order of recentOrders) {
    const cart = order.cartItems as Array<{
      productId: string;
      quantity: number;
    }>;
    for (const item of cart) {
      if (item?.productId) {
        productSales[item.productId] =
          (productSales[item.productId] || 0) + item.quantity;
      }
    }
  }

  const allProductIds = Object.keys(productSales);

  // Step 3: Fetch product info with category
  const products = await prisma.product.findMany({
    where: {
      id: { in: allProductIds },
      published: true,
    },
    include: {
      category: true,
    },
  });

  // Use proper object array in categoryWise
  const categoryWise: Record<
    string,
    { id: string; name: string; sold: number }[]
  > = {};
  const overallList: Array<{ id: string; name: string; totalSold: number }> =
    [];

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

  // Step 4: Fetch all published categories
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

  // Step 5: Build overall top products list
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

export const ProductServices = {
  createProduct,
  getAllProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getAllProductsAdmin,
  getTrendingProducts,
  getNavbarProducts,
};
