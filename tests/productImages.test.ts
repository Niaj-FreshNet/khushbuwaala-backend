// Which pictures a product has after an edit. No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProductImages } from '../src/utils/productImages';

const A = 'https://res.cloudinary.com/x/image/upload/v1/khushbuwaala_images/products/a.jpg';
const B = 'https://res.cloudinary.com/x/image/upload/v1/khushbuwaala_images/products/b.jpg';
const C = 'https://res.cloudinary.com/x/image/upload/v1/khushbuwaala_images/products/c.jpg';

test('the editor list (primaryImage + otherImages) is saved', () => {
  const r = resolveProductImages(
    { primaryImage: '/placeholder.png', otherImages: [] },
    { primaryImage: A, otherImages: [B], imagesToKeep: [], newImages: [] },
  );
  assert.equal(r.primaryImage, A);
  assert.deepEqual(r.otherImages, [B]);
  assert.deepEqual(r.removed, []);
});

test('an edit that names no pictures keeps them and removes nothing', () => {
  const r = resolveProductImages({ primaryImage: A, otherImages: [B] }, { imagesToKeep: [], newImages: [] });
  assert.equal(r.primaryImage, A);
  assert.deepEqual(r.otherImages, [B]);
  assert.deepEqual(r.removed, []);
});

test('only pictures taken off the product are removed from storage', () => {
  const r = resolveProductImages({ primaryImage: A, otherImages: [B, C] }, { primaryImage: A, otherImages: [C] });
  assert.deepEqual(r.otherImages, [C]);
  assert.deepEqual(r.removed, [B]);
});

test('gallery only, no main picture yet: the first gallery picture becomes the main one', () => {
  const r = resolveProductImages(
    { primaryImage: '/placeholder.png', otherImages: [] },
    { primaryImage: '/placeholder.png', otherImages: [A, B] },
  );
  assert.equal(r.primaryImage, A);
  assert.deepEqual(r.otherImages, [B]);
});

test('an empty gallery with the same main picture clears the gallery only', () => {
  const r = resolveProductImages({ primaryImage: A, otherImages: [B] }, { primaryImage: A, otherImages: [] });
  assert.equal(r.primaryImage, A);
  assert.deepEqual(r.otherImages, []);
  assert.deepEqual(r.removed, [B]);
});

test('the older form (imagesToKeep + newImages) still works; repeats are dropped', () => {
  const r = resolveProductImages({ primaryImage: A, otherImages: [B] }, { imagesToKeep: [B], newImages: [C, C] });
  assert.equal(r.primaryImage, B);
  assert.deepEqual(r.otherImages, [C]);
  assert.deepEqual(r.removed, [A]);
});
