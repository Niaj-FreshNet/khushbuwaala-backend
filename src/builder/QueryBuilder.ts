type QueryParams = {
  searchTerm?: string;
  sort?: string;
  limit?: string;
  page?: string;
  fields?: string;
  [key: string]: unknown;
};

/** The parts of a Prisma findMany this builder fills in. `where` gets the remaining query params. */
export type BuiltQuery = {
  where: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>[];
  skip?: number;
  take?: number;
  select?: Record<string, unknown>;
};

export type PageMeta = { total: number; totalPage: number; page: number; limit: number };

export class PrismaQueryBuilder {
  private queryParams: QueryParams;
  private searchableFields: string[];
  private prismaQuery: BuiltQuery = { where: {} };

  constructor(query: QueryParams, searchableFields: string[] = []) {
    this.queryParams = query;
    this.searchableFields = searchableFields;
  }

  buildWhere() {
    const { searchTerm, sort, limit, page, fields, ...filters } =
      this.queryParams;

    let where: Record<string, unknown> = {};

    if (searchTerm && this.searchableFields.length > 0) {
      where.OR = this.searchableFields.map((field) => ({
        [field]: { contains: searchTerm, mode: 'insensitive' },
      }));
    }

    if (Object.keys(filters).length) {
      where = { ...where, ...filters };
    }

    this.prismaQuery.where = where;
    return this;
  }

  buildSort() {
    const sortStr = this.queryParams.sort || '-createdAt';

    const sortFields = sortStr.split(',').map((field): Record<string, 'asc' | 'desc'> => {
      const order = field.startsWith('-') ? 'desc' : 'asc';
      const key = field.replace(/^-/, '');
      return { [key]: order };
    });

    this.prismaQuery.orderBy = sortFields;
    return this;
  }

  buildPagination() {
    const page = Number(this.queryParams.page) || 1;
    const limit = Number(this.queryParams.limit) || 10;
    const skip = (page - 1) * limit;

    this.prismaQuery.skip = skip;
    this.prismaQuery.take = limit;
    return this;
  }

  buildSelect() {
    if (this.queryParams.fields) {
      const fields = this.queryParams.fields.split(',');
      this.prismaQuery.select = fields.reduce((acc: Record<string, unknown>, field: string) => {
        acc[field] = true;
        return acc;
      }, {});
    }
    return this;
  }

  getQuery() {
    return this.prismaQuery;
  }

  /**
   * Page numbers for a list. `count` counts every row the list matches; it gets the builder's own
   * `where`, and a service that adds its own filters counts with its final where instead
   * (it used to rely on mutating the builder's object, which silently miscounted if that changed).
   */
  getPaginationMeta = async (count: (where: Record<string, unknown>) => PromiseLike<number>): Promise<PageMeta> => {
    const total = await count(this.prismaQuery.where);
    const page = Number(this.queryParams.page) || 1;
    const limit = Number(this.queryParams.limit) || 10;
    const totalPage = Math.ceil(total / limit);

    return { total, totalPage, page, limit };
  };
}
