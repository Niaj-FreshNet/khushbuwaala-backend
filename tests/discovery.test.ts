// Product discovery (shop search, filters, counts) on a snapshot of the real catalogue. No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProductRow } from '../src/types/records';
import { matchEntries, toDiscoveryDoc, toProfile, tokenize, cleanBrand, categorySlug } from '../src/modules/Discovery/normalize';
import { editDistance, parseDiscoveryQuery, runDiscovery, similarDocs, suggestFilters, toSearchTerms } from '../src/modules/Discovery/engine';
import { FAMILIES, NOTES } from '../src/modules/Discovery/taxonomy';
import { cleanProductIds, dedupeEntries } from '../src/modules/Wishlist/wishlist.service';
import catalog from './fixtures/catalog.json';

const rows = catalog as unknown as ProductRow[];
const NOW = new Date('2026-11-23T00:00:00Z').getTime();
const docs = rows.map((r) => toDiscoveryDoc(r, NOW));
const find = (q: Record<string, unknown>) => runDiscovery(docs, parseDiscoveryQuery(q));
const names = (q: Record<string, unknown>) => find(q).docs.map((d) => d.name);
const compiled = (list: typeof FAMILIES) => list.map((entry) => ({ entry, aliases: entry.aliases.map(tokenize) }));

test('hand-typed accords map to families by whole words only', () => {
  const fam = (values: string[]) => matchEntries(values, compiled(FAMILIES));
  assert.deepEqual(fam(['Oud (Agarwood)']), ['woody']);
  assert.deepEqual(fam(['Spicy-Woody undertones']), ['spicy', 'woody']);
  assert.deepEqual(fam(['Floral & Oriental']), ['floral', 'oriental']);
  assert.deepEqual(fam(['woody', 'WOODY ', 'Woody']), ['woody']);
  assert.deepEqual(fam(['Elegant', 'Soft']), []);
  const note = (values: string[]) => matchEntries(values, compiled(NOTES));
  assert.deepEqual(note(['Rosewood', 'Rosemary']), []);
  assert.deepEqual(note(['Turkish Rose', 'Agarwood (Oud)', 'bergamont']), ['oud', 'rose', 'bergamot']);
});

test('every product in the snapshot gets a usable profile; nothing is invented', () => {
  assert.equal(docs.length, rows.length);
  for (const doc of docs) {
    assert.ok(doc.families.length > 0, `${doc.name} has no family`);
    assert.ok(doc.longevity, `${doc.name} has no longevity`);
  }
  const bare = toDiscoveryDoc({ ...rows[0], accords: [], bestFor: [], perfumeNotes: null, longevity: null, projection: null, gender: null, ProductFragrance: [] } as ProductRow, NOW);
  const profile = toProfile(bare);
  assert.deepEqual([profile.families, profile.notes, profile.occasions], [[], [], []]);
  assert.equal(profile.longevity, null);
  assert.equal(profile.projection, null);
});

test('brand and category clean-up', () => {
  assert.equal(cleanBrand('KhushbuWaala'), 'Khushbuwaala');
  assert.equal(cleanBrand(' Attar Mohamed  Dawood '), 'Attar Mohamed Dawood');
  assert.equal(cleanBrand('N/A'), null);
  assert.equal(categorySlug('INSPIRED PERFUME OIL'), 'inspired-perfume-oil');
});

test('search: names, typos, Banglish and Bangla', () => {
  assert.equal(names({ q: 'dior sauvage' })[0], 'Dior Sauvage');
  assert.equal(names({ q: 'savage' })[0], 'Dior Sauvage');
  assert.equal(names({ q: 'aventos' })[0], 'Creed Aventus');
  assert.ok(names({ q: 'mukhalat', limit: 50 }).every((n) => n.startsWith('Mukhallat')));
  assert.deepEqual(new Set(names({ q: 'oudh', limit: 100 })), new Set(names({ q: 'oud', limit: 100 })));
  assert.equal(find({ q: 'গোলাপ' }).meta.total > 20, true);
  assert.ok(names({ q: 'golap' }).some((n) => n.includes('Rose')));
  assert.equal(find({ q: 'xyzabc' }).meta.total, 0);
});

test('search: filler words do not narrow or reorder; every real word must match', () => {
  assert.equal(find({ q: 'perfume' }).meta.total, docs.length);
  assert.equal(find({ q: 'the best perfume for me' }).meta.total, docs.length);
  assert.deepEqual(names({ q: 'rose perfume' }), names({ q: 'rose' }));
  const both = find({ q: 'long lasting oud', limit: 100 });
  assert.ok(both.meta.total > 0 && both.meta.total < find({ q: 'oud' }).meta.total);
  assert.equal(toSearchTerms('cheap oud').length, 1);
});

test('filters combine: Woody + Oud + long-lasting under ৳500', () => {
  const r = find({ families: 'woody', notes: 'oud', longevity: 'long,very_long', maxPrice: '500', limit: 100 });
  assert.ok(r.meta.total > 0);
  for (const d of r.docs) {
    assert.ok(d.families.includes('woody') && d.notes.includes('oud'));
    assert.ok(d.longevity === 'long' || d.longevity === 'very_long');
    assert.ok(d.prices.some((p) => p <= 500));
  }
  // families narrow (AND), longevity widens (OR)
  assert.ok(find({ families: 'woody,sweet' }).meta.total <= find({ families: 'woody' }).meta.total);
  assert.ok(find({ longevity: 'long,moderate' }).meta.total >= find({ longevity: 'long' }).meta.total);
});

test('facet counts say exactly what picking the option gives', () => {
  const r = find({ families: 'woody', longevity: 'long' });
  for (const option of r.facets.families.filter((o) => !o.selected).slice(0, 5)) {
    assert.equal(find({ families: `woody,${option.id}`, longevity: 'long' }).meta.total, option.count, option.id);
  }
  for (const option of r.facets.longevity) {
    assert.equal(find({ families: 'woody', longevity: option.id }).meta.total, option.count, option.id);
  }
  assert.ok(r.facets.families.find((o) => o.id === 'woody')?.selected);
});

test('unknown filter values and junk input are ignored, not errors', () => {
  const q = parseDiscoveryQuery({ families: 'woody,<script>', sort: 'DROP', page: '-3', limit: '9999', minPrice: 'abc' });
  assert.deepEqual(q.families, ['woody']);
  assert.equal(q.sort, undefined);
  assert.equal(q.page, 1);
  assert.equal(q.limit, 100);
  assert.equal(q.minPrice, undefined);
  assert.equal(find({ page: '999' }).docs.length > 0, true);
});

test('sorting is over the whole catalogue, not one page', () => {
  const up = find({ sort: 'price_asc', limit: 100 }).docs.map((d) => d.minPrice);
  assert.deepEqual(up, [...up].sort((a, b) => a - b));
  const page2 = find({ sort: 'price_asc', limit: 10, page: 2 }).docs.map((d) => d.minPrice);
  assert.ok(page2[0] >= find({ sort: 'price_asc', limit: 10 }).docs[9].minPrice);
  const az = find({ sort: 'name', limit: 100 }).docs.map((d) => d.name);
  assert.deepEqual(az, [...az].sort((a, b) => a.localeCompare(b)));
  const popular = find({ limit: 100 });
  assert.equal(popular.meta.sort, 'popular');
  const firstOut = popular.docs.findIndex((d) => !d.inStock);
  assert.ok(firstOut === -1 || popular.docs.slice(firstOut).every((d) => !d.inStock), 'out-of-stock products come last');
});

test('suggestions point to filters that have products', () => {
  assert.deepEqual(suggestFilters(docs, 'swe').map((s) => s.id), ['sweet']);
  assert.ok(suggestFilters(docs, 'গোলাপ').some((s) => s.type === 'note' && s.id === 'rose'));
  assert.deepEqual(suggestFilters(docs, 'perfume'), []);
  assert.ok(suggestFilters(docs, 'oud').every((s) => s.count > 0));
});

test('similar products share scent, are in stock and exclude the product itself', () => {
  const target = docs.find((d) => d.slug === 'creed-aventus') ?? docs[0];
  const similar = similarDocs(docs, target, 8);
  assert.ok(similar.length > 0 && similar.length <= 8);
  for (const d of similar) {
    assert.notEqual(d.id, target.id);
    assert.ok(d.inStock);
    assert.ok(d.families.some((f) => target.families.includes(f)) || d.notes.some((n) => target.notes.includes(n)));
  }
});

test('edit distance: one slip is one mistake, with a cut-off', () => {
  assert.equal(editDistance('saffrn', 'saffron', 1), 1);
  assert.equal(editDistance('vanlila', 'vanilla', 1), 1);
  assert.equal(editDistance('rose', 'musk', 1), 2);
});

test('wishlist input: only real product ids, no repeats', () => {
  const id = 'a'.repeat(24);
  assert.deepEqual(cleanProductIds([id, id.toUpperCase(), 'nope', 5, null, { $ne: 1 }]), [id]);
  assert.deepEqual(cleanProductIds('x'), []);
  assert.equal(cleanProductIds(Array.from({ length: 300 }, (_, i) => i.toString(16).padStart(24, '0'))).length, 200);
  const d = (s: string) => new Date(s);
  assert.deepEqual(
    dedupeEntries([{ productId: 'a', createdAt: d('2026-01-01') }, { productId: 'b', createdAt: d('2026-03-01') }, { productId: 'a', createdAt: d('2026-02-01') }]).map((e) => e.productId),
    ['b', 'a']
  );
});
