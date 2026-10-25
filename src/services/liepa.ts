// Stresses words that are not in the cache with the LIEPA engine (src/phonology).
import { upperFirst } from 'lodash';
import log from 'sistemium-debug';
import type { AccentInfo } from './caching';
import { loadPhonologyEngine } from '../phonology';
import { wordEntries } from '../phonology/grammar';
import { plainWord } from './words';

const { debug } = log('liepa');

export async function stressWithLiepa(word: string): Promise<AccentInfo[]> {
  const text = plainWord(word);
  if (!text) {
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
