
// Base Product Variant Interface (aligned with schema)
export interface IProductVariant {
  sku: string;
  unit: string;
  size: number; // Changed from string to number as per schema
  price: number;
  stock: number; // Changed from quantity to stock as per schema
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

  // Perfume specifications
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

  // Perfume specifications
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

  // Image handling
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

  // category names coming from query string (comma separated)
  category?: string[];     // ✅ was categories / object array (not right for query parsing)

  brand?: string;
  gender?: string; // normalize in parser
  origin?: string;

  minPrice?: number;
  maxPrice?: number;

  accords?: string[];      // ✅ was string
  perfumeNotes?: string[]; // ✅ add
  performance?: string[];  // ✅ add (or string if DB uses scalar)

  bestFor?: string[];       // Product.bestFor (String[])
  tags?: string[];          // Product.tags (String[])

  stock?: "in" | "out";

  sortBy?: ProductSortBy;  // ✅ keep literal union
  sort?: string;           // ✅ used by QueryBuilder.sort(), like "-createdAt"

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

// Response Interfaces
export interface IProductResponse {
  id: string;
  name: string;
  slug: string;
  description: string;
  primaryImage: string;
  otherImages: string[];
  videoUrl?: string;
  tags: string[];
  salesCount: number;
  published: boolean;

  // Perfume specifications
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
  category?: {
    categoryName: string;
    imageUrl: string;
  };

  materialIds: string[];
  fragranceIds: string[];

  reviews: IReview[];
  averageRating: number;
  reviewCount: number;

  supplier: string;

  variants: IProductVariantResponse[];

  // Computed fields
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  inStock: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export interface IProductVariantResponse {
  id: string;
  sku: string;
  unit: string;
  size: number;
  price: number;
  stock: number;
  productId: string;
  createdAt: Date;
  updatedAt: Date;
}

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
  data: IProductResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  filters: {
    brands: string[];
    categories: { id: string; name: string }[];
    priceRange: {
      min: number;
      max: number;
    };
    origins: string[];
    accords: string[];
  };
}

// Trending Product Interface
export interface ITrendingProduct extends IProductResponse {
  totalSold: number;
  trendingScore: number;
}

// Related Products Interface
export interface IRelatedProductsResponse {
  sameBrand: IProductResponse[];
  sameCategory: IProductResponse[];
  similarAccords: IProductResponse[];
  recentlyViewed?: IProductResponse[];
}

// export default {
//   IProduct,
//   IUpdateProduct,
//   IProductQuery,
//   IProductResponse,
//   IProductVariantResponse,
//   IProductAnalytics,
//   IStockUpdate,
//   IProductSearchResult,
//   ITrendingProduct,
//   IRelatedProductsResponse,
//   IProductVariant
// };