// Base Product Variant Interface (aligned with schema)
export interface IProductVariant {
  sku: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
}

// Product Creation Interface
export interface IProduct {
  name: string;
  description: string;
  slug: string;
  primaryImage: string;
  otherImages?: string[];
  videoUrl?: string;
  tags: string[];

  origin?: string;
  brand?: string;
  gender?: string;
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
  videoUrl?: string;
  tags?: string[];

  origin?: string;
  brand?: string;
  gender?: string;
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

  materialIds: string[];
  fragranceIds: string[];

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

// Lightweight discount for cards/listing badges
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
  productId: string;
  discounts?: IDiscount[];
  createdAt: Date;
  updatedAt: Date;
}

// Lightweight variant for listing/search cards
export interface IProductVariantLight {
  id: string;
  sku: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
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
    imageUrl: string;
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

// ============================================================
// 1) LISTING — getAllProducts, getAllProductsAdmin, category pages,
//    new arrivals, trending, bestsellers, featured
// ============================================================
export interface IProductListingResponse extends IProductCore {
  discount?: IDiscountLight;
  variants?: IProductVariantLight[];
}

// ============================================================
// 2) SEARCH — searchProducts
// ============================================================
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

// ============================================================
// 3) DETAIL — getProduct / getProductBySlug (single product page)
// ============================================================
export interface IProductDetailResponse extends IProductCore {
  description: string;
  videoUrl?: string;
  otherImages: string[];

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

// Kept as an alias so anything still importing the old name doesn't break.
// New code should use IProductDetailResponse directly.
export type IProductResponse = IProductDetailResponse;

// Analytics Interfaces
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

// Stock Update Interface
export interface IStockUpdate {
  productId: string;
  variantId: string;
  newStock: number;
  reason?: string;
}

// Search Result Interface
export interface IProductSearchResult {
  data: IProductSearchResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Trending Product Interface — now built on the light listing shape
export interface ITrendingProduct extends IProductListingResponse {
  totalSold: number;
  trendingScore: number;
}

// Related Products Interface — light listing cards, not full detail
export interface IRelatedProductsResponse {
  sameBrand: IProductListingResponse[];
  sameCategory: IProductListingResponse[];
  similarAccords: IProductListingResponse[];
  recentlyViewed?: IProductListingResponse[];
}