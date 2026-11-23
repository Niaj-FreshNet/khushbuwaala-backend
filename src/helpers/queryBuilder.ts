import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";
import { IProductQuery } from "../modules/Product/product.interface";
import type { ProductRow } from "../types/records";

/**
 * Builds the product list queries (shop listing, admin listing, category pages).
 * Filters merge in the order they are added; a later filter on the same field replaces the earlier one.
 * (The unused generic methods and their debug logging were removed 2026-11-23.)
 */
class ProductQueryBuilder {
  private where: Prisma.ProductWhereInput = {};
  private orderBy: Prisma.ProductOrderByWithRelationInput[] = [];
  private skip = 0;
  private take = 10;
  private includeArgs: Prisma.ProductInclude = {};

  constructor(private query: Partial<IProductQuery> & Record<string, unknown>) {}

  rawFilter(filters: Prisma.ProductWhereInput) {
    this.where = { ...this.where, ...filters };
    return this;
  }

  /** Text search over the given fields (replaces an earlier OR) */
  search(searchableFields: string[]) {
    const searchTerm = this.query.searchTerm;
    if (typeof searchTerm === "string" && searchTerm) {
      this.where = {
        ...this.where,
        OR: searchableFields.map((field) => ({ [field]: { contains: searchTerm, mode: "insensitive" } }) as Prisma.ProductWhereInput),
      };
    }
    return this;
  }

  /** ?sort=name,-createdAt (a leading "-" means descending) */
  sort() {
    const sort = typeof this.query.sort === "string" && this.query.sort ? this.query.sort.split(",") : ["-createdAt"];
    this.orderBy = sort.map((field) =>
      (field.startsWith("-") ? { [field.slice(1)]: "desc" } : { [field]: "asc" }) as Prisma.ProductOrderByWithRelationInput,
    );
    return this;
  }

  paginate() {
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    this.skip = (page - 1) * limit;
    this.take = limit;
    return this;
  }

  include(includableFields: Prisma.ProductInclude) {
    this.includeArgs = { ...this.includeArgs, ...includableFields };
    return this;
  }

  /** The products with the included relations (shape described by ProductRow) */
  async execute(): Promise<ProductRow[]> {
    const rows = await prisma.product.findMany({
      where: this.where,
      orderBy: this.orderBy,
      skip: this.skip,
      take: this.take,
      include: this.includeArgs,
    });
    return rows as ProductRow[];
  }

  async countTotal() {
    const total = await prisma.product.count({ where: this.where });
    const page = Number(this.query.page) || 1;
    const limit = Number(this.query.limit) || 10;
    return { page, limit, total, totalPage: Math.ceil(total / limit) };
  }
}

export default ProductQueryBuilder;

const SORT_VALUES = ["name", "price_asc", "price_desc", "newest", "oldest", "popularity"] as const;
type SortBy = typeof SORT_VALUES[number];

const isSortBy = (v: unknown): v is SortBy => typeof v === "string" && (SORT_VALUES as readonly string[]).includes(v);

const toStringArray = (v: unknown): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v).split(",").map(s => s.trim()).filter(Boolean);
};

export const parseProductQuery = (query: Record<string, unknown>): IProductQuery => {
  const categoryValues = query.category ?? query.categories;

  const rawSortBy = query.sortBy;
  const sortBy: SortBy | undefined = isSortBy(rawSortBy) ? rawSortBy : undefined;

  const sort =
    sortBy === "newest" ? "-createdAt"
      : sortBy === "oldest" ? "createdAt"
        : sortBy === "name" ? "name"
          : sortBy === "popularity" ? "-salesCount"
            : "-createdAt";

  const rawGender = query.gender ? String(query.gender).toUpperCase() : undefined;
  const gender =
    rawGender === "MALE" || rawGender === "FEMALE" || rawGender === "UNISEX"
      ? (rawGender as IProductQuery["gender"])
      : undefined;

  return {
    category: toStringArray(categoryValues),
    gender,

    minPrice: query.minPrice != null ? Number(query.minPrice) : undefined,
    maxPrice: query.maxPrice != null ? Number(query.maxPrice) : undefined,

    accords: toStringArray(query.accords),
    bestFor: toStringArray(query.bestFor),
    tags: toStringArray(query.tags),
    performance: toStringArray(query.performance),
    perfumeNotes: toStringArray(query.perfumeNotes),
    projection: toStringArray(query.projection),

    sortBy,
    sort,

    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 20,

    searchTerm: query.searchTerm ? String(query.searchTerm) : "",
  };
};
