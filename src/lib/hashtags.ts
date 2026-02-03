/**
 * Hashtag Generator for Ved Kanalen
 *
 * Philosophy:
 * - No tacky hashtags (#foodporn, #yummy, #delicious)
 * - Mix of Danish and selective English
 * - Location-focused
 * - Relevant to actual content
 * - 6-10 hashtags per post (optimal for Instagram engagement)
 */

// Core brand hashtags - always include 2-3 of these
const BRAND_HASHTAGS = [
  'vedkanalen',
  'kanalbyen',
  'fredericia',
  'restaurantvedkanalen',
];

// Location/regional hashtags
const LOCATION_HASHTAGS = [
  'visitfredericia',
  'visitjylland',
  'lillebælt',
  'trekantområdet',
  'jylland',
  'detrigtigejylland',
];

// Food & dining (non-tacky)
const FOOD_HASHTAGS = [
  'frokost',
  'frokostklassiker',
  'bistro',
  'vinbar',
  'danskmad',
  'klassiskmad',
  'madmedsjæl',
  'ærligmad',
  'lokalmad',
  'sæsonmad',
];

// Atmosphere & culture
const ATMOSPHERE_HASHTAGS = [
  'hygge',
  'stemning',
  'lokaleliv',
  'fællesskab',
  'byhygge',
  'hverdagsluksus',
  'pausefrahverdagen',
];

// Renovation/transformation phase
const RENOVATION_HASHTAGS = [
  'ombygning',
  'renovering',
  'forandring',
  'transformation',
  'snartklarny',
  'nytkapitel',
  'fraenerestart',
];

// Behind the scenes / process
const PROCESS_HASHTAGS = [
  'bagomscenen',
  'restaurantliv',
  'køkkenlivet',
  'dethedderarbejde',
  'igang',
  'arbejdspågang',
];

// Drinks & wine
const DRINKS_HASHTAGS = [
  'vinogmad',
  'vinkort',
  'naturvin',
  'godvin',
  'ølogvin',
  'cheers',
];

// Weekend/timing
const WEEKEND_HASHTAGS = [
  'lørdagsfrokost',
  'søndagsbrunch',
  'weekendhygge',
  'fredagsbar',
];

// Keywords that indicate certain topics
const TOPIC_KEYWORDS = {
  renovation: ['ombygning', 'renovering', 'maler', 'gulv', 'væg', 'bygge', 'forandring', 'transformation'],
  food: ['mad', 'ret', 'menu', 'køkken', 'kok', 'frokost', 'aftensmad', 'smag', 'spisning'],
  drinks: ['vin', 'øl', 'drink', 'bar', 'glas', 'flaske', 'cheers', 'skål'],
  atmosphere: ['stemning', 'hygge', 'lys', 'lampe', 'indretning', 'udsigt', 'kanal'],
  team: ['vi', 'os', 'team', 'medarbejder', 'kok', 'tjener', 'kollega'],
  opening: ['åbning', 'åbner', 'snart', 'velkommen', 'første', 'premier'],
  weekend: ['lørdag', 'søndag', 'weekend', 'fredag'],
};

/**
 * Analyze text and pick relevant topic categories
 */
function analyzeTopics(text: string): string[] {
  const lowerText = text.toLowerCase();
  const topics: string[] = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => lowerText.includes(kw))) {
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * Pick random items from array
 */
function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate hashtags for a single post
 */
export function generateHashtags(
  seed: string,
  caption: string,
  dayNumber: number,
  _totalDays: number // Reserved for future use (e.g., weighting hashtags by campaign progress)
): string[] {
  const combinedText = `${seed} ${caption}`;
  const topics = analyzeTopics(combinedText);
  const hashtags: string[] = [];

  // 1. Always include 2 brand hashtags
  hashtags.push(...pickRandom(BRAND_HASHTAGS, 2));

  // 2. Add 1 location hashtag
  hashtags.push(...pickRandom(LOCATION_HASHTAGS, 1));

  // 3. Add topic-specific hashtags (2-3 per detected topic)
  if (topics.includes('renovation')) {
    hashtags.push(...pickRandom(RENOVATION_HASHTAGS, 2));
  }

  if (topics.includes('food')) {
    hashtags.push(...pickRandom(FOOD_HASHTAGS, 2));
  }

  if (topics.includes('drinks')) {
    hashtags.push(...pickRandom(DRINKS_HASHTAGS, 2));
  }

  if (topics.includes('atmosphere')) {
    hashtags.push(...pickRandom(ATMOSPHERE_HASHTAGS, 2));
  }

  if (topics.includes('team') || topics.includes('opening')) {
    hashtags.push(...pickRandom(PROCESS_HASHTAGS, 1));
  }

  if (topics.includes('weekend')) {
    hashtags.push(...pickRandom(WEEKEND_HASHTAGS, 1));
  }

  // 4. If not enough topics detected, add general food/atmosphere
  if (hashtags.length < 6) {
    hashtags.push(...pickRandom(FOOD_HASHTAGS, 2));
    hashtags.push(...pickRandom(ATMOSPHERE_HASHTAGS, 1));
  }

  // 5. Add variety based on day number to avoid repetition
  // Use day number as seed for slight variation
  if (dayNumber % 3 === 0) {
    hashtags.push('madoplevelse');
  } else if (dayNumber % 3 === 1) {
    hashtags.push('lokaltliv');
  } else {
    hashtags.push('godmad');
  }

  // 6. Deduplicate and limit to 8-10 hashtags
  const unique = [...new Set(hashtags)];
  const final = unique.slice(0, 10);

  // Return with # prefix
  return final.map((tag) => `#${tag}`);
}

/**
 * Generate hashtags for all posts in a batch
 */
export function generateAllHashtags(
  posts: Array<{ id: string; seed: string; caption: string; dayNumber: number }>
): Map<string, string[]> {
  const results = new Map<string, string[]>();
  const totalDays = posts.length;

  // Track used hashtags to encourage variety
  const recentlyUsed = new Set<string>();

  for (const post of posts) {
    let hashtags = generateHashtags(post.seed, post.caption, post.dayNumber, totalDays);

    // Try to avoid too much repetition from previous post
    if (recentlyUsed.size > 0) {
      const filtered = hashtags.filter((tag) => !recentlyUsed.has(tag));
      // Only use filtered if we still have enough
      if (filtered.length >= 6) {
        hashtags = filtered.slice(0, 10);
      }
    }

    results.set(post.id, hashtags);

    // Update recently used (keep last 5 posts worth of hashtags)
    hashtags.forEach((tag) => recentlyUsed.add(tag));
    if (recentlyUsed.size > 40) {
      // Clear oldest entries
      const arr = Array.from(recentlyUsed);
      arr.slice(0, 20).forEach((tag) => recentlyUsed.delete(tag));
    }
  }

  return results;
}

/**
 * Format hashtags for display/copying
 */
export function formatHashtags(hashtags: string[]): string {
  return hashtags.join(' ');
}
