import { Prisma } from '@prisma/client';
import { NestedFilter, rangeFilteringPrams } from '../../helpers/queryBuilder';

// Fields for basic filtering
export const productFilterFields = [];

// Fields for top-level search
export const productSearchFields = ['name', 'description'];

// Nested filtering config
export const productNestedFilters: NestedFilter[] = [
  { key: "user", searchOption: "search", queryFields: ["name"] },
  { key: 'category', searchOption: 'exact', queryFields: ['categoryName'] },
];

// Range-based filtering config
export const productRangeFilter: rangeFilteringPrams[] = [
  {
    field: 'price',
    nestedField: 'variants',
    maxQueryKey: 'maxPrice',
    minQueryKey: 'minPrice',
    dataType: 'number',
  },
];

// Prisma include configuration
export const productInclude: Prisma.ProductInclude = {
  category: { select: { categoryName: true, imageUrl: true } },
  material: { select: { materialName: true } },
  variants: {
    select: {
      id: true,
      size: true,
      color: true,
      price: true,
      quantity: true,
    },
  },
};
