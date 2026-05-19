/**
 * Canonical post categories. Stored on `Post.category` as the lowercase slug;
 * UI renders the `label` instead. Adding a new category is a one-line change
 * here — no migration needed since the column is a free-form string.
 */
export type PostCategory = {
  slug: string;
  label: string;
  description: string;
  /** Optional emoji used as a placeholder when a category card has no media. */
  emoji: string;
};

export const POST_CATEGORIES: readonly PostCategory[] = [
  { slug: "photography", label: "Photography", description: "Lenses, light, and stories from photographers around the world.", emoji: "📷" },
  { slug: "art",         label: "Art",         description: "Paintings, sketches, digital art, and creative process.", emoji: "🎨" },
  { slug: "travel",      label: "Travel",      description: "Trips, itineraries, and views from the road.", emoji: "✈️" },
  { slug: "food",        label: "Food",        description: "Recipes, restaurants, and culinary experiments.", emoji: "🍜" },
  { slug: "tech",        label: "Tech",        description: "Software, hardware, and the rest of the digital frontier.", emoji: "💻" },
  { slug: "music",       label: "Music",       description: "Tracks, gigs, gear, and artists worth a follow.", emoji: "🎵" },
  { slug: "fitness",     label: "Fitness",     description: "Workouts, running routes, and training journeys.", emoji: "🏃" },
  { slug: "fashion",     label: "Fashion",     description: "Outfits, designers, and street style spotting.", emoji: "👗" },
  { slug: "gaming",      label: "Gaming",      description: "Playthroughs, streams, and gaming culture.", emoji: "🎮" },
  { slug: "education",   label: "Education",   description: "Study notes, tutorials, and learning communities.", emoji: "📚" },
  { slug: "business",    label: "Business",    description: "Founders, products, and lessons from the building floor.", emoji: "💼" },
  { slug: "pets",        label: "Pets",        description: "Cats, dogs, exotic friends — pet life shared.", emoji: "🐶" },
];

const BY_SLUG = new Map<string, PostCategory>(POST_CATEGORIES.map((c) => [c.slug, c]));

export function findPostCategoryBySlug(slug: string | undefined | null): PostCategory | null {
  if (!slug) return null;
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

export function isValidCategorySlug(value: string): boolean {
  return BY_SLUG.has(value.toLowerCase());
}
