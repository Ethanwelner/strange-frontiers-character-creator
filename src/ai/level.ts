// A level the player asked for in their description: "a level 5 Isek",
// "5th-level", "level five", "lvl 5". The describe server builds at that level
// instead of the campaign's starting level. Levels run 1 to 25.
const WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "twenty-one", "twenty-two", "twenty-three", "twenty-four", "twenty-five",
];
const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
  "twenty-first", "twenty-second", "twenty-third", "twenty-fourth", "twenty-fifth",
];
export const MAX_LEVEL = 25;

// Longest first, so "twenty-five" isn't read as "twenty"; "twenty five" works too.
const alternatives = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace("-", "[\\s-]"))
    .join("|");
const NUMBER = `(\\d{1,2}|${alternatives(WORDS)})`;
const ORDINAL = `(\\d{1,2})(?:st|nd|rd|th)|(${alternatives(ORDINALS)})`;
const AFTER = new RegExp(`\\b(?:level|lvl|lv)[\\s-]*${NUMBER}\\b`, "i");
const BEFORE = new RegExp(`\\b(?:${ORDINAL})[\\s-]+(?:level|lvl)\\b`, "i");

function toLevel(token: string | undefined, words: string[]): number | undefined {
  if (!token) return undefined;
  const n = /^\d+$/.test(token) ? Number(token) : words.indexOf(token.toLowerCase().replace(/\s+/, "-")) + 1;
  return n >= 1 && n <= MAX_LEVEL ? n : undefined;
}

export function levelFromDescription(text: string): number | undefined {
  const after = AFTER.exec(text);
  if (after) return toLevel(after[1], WORDS);
  const before = BEFORE.exec(text);
  if (before) return toLevel(before[1], ORDINALS) ?? toLevel(before[2], ORDINALS);
  return undefined;
}
