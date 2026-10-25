// Input cleanup shared by the cache, VDU and engine lookups.

// The engine has fixed buffers sized for 50-letter words; the frontend allows 30
export const MAX_WORD_LENGTH = 40;
// Stress marks a user may paste with the word; the sources only know plain letters
const STRESS_MARKS = /[\u0300\u0301\u0303]/g;

// The word trimmed and without stress marks, or undefined if it is not a single word of sane length
export function plainWord(text: string): string | undefined {
  const word = text.trim().normalize('NFD').replace(STRESS_MARKS, '').normalize('NFC');
  if (!word || word.length > MAX_WORD_LENGTH || /\s/.test(word)) {
    return undefined;
  }
  return word;
}
