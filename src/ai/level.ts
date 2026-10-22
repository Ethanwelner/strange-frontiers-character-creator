// A level the player asked for in their description: "a level 5 Isek",
// "5th-level", "level five", "lvl 5". The describe server builds at that level
// instead of the campaign's starting level. Levels run 1 to 20.
const WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];
const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
];
export const MAX_LEVEL = 20;

const NUMBER = `(\\d{1,2}|${WORDS.join("|")})`;
const ORDINAL = `(\\d{1,2})(?:st|nd|rd|th)|(${ORDINALS.join("|")})`;
const AFTER = new RegExp(`\\b(?:level|lvl|lv)[\\s-]*${NUMBER}\\b`, "i");
const BEFORE = new RegExp(`\\b(?:${ORDINAL})[\\s-]+(?:level|lvl)\\b`, "i");

function toLevel(token: string | undefined, words: string[]): number | undefined {
  if (!token) return undefined;
  const n = /^\d+$/.test(token) ? Number(token) : words.indexOf(token.toLowerCase()) + 1;
  return n >= 1 && n <= MAX_LEVEL ? n : undefined;
}

export function levelFromDescription(text: string): number | undefined {
  const after = AFTER.exec(text);
  if (after) return toLevel(after[1], WORDS);
  const before = BEFORE.exec(text);
  if (before) return toLevel(before[1], ORDINALS) ?? toLevel(before[2], ORDINALS);
  return undefined;
}
