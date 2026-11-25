// Which customer reviews the home page shows. Pure functions, no database.
//
// By itself the section shows the shop's published 5-star reviews that say something, newest
// first. The owner can change that from the admin's Reviews page:
//   pinned  -> shown first, in the order they were pinned
//   hidden  -> never shown on the home page (the review stays on its product page)
//   enabled -> the whole section on or off
// Only published 5-star reviews are ever shown, pinned or not.

export type HomeReviewSettings = { enabled: boolean; pinned: string[]; hidden: string[] };
export type HomeChoice = 'auto' | 'pinned' | 'hidden';

export const DEFAULT_HOME_REVIEW_SETTINGS: HomeReviewSettings = { enabled: true, pinned: [], hidden: [] };

export const HOME_REVIEW_LIMIT = 12;
/** A review needs at least this many characters to be picked by itself ("nice" says nothing). */
export const MIN_COMMENT_LENGTH = 12;
/** The section is left out when fewer reviews than this qualify: two cards look like an empty shelf. */
export const MIN_REVIEWS_TO_SHOW = 3;

const idList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v) && !out.includes(v)) out.push(v);
  }
  return out;
};

/** Whatever is stored, made safe to use. */
export const cleanHomeReviewSettings = (stored: unknown): HomeReviewSettings => {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const hidden = idList(s.hidden);
  return {
    enabled: s.enabled !== false,
    hidden,
    // a review cannot be both; hidden wins
    pinned: idList(s.pinned).filter((id) => !hidden.includes(id)),
  };
};

/** The settings after the owner picks "auto", "pinned" or "hidden" for one review. */
export const withChoice = (settings: HomeReviewSettings, reviewId: string, choice: HomeChoice): HomeReviewSettings => {
  const pinned = settings.pinned.filter((id) => id !== reviewId);
  const hidden = settings.hidden.filter((id) => id !== reviewId);
  if (choice === 'pinned') pinned.push(reviewId);
  if (choice === 'hidden') hidden.push(reviewId);
  return { ...settings, pinned, hidden };
};

export const choiceOf = (settings: HomeReviewSettings, reviewId: string): HomeChoice =>
  settings.hidden.includes(reviewId) ? 'hidden' : settings.pinned.includes(reviewId) ? 'pinned' : 'auto';

type Candidate = { id: string; rating: number; comment: string; isPublished: boolean; createdAt: Date | string };

/** May this review appear on the home page at all? */
export const canShowOnHome = (review: Candidate): boolean => review.isPublished === true && review.rating === 5;

/** The reviews for the home page, in display order. Empty when the section is off or too thin. */
export function pickHomeReviews<R extends Candidate>(
  reviews: R[],
  settings: HomeReviewSettings,
  limit: number = HOME_REVIEW_LIMIT
): R[] {
  if (!settings.enabled) return [];
  const usable = reviews.filter((r) => canShowOnHome(r) && !settings.hidden.includes(r.id));

  const pinned = settings.pinned
    .map((id) => usable.find((r) => r.id === id))
    .filter((r): r is R => Boolean(r));

  const others = usable
    .filter((r) => !settings.pinned.includes(r.id) && String(r.comment || '').trim().length >= MIN_COMMENT_LENGTH)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const picked = [...pinned, ...others].slice(0, limit);
  return picked.length >= MIN_REVIEWS_TO_SHOW ? picked : [];
}
