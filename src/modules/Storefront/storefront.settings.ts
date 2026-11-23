// What the shop owner can change about the storefront without a developer: the announcement bar,
// the hero banners and the product rows on the home page. Pure functions: defaults + cleaning of
// whatever the admin screen sends, so the storefront can always render what is stored.

export type HeroSlide = {
  image: string;
  mobileImage?: string;
  alt: string;
  buttonText: string;
  link: string;
};

export type HomeRow = {
  title: string;
  /** Written like a shop address: "category=oriental-attar", "notes=oud&maxPrice=500", "sort=newest" */
  query: string;
  href: string;
  linkLabel: string;
  enabled: boolean;
};

export type StorefrontSettings = {
  notices: string[];
  hero: HeroSlide[];
  homeRows: HomeRow[];
};

// The storefront as it was before this screen existed.
export const DEFAULT_SETTINGS: StorefrontSettings = {
  notices: ['Free shipping on orders over ৳1000', 'Premium Quality, Authentic Products', 'Cash on Delivery Available'],
  hero: [
    { image: '/hero1desktop11.webp', mobileImage: '/hero1mobile11.webp', alt: 'Khushbuwaala perfume oils', buttonText: 'Shop Now', link: '/shop' },
    { image: '/hero2desktop22.webp', mobileImage: '/hero2mobile22.webp', alt: 'Khushbuwaala attars and oud', buttonText: 'Explore Collections', link: '/shop' },
    { image: '/hero3desktop33.webp', mobileImage: '/hero3mobile33.webp', alt: 'Khushbuwaala attars and oud', buttonText: 'Best Sellers', link: '/shop?sort=popular' },
  ],
  homeRows: [
    { title: 'Best Sellers', query: 'sort=popular&inStock=1', href: '/shop', linkLabel: 'See all perfumes', enabled: true },
    { title: 'Arabian Attar', query: 'category=oriental-attar&inStock=1', href: '/oriental-attar', linkLabel: 'All Arabian attar', enabled: true },
    { title: 'Oud Collection', query: 'category=artificial-oud&inStock=1', href: '/artificial-oud', linkLabel: 'All oud', enabled: true },
    { title: 'Inspired Perfume Oils', query: 'category=inspired-perfume-oil&inStock=1', href: '/inspired-perfume-oil', linkLabel: 'All inspired oils', enabled: true },
    { title: 'New Arrivals', query: 'sort=newest&inStock=1', href: '/new-arrivals', linkLabel: 'All new arrivals', enabled: true },
  ],
};

export const LIMITS = { notices: 6, noticeLength: 90, hero: 6, homeRows: 8, title: 50, label: 40, alt: 140, query: 240 } as const;

/** Hosts a banner picture may come from (the storefront only loads images from these). */
const IMAGE_HOSTS = ['res.cloudinary.com'];

const text = (value: unknown, max: number): string =>
  String(value ?? '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** A link inside the shop ("/shop?notes=oud"). Anything else (other sites, javascript:) is refused. */
export const internalLink = (value: unknown): string | null => {
  const v = String(value ?? '').trim();
  if (!/^\/(?!\/)[A-Za-z0-9\-._~/?&=%,+]*$/.test(v) || v.length > 300) return null;
  return v;
};

/** A picture already in the storefront ("/hero1.webp") or uploaded to our image host. */
export const imageUrl = (value: unknown): string | null => {
  const v = String(value ?? '').trim();
  if (!v || v.length > 500) return null;
  if (/^\/(?!\/)[A-Za-z0-9\-._/]+\.(webp|png|jpe?g|avif)$/i.test(v)) return v;
  try {
    const url = new URL(v);
    if (url.protocol !== 'https:' || !IMAGE_HOSTS.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
};

/** A row's product selection: only the filter names the shop understands, safe characters only. */
const QUERY_KEYS = new Set([
  'q', 'category', 'families', 'notes', 'longevity', 'projection', 'occasions', 'times', 'seasons',
  'gender', 'minPrice', 'maxPrice', 'inStock', 'onSale', 'sort',
]);
export const rowQuery = (value: unknown): string | null => {
  const v = String(value ?? '').trim().replace(/^\?/, '');
  if (!v || v.length > LIMITS.query) return null;
  const parts: string[] = [];
  for (const [key, val] of new URLSearchParams(v)) {
    if (!QUERY_KEYS.has(key)) return null;
    // letters (with Bangla vowel signs), digits and the few separators filters use
    if (!/^[\p{L}\p{M}\p{N} ,._-]{1,80}$/u.test(val)) return null;
    parts.push(`${key}=${encodeURIComponent(val).replace(/%2C/gi, ',')}`);
  }
  return parts.length ? parts.join('&') : null;
};

export type CleanResult = { settings: StorefrontSettings; problems: string[] };

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * Turn what the admin screen sent into settings the storefront can render. Each thing that could
 * not be kept is reported in `problems`, so the admin sees exactly what to fix; nothing is
 * silently "corrected" into something else.
 */
export const cleanSettings = (input: unknown): CleanResult => {
  const raw = record(input);
  const problems: string[] = [];

  const notices = list(raw.notices)
    .map((n) => text(n, LIMITS.noticeLength))
    .filter(Boolean)
    .slice(0, LIMITS.notices);

  const hero: HeroSlide[] = [];
  list(raw.hero).slice(0, LIMITS.hero).forEach((entry, i) => {
    const s = record(entry);
    const image = imageUrl(s.image);
    const link = internalLink(s.link);
    if (!image) return void problems.push(`Banner ${i + 1}: the picture must be uploaded here or be a file already on the site.`);
    if (!link) return void problems.push(`Banner ${i + 1}: the link must be a page of the shop, starting with "/".`);
    const mobile = s.mobileImage ? imageUrl(s.mobileImage) : null;
    if (s.mobileImage && !mobile) return void problems.push(`Banner ${i + 1}: the phone picture is not a valid image.`);
    hero.push({
      image,
      ...(mobile ? { mobileImage: mobile } : {}),
      alt: text(s.alt, LIMITS.alt) || 'Khushbuwaala',
      buttonText: text(s.buttonText, LIMITS.label) || 'Shop Now',
      link,
    });
  });

  const homeRows: HomeRow[] = [];
  list(raw.homeRows).slice(0, LIMITS.homeRows).forEach((entry, i) => {
    const r = record(entry);
    const title = text(r.title, LIMITS.title);
    const query = rowQuery(r.query);
    const href = internalLink(r.href);
    if (!title) return void problems.push(`Row ${i + 1}: a title is needed.`);
    if (!query) return void problems.push(`Row "${title}": the product selection is not valid (for example: category=oriental-attar or notes=oud&maxPrice=500).`);
    if (!href) return void problems.push(`Row "${title}": the "see all" link must be a page of the shop, starting with "/".`);
    homeRows.push({ title, query, href, linkLabel: text(r.linkLabel, LIMITS.label) || 'See all', enabled: r.enabled !== false });
  });

  return { settings: { notices, hero, homeRows }, problems };
};

/** Stored settings with defaults for anything missing or emptied, so the shop never shows a blank bar or hero. */
export const withDefaults = (stored: unknown): StorefrontSettings => {
  const { settings } = cleanSettings(stored);
  const raw = record(stored);
  return {
    notices: Array.isArray(raw.notices) ? settings.notices : DEFAULT_SETTINGS.notices,
    hero: settings.hero.length ? settings.hero : DEFAULT_SETTINGS.hero,
    homeRows: Array.isArray(raw.homeRows) && settings.homeRows.length ? settings.homeRows : DEFAULT_SETTINGS.homeRows,
  };
};
