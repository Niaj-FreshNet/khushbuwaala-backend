// Keeps the discovery records in memory and answers shop / search requests from them.
//
// Why in memory: filters need whole-word, case-insensitive matching over hand-typed lists, typo
// tolerance and live counts per option. MongoDB cannot do that in one query; a list of a few
// hundred (or a few thousand) small records can, in about a millisecond.
import { prisma } from '../../../prisma/client';
import type { ProductRow } from '../../types/records';
import { LEAN_PRODUCT_INCLUDE } from '../Product/product.constant';
import { formatProductListingResponse } from '../Product/product.service';
import { DiscoveryDoc, toDiscoveryDoc } from './normalize';
import { DiscoveryQuery, runDiscovery, similarDocs, suggestFilters } from './engine';
import { FAMILIES, LONGEVITY, PROJECTION } from './taxonomy';

type Index = { docs: DiscoveryDoc[]; rows: Map<string, ProductRow>; builtAt: number };

// Prices, stock and sales in listings may be this old. Checkout always reads the database.
const MAX_AGE_MS = 60_000;

let index: Index | null = null;
let building: Promise<Index> | null = null;

const build = async (): Promise<Index> => {
  const rows: ProductRow[] = await prisma.product.findMany({
    where: { published: true },
    include: {
      ...LEAN_PRODUCT_INCLUDE,
      ProductFragrance: { include: { fragrance: true } },
    },
  });
  const now = Date.now();
  return { docs: rows.map((r) => toDiscoveryDoc(r, now)), rows: new Map(rows.map((r) => [r.id, r])), builtAt: now };
};

const refresh = (): Promise<Index> => {
  if (!building) {
    building = build()
      .then((next) => {
        index = next;
        return next;
      })
      .finally(() => {
        building = null;
      });
  }
  return building;
};

const getIndex = async (): Promise<Index> => {
  if (!index) return refresh();
  if (Date.now() - index.builtAt > MAX_AGE_MS) {
    // serve what we have and rebuild behind the request; if the rebuild fails the old list stays
    refresh().catch((err) => console.error('[discovery] rebuild failed:', err));
  }
  return index;
};

/** Call after a product, its sizes or its discounts change so the shop shows it within a request. */
const invalidate = (): void => {
  if (index) index.builtAt = 0;
};

const label = (id: string | null, table: { id: string; label: string }[]): string | null =>
  table.find((t) => t.id === id)?.label ?? null;

const toItem = (idx: Index, doc: DiscoveryDoc) => {
  const row = idx.rows.get(doc.id);
  if (!row) return null;
  return {
    ...formatProductListingResponse(row),
    brand: doc.brand,
    gender: doc.genderCode,
    category: doc.category,
    // short facts for the product card
    families: doc.mainFamilies.map((id) => label(id, FAMILIES)).filter((l): l is string => l !== null),
    longevity: label(doc.longevity, LONGEVITY),
    projection: label(doc.projection, PROJECTION),
  };
};

const toItems = (idx: Index, docs: DiscoveryDoc[]) =>
  docs.map((d) => toItem(idx, d)).filter((i): i is NonNullable<typeof i> => i !== null);

const discover = async (query: DiscoveryQuery) => {
  const idx = await getIndex();
  const result = runDiscovery(idx.docs, query);
  return { data: toItems(idx, result.docs), meta: result.meta, facets: result.facets };
};

const suggest = async (q: string | undefined) => {
  const idx = await getIndex();
  const result = runDiscovery(idx.docs, { q, limit: 6, page: 1 });
  return {
    products: toItems(idx, result.docs).map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      primaryImage: p.primaryImage,
      minPrice: p.minPrice,
      discount: p.discount,
      category: p.category,
      families: p.families,
      inStock: p.inStock,
    })),
    filters: suggestFilters(idx.docs, q),
    total: result.meta.total,
    relaxed: result.meta.relaxed,
  };
};

const similar = async (slug: string, limit: number) => {
  const idx = await getIndex();
  const target = idx.docs.find((d) => d.slug === slug);
  if (!target) return null;
  return toItems(idx, similarDocs(idx.docs, target, limit));
};

/** Every published product address, for the sitemap. */
const sitemap = async () => {
  const idx = await getIndex();
  const categories = new Map<string, string>();
  for (const d of idx.docs) if (d.category) categories.set(d.category.id, d.category.label);
  return {
    products: idx.docs.map((d) => ({ slug: d.slug, updatedAt: idx.rows.get(d.id)?.updatedAt ?? null })),
    categories: Array.from(categories, ([id, name]) => ({ id, label: name })),
  };
};

export const DiscoveryServices = { discover, suggest, similar, sitemap, invalidate };
