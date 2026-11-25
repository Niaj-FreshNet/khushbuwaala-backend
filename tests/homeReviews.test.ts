// Which reviews the home page shows. No database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_HOME_REVIEW_SETTINGS,
  choiceOf,
  cleanHomeReviewSettings,
  pickHomeReviews,
  withChoice,
} from '../src/modules/Review/homeReviews';

const id = (n: number) => n.toString(16).padStart(24, '0');
const review = (n: number, over: Partial<{ rating: number; comment: string; isPublished: boolean; day: number }> = {}) => ({
  id: id(n),
  rating: over.rating ?? 5,
  comment: over.comment ?? 'Lasts all day, I get compliments.',
  isPublished: over.isPublished ?? true,
  createdAt: new Date(2026, 0, over.day ?? n),
});

test('by itself: published 5-star reviews that say something, newest first', () => {
  const list = [review(1), review(2), review(3), review(4, { rating: 4 }), review(5, { isPublished: false }), review(6, { comment: 'nice' })];
  const shown = pickHomeReviews(list, DEFAULT_HOME_REVIEW_SETTINGS).map((r) => r.id);
  assert.deepEqual(shown, [id(3), id(2), id(1)]);
});

test('pinned reviews come first in pin order; a short pinned review still shows', () => {
  const list = [review(1), review(2), review(3), review(6, { comment: 'nice' })];
  const settings = { enabled: true, pinned: [id(6), id(1)], hidden: [] };
  assert.deepEqual(pickHomeReviews(list, settings).map((r) => r.id), [id(6), id(1), id(3), id(2)]);
});

test('hidden reviews never show; a 4-star or unpublished review cannot be forced in by pinning', () => {
  const list = [review(1), review(2), review(3), review(4), review(7, { rating: 4 }), review(8, { isPublished: false })];
  const settings = { enabled: true, pinned: [id(7), id(8)], hidden: [id(2)] };
  assert.deepEqual(pickHomeReviews(list, settings).map((r) => r.id), [id(4), id(3), id(1)]);
});

test('the section is left out when switched off or when fewer than three qualify', () => {
  const three = [review(1), review(2), review(3)];
  assert.deepEqual(pickHomeReviews(three, { enabled: false, pinned: [], hidden: [] }), []);
  assert.deepEqual(pickHomeReviews(three.slice(0, 2), DEFAULT_HOME_REVIEW_SETTINGS), []);
});

test('no more than the limit are sent', () => {
  const many = Array.from({ length: 20 }, (_, i) => review(i + 1));
  assert.equal(pickHomeReviews(many, DEFAULT_HOME_REVIEW_SETTINGS).length, 12);
});

test('choices: a review is auto, pinned or hidden, never two at once', () => {
  let s = withChoice(DEFAULT_HOME_REVIEW_SETTINGS, id(1), 'pinned');
  assert.equal(choiceOf(s, id(1)), 'pinned');
  s = withChoice(s, id(1), 'hidden');
  assert.deepEqual(s.pinned, []);
  assert.equal(choiceOf(s, id(1)), 'hidden');
  s = withChoice(s, id(1), 'auto');
  assert.deepEqual([s.pinned, s.hidden], [[], []]);
});

test('stored junk is made safe', () => {
  assert.deepEqual(cleanHomeReviewSettings(null), DEFAULT_HOME_REVIEW_SETTINGS);
  const cleaned = cleanHomeReviewSettings({ enabled: 'no', pinned: [id(1), 'x', id(1), id(2)], hidden: [id(2), 5] });
  assert.deepEqual(cleaned, { enabled: true, pinned: [id(1)], hidden: [id(2)] });
});
