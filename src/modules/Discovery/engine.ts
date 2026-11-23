// Search, filter, facet counts, sorting and suggestions over the discovery records.
// Pure functions over an in-memory list (the catalogue is small; a few thousand products is still
// well under a millisecond per filter and a few milliseconds per typed search).
import {
  FAMILIES,
  GENDERS,
  GENERIC_WORDS,
  LONGEVITY,
  NOTES,
  OCCASIONS,
  PROJECTION,
  SEARCH_SYNONYMS,
  SEASONS,
  TIMES,
} from './taxonomy';
import { DiscoveryDoc, tokenize } from './normalize';

export const SORTS = ['relevance', 'popular', 'newest', 'price_asc', 'price_desc', 'name'] as const;
export type DiscoverySort = (typeof SORTS)[number];

export type DiscoveryQuery = {
  q?: string;
  category?: string[];
  families?: string[];
  notes?: string[];
  longevity?: string[];
  projection?: string[];
  occasions?: string[];
  times?: string[];
  seasons?: string[];
  gender?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  sort?: DiscoverySort;
  page?: number;
  limit?: number;
};

const list = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return Array.from(new Set(raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean)));
};

const known = (values: string[], table: { id: string }[]): string[] => values.filter((v) => table.some((t) => t.id === v));

const num = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const flag = (value: unknown): boolean => value === true || value === 'true' || value === '1';

/** Read a query string object. Unknown values are dropped, never passed on. */
export const parseDiscoveryQuery = (raw: Record<string, unknown>): DiscoveryQuery => {
  const sort = String(raw.sort ?? '').toLowerCase() as DiscoverySort;
  const page = Math.floor(num(raw.page) ?? 1);
  const limit = Math.floor(num(raw.limit) ?? 24);
  return {
    q: typeof raw.q === 'string' ? raw.q.trim().slice(0, 80) : undefined,
    category: list(raw.category),
    families: known(list(raw.families), FAMILIES),
    notes: known(list(raw.notes), NOTES),
    longevity: known(list(raw.longevity), LONGEVITY),
    projection: known(list(raw.projection), PROJECTION),
    occasions: known(list(raw.occasions), OCCASIONS),
    times: known(list(raw.times), TIMES),
    seasons: known(list(raw.seasons), SEASONS),
    gender: known(list(raw.gender), GENDERS),
    minPrice: num(raw.minPrice),
    maxPrice: num(raw.maxPrice),
    inStock: flag(raw.inStock),
    onSale: flag(raw.onSale),
    sort: SORTS.includes(sort) ? sort : undefined,
    page: Math.max(1, page),
    limit: Math.min(100, Math.max(1, limit)),
  };
};

// ---------------------------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------------------------

/** Edit distance with a cut-off (returns max + 1 as soon as the words are further apart). */
export const editDistance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let beforePrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // swapped neighbours ("uod" for "oud") count as one mistake
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, beforePrev[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    beforePrev = prev;
    prev = cur;
  }
  return Math.min(prev[b.length], max + 1);
};

const allowedTypos = (word: string): number => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

type SearchTerm = { words: string[]; required: boolean };

/** Typed text → the words to look for. Synonyms and Bangla are mapped; filler words are optional. */
export const toSearchTerms = (q: string | undefined): SearchTerm[] => {
  const terms: SearchTerm[] = [];
  for (const token of tokenize(q)) {
    const mapped = SEARCH_SYNONYMS[token];
    if (mapped && mapped.length === 0) continue; // a word that only expresses intent ("cheap")
    const words = mapped ? mapped.flatMap(tokenize) : [token];
    for (const word of words) {
      terms.push({ words: Array.from(new Set([word, token])), required: !GENERIC_WORDS.has(word) });
    }
  }
  return terms;
};

const FIELD_WEIGHTS: { field: 'nameWords' | 'scentWords' | 'catalogWords' | 'traitWords' | 'tagWords'; weight: number; fuzzy: boolean }[] = [
  { field: 'nameWords', weight: 10, fuzzy: true },
  { field: 'scentWords', weight: 6, fuzzy: true },
  { field: 'catalogWords', weight: 4, fuzzy: true },
  { field: 'traitWords', weight: 3, fuzzy: false },
  { field: 'tagWords', weight: 3, fuzzy: false },
];

const scoreWord = (doc: DiscoveryDoc, word: string): number => {
  let best = 0;
  const typos = allowedTypos(word);
  for (const { field, weight, fuzzy } of FIELD_WEIGHTS) {
    if (weight <= best) continue;
    const words = doc[field];
    if (words.includes(word)) { best = weight; continue; }
    if (word.length >= 3 && weight * 0.7 > best && words.some((w) => w.startsWith(word))) { best = weight * 0.7; continue; }
    if (fuzzy && typos > 0 && weight * 0.5 > best && words.some((w) => w.length >= 4 && editDistance(word, w, typos) <= typos)) {
      best = weight * 0.5;
    }
  }
  if (best === 0 && word.length >= 3 && doc.description.includes(word)) best = 1;
  return best;
};

const scoreTerm = (doc: DiscoveryDoc, term: SearchTerm): number => Math.max(...term.words.map((w) => scoreWord(doc, w)));

/** Relevance of a product for typed text. 0 = no match. `strict` requires every real word to match. */
export const scoreDoc = (doc: DiscoveryDoc, terms: SearchTerm[], phrase: string, strict: boolean): number => {
  let total = 0;
  let requiredHits = 0;
  let requiredCount = 0;
  for (const term of terms) {
    // filler words ("perfume", "for") never decide the order
    if (!term.required) continue;
    const s = scoreTerm(doc, term);
    requiredCount++;
    if (s > 0) requiredHits++;
    else if (strict) return 0;
    total += s;
  }
  if (requiredCount === 0 || requiredHits === 0) return 0;
  const name = doc.name.toLowerCase();
  if (phrase && name === phrase) total += 30;
  else if (phrase && name.startsWith(phrase)) total += 15;
  else if (phrase.length >= 3 && name.includes(phrase)) total += 8;
  return total;
};

// ---------------------------------------------------------------------------------------------
// Filters and facets
// ---------------------------------------------------------------------------------------------

type GroupKey = 'category' | 'families' | 'notes' | 'longevity' | 'projection' | 'occasions' | 'times' | 'seasons' | 'gender';

// "all": the product must have every selected value (Woody AND Sweet). "any": one is enough.
const GROUPS: { key: GroupKey; mode: 'all' | 'any'; values: (d: DiscoveryDoc) => string[] }[] = [
  { key: 'category', mode: 'any', values: (d) => (d.category ? [d.category.id] : []) },
  { key: 'families', mode: 'all', values: (d) => d.families },
  { key: 'notes', mode: 'all', values: (d) => d.notes },
  { key: 'longevity', mode: 'any', values: (d) => (d.longevity ? [d.longevity] : []) },
  { key: 'projection', mode: 'any', values: (d) => (d.projection ? [d.projection] : []) },
  { key: 'occasions', mode: 'any', values: (d) => d.occasions },
  { key: 'times', mode: 'any', values: (d) => d.times },
  { key: 'seasons', mode: 'any', values: (d) => d.seasons },
  { key: 'gender', mode: 'any', values: (d) => d.genders },
];

const passesGroup = (doc: DiscoveryDoc, group: (typeof GROUPS)[number], selected: string[]): boolean => {
  if (!selected.length) return true;
  const have = group.values(doc);
  return group.mode === 'all' ? selected.every((s) => have.includes(s)) : selected.some((s) => have.includes(s));
};

const passesBasics = (doc: DiscoveryDoc, query: DiscoveryQuery): boolean => {
  if (query.inStock && !doc.inStock) return false;
  if (query.onSale && !doc.onSale) return false;
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const min = query.minPrice ?? 0;
    const max = query.maxPrice ?? Infinity;
    // a product fits a budget when at least one of its sizes does
    if (!doc.prices.some((p) => p >= min && p <= max)) return false;
  }
  return true;
};

export type FacetOption = { id: string; label: string; hint?: string; count: number; selected: boolean };
export type Facets = Record<GroupKey, FacetOption[]> & {
  price: { min: number; max: number };
  inStock: number;
  onSale: number;
};

const LABELS: Record<Exclude<GroupKey, 'category'>, { id: string; label: string; hint?: string }[]> = {
  families: FAMILIES,
  notes: NOTES,
  longevity: LONGEVITY,
  projection: PROJECTION,
  occasions: OCCASIONS,
  times: TIMES,
  seasons: SEASONS,
  gender: GENDERS,
};

export type DiscoveryResult = {
  docs: DiscoveryDoc[];
  meta: { page: number; limit: number; total: number; totalPage: number; relaxed: boolean; sort: DiscoverySort };
  facets: Facets;
};

const compare: Record<DiscoverySort, (a: DiscoveryDoc, b: DiscoveryDoc) => number> = {
  relevance: () => 0,
  popular: (a, b) => Number(b.inStock) - Number(a.inStock) || b.salesCount - a.salesCount || b.createdAt - a.createdAt,
  newest: (a, b) => Number(b.inStock) - Number(a.inStock) || b.createdAt - a.createdAt,
  price_asc: (a, b) => a.minPrice - b.minPrice || a.name.localeCompare(b.name),
  price_desc: (a, b) => b.minPrice - a.minPrice || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
};

export const runDiscovery = (allDocs: DiscoveryDoc[], query: DiscoveryQuery): DiscoveryResult => {
  // 1) text search
  const terms = toSearchTerms(query.q);
  const phrase = tokenize(query.q).filter((w) => !GENERIC_WORDS.has(w)).join(' ');
  const scores = new Map<string, number>();
  let searched = allDocs;
  let relaxed = false;
  // "perfume" alone describes everything: only search when a real word was typed
  const hasSearch = terms.some((t) => t.required);
  if (hasSearch) {
    const score = (strict: boolean) => {
      scores.clear();
      return allDocs.filter((d) => {
        const s = scoreDoc(d, terms, phrase, strict);
        if (s > 0) scores.set(d.id, s);
        return s > 0;
      });
    };
    searched = score(true);
    if (!searched.length) {
      searched = score(false);
      relaxed = searched.length > 0;
    }
  }

  // 2) filters
  const selected = (key: GroupKey): string[] => query[key] ?? [];
  const base = searched.filter((d) => passesBasics(d, query));
  const passesAllBut = (doc: DiscoveryDoc, skip?: GroupKey) =>
    GROUPS.every((g) => g.key === skip || passesGroup(doc, g, selected(g.key)));
  const matched = base.filter((d) => passesAllBut(d));

  // 3) facet counts: "how many would I get if I also picked this?"
  const facets = {} as Facets;
  for (const group of GROUPS) {
    const sel = selected(group.key);
    // "any" groups are counted without their own selection; "all" groups narrow what is already shown
    const pool = group.mode === 'all' ? matched : base.filter((d) => passesAllBut(d, group.key));
    const counts = new Map<string, number>();
    for (const doc of pool) for (const v of group.values(doc)) counts.set(v, (counts.get(v) ?? 0) + 1);

    if (group.key === 'category') {
      const labels = new Map<string, string>();
      for (const doc of allDocs) if (doc.category) labels.set(doc.category.id, doc.category.label);
      facets.category = Array.from(labels, ([id, label]) => ({ id, label, count: counts.get(id) ?? 0, selected: sel.includes(id) }))
        .filter((o) => o.count > 0 || o.selected)
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    } else {
      facets[group.key] = LABELS[group.key]
        .map(({ id, label, hint }) => ({ id, label, ...(hint ? { hint } : {}), count: counts.get(id) ?? 0, selected: sel.includes(id) }))
        .filter((o) => o.count > 0 || o.selected);
    }
  }
  const withoutBasics = searched.filter((d) => passesAllBut(d));
  const allPrices = withoutBasics.flatMap((d) => (d.prices.length ? [d.minPrice] : []));
  facets.price = { min: allPrices.length ? Math.min(...allPrices) : 0, max: allPrices.length ? Math.max(...allPrices) : 0 };
  facets.inStock = matched.filter((d) => d.inStock).length;
  facets.onSale = matched.filter((d) => d.onSale).length;

  // 4) sort + page
  const sort: DiscoverySort = query.sort && (query.sort !== 'relevance' || hasSearch) ? query.sort : hasSearch ? 'relevance' : 'popular';
  const sorted = [...matched];
  if (sort === 'relevance') {
    sorted.sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || compare.popular(a, b));
  } else {
    sorted.sort(compare[sort]);
  }

  const limit = query.limit ?? 24;
  const total = sorted.length;
  const totalPage = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(query.page ?? 1, totalPage);
  return {
    docs: sorted.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, totalPage, relaxed, sort },
    facets,
  };
};

// ---------------------------------------------------------------------------------------------
// Suggestions (search box) and similar products
// ---------------------------------------------------------------------------------------------

export type Suggestion = { type: 'family' | 'note' | 'occasion' | 'category'; id: string; label: string; count: number };

const entryMatches = (labelWords: string[], word: string): boolean => {
  const typos = allowedTypos(word);
  return labelWords.some((w) => w === word || (word.length >= 2 && w.startsWith(word)) || (typos > 0 && w.length >= 4 && editDistance(word, w, typos) <= typos));
};

/** Scent families, notes, occasions and categories that the typed text points to. */
export const suggestFilters = (allDocs: DiscoveryDoc[], q: string | undefined): Suggestion[] => {
  const terms = toSearchTerms(q).filter((t) => t.required);
  if (!terms.length) return [];
  const out: Suggestion[] = [];
  const add = (type: Suggestion['type'], entries: { id: string; label: string; aliases?: string[] }[], values: (d: DiscoveryDoc) => string[]) => {
    for (const entry of entries) {
      const words = tokenize([entry.label, ...(entry.aliases ?? [])].join(' '));
      if (!terms.some((t) => t.words.some((w) => entryMatches(words, w)))) continue;
      const count = allDocs.filter((d) => values(d).includes(entry.id)).length;
      if (count > 0) out.push({ type, id: entry.id, label: entry.label, count });
    }
  };
  add('family', FAMILIES, (d) => d.families);
  add('note', NOTES, (d) => d.notes);
  add('occasion', OCCASIONS, (d) => d.occasions);
  const categories = new Map<string, string>();
  for (const d of allDocs) if (d.category) categories.set(d.category.id, d.category.label);
  add('category', Array.from(categories, ([id, label]) => ({ id, label })), (d) => (d.category ? [d.category.id] : []));
  return out.slice(0, 8);
};

const overlap = (a: string[], b: string[]): number => a.filter((x) => b.includes(x)).length;

/** Products that smell alike: shared notes and families, then similar strength and wearer. */
export const similarDocs = (allDocs: DiscoveryDoc[], target: DiscoveryDoc, limit = 8): DiscoveryDoc[] =>
  allDocs
    .filter((d) => d.id !== target.id && d.inStock)
    .map((d) => {
      const shared = overlap(d.notes, target.notes) * 2 + overlap(d.mainFamilies, target.mainFamilies) * 4 + overlap(d.families, target.families);
      const sameWearer = !d.genderCode || !target.genderCode || d.genderCode === target.genderCode || d.genderCode === 'UNISEX' || target.genderCode === 'UNISEX';
      const score =
        shared +
        (d.category && target.category && d.category.id === target.category.id ? 2 : 0) +
        (d.longevity && d.longevity === target.longevity ? 1 : 0) +
        (d.projection && d.projection === target.projection ? 1 : 0);
      return { d, score: shared > 0 && sameWearer ? score : 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.d.salesCount - a.d.salesCount)
    .slice(0, limit)
    .map((x) => x.d);
