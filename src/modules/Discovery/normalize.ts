// Turns a product row (hand-typed accords, notes, "best for") into a clean, structured record the
// shop can filter and search on. Pure functions: no database, no clock.
import type { ProductRow } from '../../types/records';
import {
  FAMILIES,
  GENDERS,
  LONGEVITY,
  NOTES,
  OCCASIONS,
  PROJECTION,
  SEASONS,
  TIMES,
  TaxonomyEntry,
} from './taxonomy';

/** Lowercase words of a text. Works for Bangla too (keeps letters, digits and combining marks). */
export const tokenize = (text: unknown): string[] =>
  String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter(Boolean);

type CompiledEntry = { entry: TaxonomyEntry; aliases: string[][] };
const compile = (list: TaxonomyEntry[]): CompiledEntry[] =>
  list.map((entry) => ({ entry, aliases: entry.aliases.map(tokenize).filter((a) => a.length > 0) }));

const COMPILED = {
  families: compile(FAMILIES),
  notes: compile(NOTES),
  occasions: compile(OCCASIONS),
  times: compile(TIMES),
  seasons: compile(SEASONS),
};

const containsSequence = (words: string[], seq: string[]): boolean => {
  if (seq.length === 1) return words.includes(seq[0]);
  for (let i = 0; i + seq.length <= words.length; i++) {
    let ok = true;
    for (let j = 0; j < seq.length; j++) {
      if (words[i + j] !== seq[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
};

/** Ids of the taxonomy entries a list of hand-typed values refers to (whole-word alias match). */
export const matchEntries = (values: unknown[], compiled: CompiledEntry[]): string[] => {
  const found = new Set<string>();
  for (const value of values) {
    const words = tokenize(value);
    if (!words.length) continue;
    for (const { entry, aliases } of compiled) {
      if (found.has(entry.id)) continue;
      if (aliases.some((alias) => containsSequence(words, alias))) found.add(entry.id);
    }
  }
  // keep taxonomy order so output is stable
  return compiled.map((c) => c.entry.id).filter((id) => found.has(id));
};

const codeToId = (code: unknown, table: { id: string; codes: string[] }[]): string | null => {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return null;
  return table.find((t) => t.codes.includes(c))?.id ?? null;
};

export const categorySlug = (name: unknown): string => tokenize(name).join('-');

const titleCase = (text: string): string =>
  text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

export const categoryLabel = (name: unknown): string => titleCase(String(name ?? '').trim());

/** "Khushbuwaala" and "KhushbuWaala" are one brand; stray spaces are dropped. */
export const cleanBrand = (brand: unknown): string | null => {
  const b = String(brand ?? '').trim().replace(/\s+/g, ' ');
  if (!b || b.toLowerCase() === 'n/a') return null;
  return b.toLowerCase() === 'khushbuwaala' ? 'Khushbuwaala' : b;
};

export type DiscoveryDoc = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  category: { id: string; label: string } | null;
  genderCode: string | null;
  genders: string[];
  families: string[];
  /** Families of the first three accords: the admin lists the strongest first */
  mainFamilies: string[];
  notes: string[];
  noteLayers: { top: string[]; middle: string[]; base: string[] };
  longevity: string | null;
  projection: string | null;
  occasions: string[];
  times: string[];
  seasons: string[];
  prices: number[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  onSale: boolean;
  salesCount: number;
  createdAt: number;
  // search material
  nameWords: string[];
  scentWords: string[];
  catalogWords: string[];
  traitWords: string[];
  tagWords: string[];
  description: string;
};

const uniq = <T>(list: T[]): T[] => Array.from(new Set(list));

const labelsOf = (ids: string[], list: { id: string; label: string }[]): string[] =>
  ids.map((id) => list.find((e) => e.id === id)?.label ?? '').filter(Boolean);

const discountIsLive = (d: { code?: string | null; startDate?: Date | string | null; endDate?: Date | string | null }, now: number): boolean => {
  if (d.code) return false; // a coupon is not a sale price
  const start = d.startDate ? new Date(d.startDate).getTime() : -Infinity;
  const end = d.endDate ? new Date(d.endDate).getTime() : Infinity;
  return now >= start && now <= end;
};

export const toDiscoveryDoc = (product: ProductRow, now: number = Date.now()): DiscoveryDoc => {
  const accords = product.accords ?? [];
  const familyNames = (product.ProductFragrance ?? []).map((pf) => pf.fragrance?.fragranceName).filter(Boolean);
  const top = product.perfumeNotes?.top ?? [];
  const middle = product.perfumeNotes?.middle ?? [];
  const base = product.perfumeNotes?.base ?? [];
  const bestFor = product.bestFor ?? [];

  const families = matchEntries([...accords, ...familyNames], COMPILED.families);
  const noteLayers = {
    top: matchEntries(top, COMPILED.notes),
    middle: matchEntries(middle, COMPILED.notes),
    base: matchEntries(base, COMPILED.notes),
  };
  // An accord such as "Oud" or "Rose" also says the scent is in there.
  const notes = matchEntries([...top, ...middle, ...base, ...accords, ...familyNames], COMPILED.notes);

  const longevity = codeToId(product.longevity, LONGEVITY);
  const projection = codeToId(product.projection, PROJECTION);
  const occasions = matchEntries(bestFor, COMPILED.occasions);
  const times = matchEntries(bestFor, COMPILED.times);
  const seasons = matchEntries(bestFor, COMPILED.seasons);

  const genderCode = String(product.gender ?? '').trim().toUpperCase() || null;
  const genders = genderCode ? GENDERS.filter((g) => g.codes.includes(genderCode)).map((g) => g.id) : [];

  const variants = (product.variants ?? []).filter((v) => v.published !== false);
  const prices = variants.map((v) => v.price).filter((p) => Number.isFinite(p));
  const categoryName = product.category?.categoryName;
  const brand = cleanBrand(product.brand);

  const genderWords =
    genderCode === 'MALE' ? ['men', 'male'] : genderCode === 'FEMALE' ? ['women', 'female'] : genderCode === 'UNISEX' ? ['unisex', 'men', 'women'] : [];

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand,
    category: categoryName ? { id: categorySlug(categoryName), label: categoryLabel(categoryName) } : null,
    genderCode,
    genders,
    families,
    mainFamilies: matchEntries(accords.slice(0, 3), COMPILED.families),
    notes,
    noteLayers,
    longevity,
    projection,
    occasions,
    times,
    seasons,
    prices,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    inStock: (product.stock ?? 0) > 0,
    onSale: (product.discounts ?? []).some((d) => discountIsLive(d, now)),
    salesCount: product.salesCount ?? 0,
    createdAt: new Date(product.createdAt).getTime(),

    nameWords: uniq(tokenize(product.name)),
    scentWords: uniq([
      ...tokenize([...accords, ...familyNames, ...top, ...middle, ...base].join(' ')),
      ...tokenize(labelsOf(families, FAMILIES).join(' ')),
      ...tokenize(labelsOf(notes, NOTES).join(' ')),
    ]),
    catalogWords: uniq([...tokenize(categoryName), ...tokenize(brand), ...tokenize(product.origin)]),
    traitWords: uniq([
      ...tokenize(labelsOf(longevity ? [longevity] : [], LONGEVITY).join(' ')),
      ...(projection === 'strong' ? ['strong'] : projection === 'close' ? ['soft', 'subtle', 'light'] : []),
      ...tokenize(bestFor.join(' ')),
      ...tokenize(labelsOf(occasions, OCCASIONS).join(' ')),
      ...occasions,
      ...times,
      ...seasons,
      ...genderWords,
    ]),
    tagWords: uniq(tokenize((product.tags ?? []).join(' '))),
    description: String(product.description ?? '').toLowerCase(),
  };
};

export type ProductProfile = {
  families: { id: string; label: string; hint?: string }[];
  mainFamilies: { id: string; label: string; hint?: string }[];
  notes: { id: string; label: string }[];
  longevity: { id: string; label: string; hint: string } | null;
  projection: { id: string; label: string; hint: string } | null;
  occasions: { id: string; label: string }[];
  times: { id: string; label: string }[];
  seasons: { id: string; label: string }[];
};

const pick = <T extends { id: string }>(ids: string[], list: T[]): T[] =>
  ids.map((id) => list.find((e) => e.id === id)).filter((e): e is T => Boolean(e));

/** The customer-facing fragrance profile of one product (product page, cards, assistant). */
export const toProfile = (doc: DiscoveryDoc): ProductProfile => ({
  families: pick(doc.families, FAMILIES).map(({ id, label, hint }) => ({ id, label, hint })),
  mainFamilies: pick(doc.mainFamilies, FAMILIES).map(({ id, label, hint }) => ({ id, label, hint })),
  notes: pick(doc.notes, NOTES).map(({ id, label }) => ({ id, label })),
  longevity: LONGEVITY.filter((l) => l.id === doc.longevity).map(({ id, label, hint }) => ({ id, label, hint }))[0] ?? null,
  projection: PROJECTION.filter((p) => p.id === doc.projection).map(({ id, label, hint }) => ({ id, label, hint }))[0] ?? null,
  occasions: pick(doc.occasions, OCCASIONS).map(({ id, label }) => ({ id, label })),
  times: pick(doc.times, TIMES).map(({ id, label }) => ({ id, label })),
  seasons: pick(doc.seasons, SEASONS).map(({ id, label }) => ({ id, label })),
});

// ---------------------------------------------------------------------------------------------
// Data check (admin): what is missing or not understood on a product
// ---------------------------------------------------------------------------------------------

export type ProductDataCheck = {
  id: string;
  name: string;
  slug: string;
  /** Fields the shop filters rely on that are empty */
  missing: string[];
  /** Typed values the shop does not recognise, so they are ignored by filters (usually a spelling) */
  unrecognised: { field: 'Accords' | 'Best for'; value: string }[];
};

const matchesAny = (value: unknown, lists: CompiledEntry[][]): boolean =>
  lists.some((compiled) => matchEntries([value], compiled).length > 0);

/** What staff could add or correct on one product so customers can find it. Never changes data. */
export const checkProductData = (product: ProductRow): ProductDataCheck => {
  const accords = product.accords ?? [];
  const bestFor = product.bestFor ?? [];
  const notes = [...(product.perfumeNotes?.top ?? []), ...(product.perfumeNotes?.middle ?? []), ...(product.perfumeNotes?.base ?? [])];
  const real = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s !== '' && s.toUpperCase() !== 'N/A';
  };

  const missing: string[] = [];
  if (!accords.some(real)) missing.push('Accords');
  if (!notes.some(real)) missing.push('Fragrance notes');
  if (!codeToId(product.longevity, LONGEVITY)) missing.push('Longevity');
  if (!codeToId(product.projection, PROJECTION)) missing.push('Projection');
  if (!String(product.gender ?? '').trim()) missing.push('Gender');
  if (!bestFor.some(real)) missing.push('Best for');

  const unrecognised: ProductDataCheck['unrecognised'] = [];
  for (const value of accords) {
    if (real(value) && !matchesAny(value, [COMPILED.families, COMPILED.notes])) unrecognised.push({ field: 'Accords', value: String(value).trim() });
  }
  for (const value of bestFor) {
    if (real(value) && !matchesAny(value, [COMPILED.occasions, COMPILED.times, COMPILED.seasons])) unrecognised.push({ field: 'Best for', value: String(value).trim() });
  }
  return { id: product.id, name: product.name, slug: product.slug, missing, unrecognised };
};
