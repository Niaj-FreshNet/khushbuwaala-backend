import { Prisma } from '@prisma/client';

// Searchable fields
export const productSearchFields: string[] = [
  'name',
  'description',
  'brand',
  'origin'
];

// Detailed include for single product view
export const productDetailInclude: Prisma.ProductInclude = {
  category: true,
  ProductMaterial: { include: { material: true } },
  ProductFragrance: { include: { fragrance: true } },
  Review: {
    where: { isPublished: true },
    include: {
      user: { select: { id: true, name: true, imageUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  discounts: true, // product-level
  // Public detail: only sizes that are on sale. Staff use productDetailIncludeStaff.
  variants: {
    where: { published: true },
    include: {
      discounts: true, // variant-level
    },
  },
};

// Same as productDetailInclude but with every variant (admin product editor).
export const productDetailIncludeStaff: Prisma.ProductInclude = {
  ...productDetailInclude,
  variants: {
    include: {
      discounts: true,
    },
  },
};

// Admin include for management
export const productAdminInclude: Prisma.ProductInclude = {
  category: true,
  Review: true,
  // stock: true,
  discounts: true, // product-level
  variants: {
    include: {
      discounts: true, // variant-level
    },
  },
  // wishlist: true,
  comboVariants: true
};

// Perfume-specific constants
export const PERFUME_GENDERS = [
  'UNISEX',
  'MALE',
  'FEMALE'
] as const;

export const PERFORMANCE_LEVELS = [
  'POOR',
  'WEAK',
  'MODERATE',
  'GOOD',
  'EXCELLENT',
  'BEAST_MODE'
] as const;

export const LONGEVITY_LEVELS = [
  'VERY_WEAK',
  'WEAK',
  'MODERATE',
  'LONG_LASTING',
  'ETERNAL'
] as const;

export const PROJECTION_LEVELS = [
  'INTIMATE',
  'CLOSE',
  'MODERATE',
  'STRONG',
  'NUCLEAR'
] as const;

export const SILLAGE_LEVELS = [
  'SOFT',
  'MODERATE',
  'HEAVY',
  'ENORMOUS'
] as const;

export const LEAN_PRODUCT_INCLUDE = {
  category: { select: { categoryName: true } },
  variants: {
    where: { published: true },
    select: {
      id: true,
      sku: true,
      unit: true,
      size: true,
      price: true,
      stock: true,
      isDefault: true,
      published: true,
      compareAtPrice: true,
      images: true
    }
  },
  Review: { select: { rating: true } },
  discounts: {
    select: { type: true, value: true, code: true, startDate: true, endDate: true },
  },
};

// Validation constants
export const PRODUCT_VALIDATION = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 500,
  DESCRIPTION_MIN_LENGTH: 5,
  DESCRIPTION_MAX_LENGTH: 3000,
  MAX_TAGS: 50,
  MAX_ACCORDS: 10,
  MAX_BEST_FOR: 10,
  MAX_IMAGES: 10,
  MIN_PRICE: 0,
  MAX_PRICE: 999999,
  MIN_STOCK: 0,
  MAX_STOCK: 999999,
  MAX_SIZE: 100000,
  MIN_SIZE: 0
} as const;

// Query defaults
export const QUERY_DEFAULTS = {
  PAGE: 1,
  LIMIT: 12,
  MAX_LIMIT: 100,
  TRENDING_LIMIT: 10,
  RELATED_LIMIT: 6,
  NEW_ARRIVALS_DAYS: 30,
  LOW_STOCK_THRESHOLD: 10
} as const;

// Error messages
export const PRODUCT_ERROR_MESSAGES = {
  NOT_FOUND: 'Product not found',
  PRODUCT_NOT_FOUND: 'Product not found',
  VARIANT_NOT_FOUND: 'Product variant not found',
  INSUFFICIENT_STOCK: 'Insufficient stock available',
  INVALID_VARIANT_DATA: 'Invalid variant data provided',
  INVALID_PERFUME_NOTES: 'Invalid perfume notes structure',
  DUPLICATE_SKU: 'SKU already exists',
  CATEGORY_REQUIRED: 'Category is required',
  MATERIAL_REQUIRED: 'Material is required',
  VARIANTS_REQUIRED: 'At least one variant is required',
  IMAGE_REQUIRED: 'At least one product image is required',
  INVALID_PRICE_RANGE: 'Invalid price range',
  INVALID_STOCK_VALUE: 'Invalid stock value',
  PRODUCT_PUBLISHED_CANNOT_DELETE: 'Cannot delete published product with active orders'
} as const;
