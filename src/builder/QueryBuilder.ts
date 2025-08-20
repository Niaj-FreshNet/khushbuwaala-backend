type QueryParams = {
  searchTerm?: string;
  sort?: string;
  limit?: string;
  page?: string;
  fields?: string;
  [key: string]: unknown;
};

export class PrismaQueryBuilder<T> {
  private queryParams: QueryParams;
  private searchableFields: string[];
  private prismaQuery: any = {};

  constructor(query: QueryParams, searchableFields: string[] = []) {
    this.queryParams = query;
    this.searchableFields = searchableFields;
  }

  buildWhere() {
    const { searchTerm, sort, limit, page, fields, ...filters } =
      this.queryParams;

    let where: any = {};

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

    const sortFields = sortStr.split(',').map((field) => {
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
      this.prismaQuery.select = fields.reduce((acc: any, field: string) => {
        acc[field] = true;
        return acc;
      }, {});
    }
    return this;
  }

  getQuery() {
    return this.prismaQuery;
  }

  getPaginationMeta = async (
    model: any,
  ): Promise<{
    total: number;
    totalPage: number;
    page: number;
    limit: number;
  }> => {
    const total = await model.count({ where: this.prismaQuery.where });
    const page = Number(this.queryParams.page) || 1;
    const limit = Number(this.queryParams.limit) || 10;
    const totalPage = Math.ceil(total / limit);

    return { total, totalPage, page, limit };
  };
}
