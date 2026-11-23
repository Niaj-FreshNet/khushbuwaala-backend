// Fragrance taxonomy for product discovery (shop filters, search, and later the perfume assistant).
//
// Product data is typed by hand in the admin (accords, notes, "best for"), so the same idea is
// written many ways: "Oud", "Agarwood (Oud)", "Oud/Woody", "woody". This file is the single place
// that says which spellings mean the same thing. Nothing here invents data: a product only gets a
// family / note / occasion when one of its own stored values matches an alias below.
//
// To teach the shop a new spelling, add it to `aliases`. Aliases are matched as whole words
// (case-insensitive), so "rose" does not match "rosewood" or "rosemary".

export type TaxonomyEntry = {
  id: string;
  label: string;
  /** Plain-language line shown to customers who do not know perfume terms */
  hint?: string;
  aliases: string[];
};

/** Scent families: the overall character. A product can belong to several. */
export const FAMILIES: TaxonomyEntry[] = [
  { id: 'fresh', label: 'Fresh', hint: 'Clean, airy, just-showered', aliases: ['fresh', 'ozonic', 'cool', 'clean', 'crisp'] },
  { id: 'citrus', label: 'Citrus', hint: 'Lemon, orange, bergamot brightness', aliases: ['citrus', 'citruses', 'citrusy', 'lemon', 'sour'] },
  { id: 'aquatic', label: 'Aquatic', hint: 'Sea breeze and water', aliases: ['aquatic', 'marine', 'salty', 'sea'] },
  { id: 'green', label: 'Green', hint: 'Cut grass, leaves, herbs', aliases: ['green', 'grassy', 'leafy', 'leaves', 'mossy'] },
  { id: 'aromatic', label: 'Aromatic', hint: 'Lavender and fresh herbs', aliases: ['aromatic', 'herbal', 'lavender', 'fougere'] },
  { id: 'floral', label: 'Floral', hint: 'Rose, jasmine, white flowers', aliases: ['floral', 'florals', 'flowers', 'white floral', 'yellow floral', 'rose', 'jasmine', 'tuberose'] },
  { id: 'fruity', label: 'Fruity', hint: 'Apple, berries, tropical fruit', aliases: ['fruity', 'fruits', 'tropical', 'melon'] },
  { id: 'sweet', label: 'Sweet', hint: 'Sugary, honeyed, comforting', aliases: ['sweet', 'honey', 'caramel', 'vanilla'] },
  { id: 'gourmand', label: 'Gourmand', hint: 'Dessert-like: vanilla, chocolate, caramel', aliases: ['gourmand', 'chocolate', 'cocoa', 'cacao', 'caramel', 'almond', 'nutty', 'lactonic', 'creamy', 'coffee', 'coffe'] },
  { id: 'powdery', label: 'Powdery', hint: 'Soft, talc-like, gentle', aliases: ['powdery', 'iris'] },
  { id: 'musky', label: 'Musky', hint: 'Soft, warm, skin-like', aliases: ['musky', 'musk'] },
  { id: 'amber', label: 'Amber', hint: 'Warm, golden, slightly sweet', aliases: ['amber', 'ambery'] },
  { id: 'oriental', label: 'Oriental', hint: 'Rich Arabian style: resins, incense, spice', aliases: ['oriental', 'balsamic', 'resinous', 'resins', 'incense'] },
  { id: 'spicy', label: 'Spicy', hint: 'Saffron, cardamom, pepper warmth', aliases: ['spicy', 'spices', 'spice', 'fresh spicy', 'warm spicy', 'soft spicy', 'cinnamon'] },
  { id: 'woody', label: 'Woody', hint: 'Sandalwood, cedar, oud depth', aliases: ['woody', 'woods', 'wood', 'sandalwood', 'oud', 'agarwood'] },
  { id: 'earthy', label: 'Earthy', hint: 'Soil after rain, patchouli, vetiver', aliases: ['earthy', 'patchouli', 'vetiver'] },
  { id: 'smoky', label: 'Smoky', hint: 'Bakhoor smoke, tobacco, incense', aliases: ['smoky', 'tobacco', 'incense'] },
  { id: 'leather', label: 'Leather', hint: 'Bold, dark, a little animalic', aliases: ['leather', 'leathery', 'suede', 'animalic'] },
];

/** Notes: individual ingredients customers ask for by name. */
export const NOTES: TaxonomyEntry[] = [
  { id: 'oud', label: 'Oud', aliases: ['oud', 'oudh', 'aoud', 'agarwood'] },
  { id: 'rose', label: 'Rose', aliases: ['rose', 'roses'] },
  { id: 'musk', label: 'Musk', aliases: ['musk', 'musky', 'misk'] },
  { id: 'amber', label: 'Amber', aliases: ['amber', 'ambery'] },
  { id: 'vanilla', label: 'Vanilla', aliases: ['vanilla'] },
  { id: 'sandalwood', label: 'Sandalwood', aliases: ['sandalwood', 'sandal'] },
  { id: 'jasmine', label: 'Jasmine', aliases: ['jasmine', 'jasmin', 'jasemine', 'bela'] },
  { id: 'saffron', label: 'Saffron', aliases: ['saffron'] },
  { id: 'patchouli', label: 'Patchouli', aliases: ['patchouli'] },
  { id: 'bergamot', label: 'Bergamot', aliases: ['bergamot', 'bergamont', 'bergomot'] },
  { id: 'citrus', label: 'Citrus', aliases: ['citrus', 'citruses', 'lemon', 'lime', 'orange', 'mandarin', 'grapefruit', 'tangerine', 'yuzu'] },
  { id: 'lavender', label: 'Lavender', aliases: ['lavender'] },
  { id: 'vetiver', label: 'Vetiver', aliases: ['vetiver', 'vativer', 'khus'] },
  { id: 'cedar', label: 'Cedarwood', aliases: ['cedar', 'cedarwood'] },
  { id: 'incense', label: 'Incense', aliases: ['incense', 'frankincense', 'olibanum', 'bakhoor', 'luban'] },
  { id: 'tobacco', label: 'Tobacco', aliases: ['tobacco'] },
  { id: 'leather', label: 'Leather', aliases: ['leather', 'suede'] },
  { id: 'cardamom', label: 'Cardamom', aliases: ['cardamom', 'cardamon'] },
  { id: 'cinnamon', label: 'Cinnamon', aliases: ['cinnamon'] },
  { id: 'tonka', label: 'Tonka Bean', aliases: ['tonka'] },
  { id: 'honey', label: 'Honey', aliases: ['honey', 'honeyed'] },
  { id: 'caramel', label: 'Caramel', aliases: ['caramel', 'praline'] },
  { id: 'chocolate', label: 'Chocolate', aliases: ['chocolate', 'cocoa', 'cacao'] },
  { id: 'coconut', label: 'Coconut', aliases: ['coconut'] },
  { id: 'apple', label: 'Apple', aliases: ['apple'] },
  { id: 'pineapple', label: 'Pineapple', aliases: ['pineapple'] },
  { id: 'peach', label: 'Peach', aliases: ['peach'] },
  { id: 'berries', label: 'Berries', aliases: ['berries', 'berry', 'raspberry', 'strawberry', 'blueberry', 'cranberry', 'cassis', 'black currant'] },
  { id: 'mint', label: 'Mint', aliases: ['mint', 'minty'] },
  { id: 'geranium', label: 'Geranium', aliases: ['geranium'] },
  { id: 'iris', label: 'Iris', aliases: ['iris', 'orris'] },
  { id: 'oakmoss', label: 'Oakmoss', aliases: ['oakmoss', 'moss'] },
  { id: 'pepper', label: 'Pepper', aliases: ['pepper'] },
  { id: 'neroli', label: 'Neroli', aliases: ['neroli', 'orange blossom', 'orange blossoms'] },
  { id: 'lily', label: 'Lily', aliases: ['lily', 'lily-of-the-valley'] },
  { id: 'lotus', label: 'Lotus', aliases: ['lotus'] },
  { id: 'nutmeg', label: 'Nutmeg', aliases: ['nutmeg'] },
  { id: 'ginger', label: 'Ginger', aliases: ['ginger'] },
];

/** When to wear it, read from the product's "best for" list. */
export const OCCASIONS: TaxonomyEntry[] = [
  { id: 'daily', label: 'Everyday', aliases: ['everyday', 'daily', 'casual', 'lifestyle'] },
  { id: 'office', label: 'Office', aliases: ['office', 'work', 'corporate', 'professional'] },
  { id: 'party', label: 'Party', aliases: ['party', 'parties', 'night-out', 'nights out', 'going out', 'social'] },
  { id: 'date', label: 'Date night', aliases: ['date', 'dates', 'dating', 'romantic'] },
  { id: 'formal', label: 'Formal events', aliases: ['formal', 'gala', 'reception', 'black-tie', 'upscale', 'special occasions', 'special occasion', 'special events'] },
  { id: 'wedding', label: 'Wedding', aliases: ['wedding', 'weddings'] },
  { id: 'prayer', label: 'Prayer', aliases: ['prayer', 'namaz', 'jummah', 'hajj', 'spiritual', 'meditation'] },
  { id: 'traditional', label: 'Traditional occasions', aliases: ['traditional', 'cultural', 'festive'] },
  { id: 'gift', label: 'Gifting', aliases: ['gift', 'gifting'] },
];

export const TIMES: TaxonomyEntry[] = [
  { id: 'day', label: 'Daytime', aliases: ['day', 'daytime'] },
  { id: 'night', label: 'Evening', aliases: ['evening', 'evenings', 'evining', 'night', 'nights'] },
];

export const SEASONS: TaxonomyEntry[] = [
  { id: 'summer', label: 'Hot weather', aliases: ['summer', 'spring', 'warm weather', 'hot', 'humid'] },
  { id: 'winter', label: 'Cool weather', aliases: ['winter', 'cold', 'cooler', 'cool weather', 'cool'] },
  { id: 'rainy', label: 'Rainy season', aliases: ['rainy'] },
];

// Longevity / projection are stored as fixed codes. Labels are deliberately plain and make no
// promise in hours: how long a scent lasts depends on skin, weather and how much is applied.
export const LONGEVITY: { id: string; label: string; hint: string; codes: string[] }[] = [
  { id: 'light', label: 'Light', hint: 'Fades in a few hours', codes: ['VERY_WEAK', 'WEAK'] },
  { id: 'moderate', label: 'Moderate', hint: 'Lasts through part of the day', codes: ['MODERATE'] },
  { id: 'long', label: 'Long-lasting', hint: 'Stays most of the day', codes: ['LONG_LASTING'] },
  { id: 'very_long', label: 'Very long-lasting', hint: 'Still there the next morning', codes: ['ETERNAL'] },
];

export const PROJECTION: { id: string; label: string; hint: string; codes: string[] }[] = [
  { id: 'close', label: 'Close to skin', hint: 'Only people near you notice', codes: ['INTIMATE', 'CLOSE'] },
  { id: 'moderate', label: 'Moderate', hint: 'Noticed at arm’s length', codes: ['MODERATE'] },
  { id: 'strong', label: 'Strong', hint: 'Fills the room, gets noticed', codes: ['STRONG', 'NUCLEAR'] },
];

export const GENDERS: { id: string; label: string; codes: string[] }[] = [
  { id: 'men', label: 'For him', codes: ['MALE', 'UNISEX'] },
  { id: 'women', label: 'For her', codes: ['FEMALE', 'UNISEX'] },
];

// Words customers type that mean something in the taxonomy. Left side is what is typed
// (English, Banglish or Bangla); right side is the words the search should look for instead.
export const SEARCH_SYNONYMS: Record<string, string[]> = {
  // spellings
  oudh: ['oud'], aoud: ['oud'], ud: ['oud'], oodh: ['oud'], agar: ['oud'], agarwood: ['oud'],
  attor: ['attar'], ator: ['attar'], atar: ['attar'], atr: ['attar'], ittar: ['attar'], itr: ['attar'],
  parfume: ['perfume'], parfum: ['perfume'], purfume: ['perfume'], perfum: ['perfume'],
  bakhur: ['bakhoor'], bukhoor: ['bakhoor'], bakhor: ['bakhoor'],
  mishk: ['musk'], misk: ['musk'], kasturi: ['musk'], kosturi: ['musk'],
  golap: ['rose'], gulab: ['rose'],
  chondon: ['sandalwood'], chandan: ['sandalwood'], sandal: ['sandalwood'],
  jafran: ['saffron'], zafran: ['saffron'], zafraan: ['saffron'],
  beli: ['jasmine'], juhi: ['jasmine'], jui: ['jasmine'],
  misti: ['sweet'], mishti: ['sweet'], mitha: ['sweet'],
  lebu: ['citrus'],
  // intent words
  mens: ['men'], man: ['men'], male: ['men'], boys: ['men'], gents: ['men'], him: ['men'],
  womens: ['women'], woman: ['women'], female: ['women'], ladies: ['women'], girls: ['women'], her: ['women'],
  longlasting: ['long', 'lasting'],
  cheap: [], budget: [],
  // Bangla
  'আতর': ['attar'], 'পারফিউম': ['perfume'], 'সুগন্ধি': ['perfume'], 'তেল': ['oil'],
  'উদ': ['oud'], 'ঊদ': ['oud'], 'আউদ': ['oud'], 'অউদ': ['oud'],
  'গোলাপ': ['rose'], 'রোজ': ['rose'],
  'কস্তুরী': ['musk'], 'কস্তুরি': ['musk'], 'মাস্ক': ['musk'], 'মিশক': ['musk'],
  'চন্দন': ['sandalwood'], 'জাফরান': ['saffron'],
  'বেলি': ['jasmine'], 'জুঁই': ['jasmine'], 'জেসমিন': ['jasmine'],
  'ভ্যানিলা': ['vanilla'], 'আম্বার': ['amber'], 'অ্যাম্বার': ['amber'],
  'বাখুর': ['bakhoor'], 'মুখাল্লাত': ['mukhallat'],
  'মিষ্টি': ['sweet'], 'ফ্রেশ': ['fresh'], 'সতেজ': ['fresh'], 'ফুলেল': ['floral'], 'ফুল': ['floral'],
  'কাঠ': ['woody'], 'উডি': ['woody'], 'মশলাদার': ['spicy'], 'লেবু': ['citrus'], 'ফল': ['fruity'],
  'ছেলেদের': ['men'], 'পুরুষ': ['men'], 'পুরুষদের': ['men'],
  'মেয়েদের': ['women'], 'নারী': ['women'], 'মহিলা': ['women'], 'মহিলাদের': ['women'],
  'অফিস': ['office'], 'উপহার': ['gift'], 'গিফট': ['gift'], 'বিয়ে': ['wedding'], 'নামাজ': ['prayer'],
  'দীর্ঘস্থায়ী': ['long', 'lasting'], 'কম্বো': ['combo'], 'প্যাকেজ': ['package'],
};

// Words that describe every product; they add nothing to a search and are never required.
export const GENERIC_WORDS = new Set([
  'perfume', 'perfumes', 'fragrance', 'fragrances', 'scent', 'scents', 'smell', 'smells', 'oil', 'oils',
  'for', 'the', 'a', 'an', 'and', 'or', 'with', 'of', 'in', 'to', 'me', 'my', 'i', 'want', 'need', 'something',
  'best', 'good', 'buy', 'price', 'bd', 'bangladesh', 'like', 'that', 'is', 'type', 'notes', 'note', 'very',
]);
