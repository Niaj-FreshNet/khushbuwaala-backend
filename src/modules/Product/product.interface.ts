import { CostCategory } from "@prisma/client";

export interface IProductVariant {
  sku: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
  isDefault?: boolean;
  published?: boolean;
  gtin?: string;
  mpn?: string;
  barcode?: string;
  compareAtPrice?: number;
  costPrice?: number;
  weightGrams?: number;
  attributes?: Record<string, string | number>;
  images?: string[];
}

// Product Creation Interface
export interface IProduct {
  name: string;
  description: string;
  slug: string;
  primaryImage: string;
  otherImages?: string[];
  videos?: string[];
  tags: string[];

  // SEO & Catalog Fields
  brand?: string;
  condition?: string;
  itemGroupId?: string;
  googleProductCategory?: string;
  gender?: string;
  metaTitle?: string;
  metaDescription?: string;

  origin?: string;
  perfumeNotes?: {
    top: string[];
    middle: string[];
    base: string[];
  };
  accords: string[];
  performance?: string;
  longevity?: string;
  projection?: string;
  sillage?: string;
  bestFor: string[];

  categoryId: string;
  published: boolean;

  materialIds: string[];
  fragranceIds: string[];

  reviews: IReview[];
  averageRating: number;
  reviewCount: number;

  supplier: string;
  stock: number;
  variants: IProductVariant[];
}

// Product Update Interface
export interface IUpdateProduct {
  name?: string;
  description?: string;
  primaryImage?: string;
  otherImages?: string[];
  videos?: string[];
  tags?: string[];

  brand?: string;
  condition?: string;
  itemGroupId?: string;
  googleProductCategory?: string;
  gender?: string;
  metaTitle?: string;
  metaDescription?: string;

  origin?: string;
  perfumeNotes?: {
    top: string[];
    middle: string[];
    base: string[];
  };
  accords?: string[];
  performance?: string;
  longevity?: string;
  projection?: string;
  sillage?: string;
  bestFor?: string[];

  categoryId?: string;
  published?: boolean;

  materialIds?: string[];
  fragranceIds?: string[];

  imagesToKeep?: string[];
  newImages?: string[];

  stock?: number;
  variants?: IProductVariant[];
}

// Query Interfaces
export type ProductSortBy =
  | "name"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "oldest"
  | "popularity";

export interface IProductQuery {
  searchTerm?: string;
  category?: string[];
  brand?: string;
  gender?: string;
  origin?: string;
  minPrice?: number;
  maxPrice?: number;
  accords?: string[];
  perfumeNotes?: string[];
  performance?: string[];
  projection?: string[];
  bestFor?: string[];
  tags?: string[];
  stock?: "in" | "out";
  sortBy?: ProductSortBy;
  sort?: string;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface IReview {
  id: string;
  rating: number;
  title: string;
  comment: string;
  isPublished: boolean;
  productId: string;
  userId?: string;
  user?: {
    name: string;
    imageUrl: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IDiscount {
  id: string;
  productId: string;
  code?: string;
  type: "percentage" | "fixed";
  value: number;
  maxUsage?: number;
  startDate?: string;
  endDate?: string;
  variantId?: string;
}

export interface IDiscountLight {
  type: "percentage" | "fixed";
  value: number;
}

export interface IProductVariantResponse {
  id: string;
  sku: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
  isDefault: boolean;
  published: boolean;
  compareAtPrice?: number;
  images: string[];
  productId: string;
  discounts?: IDiscount[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductVariantLight {
  id: string;
  sku: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
  isDefault: boolean;
  published: boolean;
  compareAtPrice?: number;
  images: string[];
}

// ============================================================
// SHARED BASE — common to listing, search, and detail responses
// ============================================================
interface IProductCore {
  id: string;
  name: string;
  slug: string;
  primaryImage: string;
  otherImages?: string[];
  videos?: string[];
  brand?: string;
  gender?: string;
  origin?: string;
  accords?: string[];
  bestFor?: string[];
  tags?: string[];
  published: boolean;
  salesCount: number;

  categoryId?: string;
  category?: {
    categoryName: string;
    imageUrl?: string;
  };

  minPrice: number;
  maxPrice: number;
  totalStock: number;
  inStock: boolean;

  averageRating: number;
  reviewCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface IProductListingResponse extends IProductCore {
  discount?: IDiscountLight;
  variants?: IProductVariantLight[];
}

export interface IProductAdminListingResponse extends IProductListingResponse {
  supplier: string;
  category?: {
    categoryName: string;
    imageUrl?: string;
  };
  variants: IProductVariantLight[];
}

export interface IProductSearchResponse {
  id: string;
  name: string;
  slug: string;
  primaryImage: string;
  accords: string[];
  categoryName?: string;
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  averageRating: number;
  reviewCount: number;
  discount?: IDiscountLight;
}

export interface IProductDetailResponse extends IProductCore {
  description: string;
  videoUrl?: string;
  otherImages: string[];
  brand?: string;
  condition?: string;
  itemGroupId?: string;
  googleProductCategory?: string;
  gender?: string;
  metaTitle?: string;
  metaDescription?: string;

  perfumeNotes?: {
    top: string[];
    middle: string[];
    base: string[];
  };
  performance?: string;
  longevity?: string;
  projection?: string;
  sillage?: string;

  materialIds: string[];
  fragranceIds: string[];
  materials: { id: string; name: string }[];
  fragrances: { id: string; name: string }[];

  supplier: string;

  discounts: IDiscount[];
  variants: IProductVariantResponse[];

  reviews: IReview[];

  relatedProducts?: {
    sameBrand: IProductListingResponse[];
    sameCategory: IProductListingResponse[];
    similarAccords: IProductListingResponse[];
  };
}

export type IProductResponse = IProductDetailResponse;

export interface IProductAnalytics {
  totalProducts: number;
  publishedProducts: number;
  unpublishedProducts: number;
  totalVariants: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalValue: number;
  averagePrice: number;
  topCategories: Array<{
    categoryName: string;
    productCount: number;
    percentage: number;
  }>;
  topBrands: Array<{
    brand: string;
    productCount: number;
    percentage: number;
  }>;
}

export interface IStockUpdate {
  productId: string;
  variantId: string;
  newStock: number;
  reason?: string;
}

export interface IProductSearchResult {
  data: IProductSearchResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ITrendingProduct extends IProductListingResponse {
  totalSold: number;
  trendingScore: number;
}

export interface IRelatedProductsResponse {
  sameBrand: IProductListingResponse[];
  sameCategory: IProductListingResponse[];
  similarAccords: IProductListingResponse[];
  recentlyViewed?: IProductListingResponse[];
}

export interface ICostLineInput {
  category: CostCategory;
  label?: string;
  amount: number;
}

export interface IVariantPackagingCostInput {
  sku: string;
  costLines: ICostLineInput[];
}

export interface IStockPurchaseInput {
  productId: string;
  quantity: number; // e.g., 5000 (ml)
  unit?: string;
  supplier?: string;
  billNo?: string;
  note?: string;
  costLines: ICostLineInput[];
  createdById?: string; // Admin ID
}