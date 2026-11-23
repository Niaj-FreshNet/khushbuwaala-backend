// Storefront content edited from the admin panel: what is accepted, what is refused, and defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, DEFAULT_SETTINGS, imageUrl, internalLink, rowQuery, withDefaults } from '../src/modules/Storefront/storefront.settings';

test('links must stay inside the shop', () => {
  assert.equal(internalLink('/shop?notes=oud&maxPrice=500'), '/shop?notes=oud&maxPrice=500');
  assert.equal(internalLink('/oriental-attar'), '/oriental-attar');
  for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', 'shop', '', '/a b', '/x"onload=']) {
    assert.equal(internalLink(bad), null, bad);
  }
});

test('banner pictures: site files or our image host over https only', () => {
  assert.equal(imageUrl('/hero1desktop11.webp'), '/hero1desktop11.webp');
  assert.ok(imageUrl('https://res.cloudinary.com/dwl2slbiw/image/upload/v1/banners/a.webp'));
  for (const bad of ['http://res.cloudinary.com/x.webp', 'https://evil.example/x.webp', '/x.svg', 'data:image/png;base64,AAAA', '//res.cloudinary.com/x.webp', '']) {
    assert.equal(imageUrl(bad), null, bad);
  }
});

test('a row can use any shop filter, and nothing else', () => {
  assert.equal(rowQuery('category=oriental-attar&inStock=1'), 'category=oriental-attar&inStock=1');
  assert.equal(rowQuery('?notes=oud,rose&maxPrice=500'), 'notes=oud,rose&maxPrice=500');
  assert.equal(rowQuery('q=গোলাপ'), `q=${encodeURIComponent('গোলাপ')}`);
  assert.equal(rowQuery('limit=9999'), null);
  assert.equal(rowQuery('category=<script>'), null);
  assert.equal(rowQuery(''), null);
});

test('the built-in defaults are valid settings', () => {
  const { settings, problems } = cleanSettings(DEFAULT_SETTINGS);
  assert.deepEqual(problems, []);
  assert.deepEqual(settings, DEFAULT_SETTINGS);
});

test('bad entries are reported by name, not silently changed', () => {
  const { settings, problems } = cleanSettings({
    notices: ['  Eid offer:   10% off  ', '', '<b>bold</b>', 5],
    hero: [{ image: 'https://evil.example/a.jpg', link: '/shop' }, { image: '/hero2.png', link: 'https://x.y', alt: 'x' }, { image: '/ok.webp', link: '/shop', buttonText: '' }],
    homeRows: [{ title: '', query: 'sort=newest', href: '/shop' }, { title: 'Oud', query: 'drop=1', href: '/shop' }, { title: 'Gifts', query: 'category=gifts-and-packages', href: '/gifts-and-packages', enabled: false }],
  });
  assert.deepEqual(settings.notices, ['Eid offer: 10% off', 'b bold /b', '5']);
  assert.equal(settings.hero.length, 1);
  assert.deepEqual(settings.hero[0], { image: '/ok.webp', alt: 'Khushbuwaala', buttonText: 'Shop Now', link: '/shop' });
  assert.deepEqual(settings.homeRows, [{ title: 'Gifts', query: 'category=gifts-and-packages', href: '/gifts-and-packages', linkLabel: 'See all', enabled: false }]);
  assert.equal(problems.length, 4);
  assert.ok(problems.some((p) => p.startsWith('Banner 1')) && problems.some((p) => p.includes('"Oud"')));
});

test('limits: no more than 6 notices, 6 banners, 8 rows', () => {
  const many = cleanSettings({
    notices: Array.from({ length: 20 }, (_, i) => `n${i}`),
    hero: Array.from({ length: 20 }, () => ({ image: '/a.webp', link: '/shop' })),
    homeRows: Array.from({ length: 20 }, (_, i) => ({ title: `r${i}`, query: 'sort=newest', href: '/shop' })),
  }).settings;
  assert.deepEqual([many.notices.length, many.hero.length, many.homeRows.length], [6, 6, 8]);
});

test('nothing stored, or junk stored: the shop still gets a complete set', () => {
  assert.deepEqual(withDefaults(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(withDefaults('junk'), DEFAULT_SETTINGS);
  // an owner may clear the announcement bar on purpose; banners and rows fall back
  const cleared = withDefaults({ notices: [], hero: [], homeRows: [] });
  assert.deepEqual(cleared.notices, []);
  assert.deepEqual(cleared.hero, DEFAULT_SETTINGS.hero);
  assert.deepEqual(cleared.homeRows, DEFAULT_SETTINGS.homeRows);
});
