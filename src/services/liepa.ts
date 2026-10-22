// Stresses words that are not in the cache with the LIEPA engine (src/phonology).
import { upperFirst } from 'lodash';
import log from 'sistemium-debug';
import type { AccentInfo } from './caching';
import { loadPhonologyEngine } from '../phonology';
import { wordEntries } from '../phonology/grammar';

// The engine has fixed buffers sized for 50-letter words; the frontend allows 30
const MAX_WORD_LENGTH = 40;
// Stress marks a user may paste with the word; the engine only knows plain letters
const STRESS_MARKS = /[\u0300\u0301\u0303]/g;

const { debug } = log('liepa');

export async function stressWithLiepa(word: string): Promise<AccentInfo[]> {
  const text = word.trim().normalize('NFD').replace(STRESS_MARKS, '').normalize('NFC');
  if (!text || text.length > MAX_WORD_LENGTH || /\s/.test(text)) {
    return [];
  }
  const engine = await loadPhonologyEngine();
  let words;
  try {
    // Same spelling as the cache keys, so entries look like the cached VDU ones
    words = engine.stressPhrase(upperFirst(text.toLocaleLowerCase('lt')));
  } catch (error) {
    // Letters outside Windows-1257
    debug('stressWithLiepa:', word, (error as Error).message);
    return [];
  }
  if (words.length !== 1) {
    return [];
  }
  const entries = wordEntries(words[0]);
  debug('stressWithLiepa:', word, entries.length);
  return entries;
}
