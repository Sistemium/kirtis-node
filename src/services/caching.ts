import * as redis from 'sistemium-redis';
import log from 'sistemium-debug';
import lo, { upperFirst } from 'lodash';
import { mapSeries } from 'async';
import { hgetAsync } from 'sistemium-redis';

const WORDS_HASH = 'kirtis_found_words';
const DICTIONARY_KEY = 'mixed_accent_words';
const ACCENTUATED_WORDS = 'accentuated_words';

const { debug } = log('caching');

// One accented form of a word with its part of speech and grammatical features
export interface AccentInfo {
  word: string
  class?: string
  state: string[]
  // Set to 'liepa' when the stress engine produced the entry; cached VDU entries have none
  source?: string
}

export async function findCached(word: string): Promise<AccentInfo[]> {
  const cached = await redis.hgetAsync(WORDS_HASH, normalizeKey(word));
  debug('findCached:', word, cached);
  const parsed: AccentInfo[] | undefined = cached && JSON.parse(cached);
  return lo.filter(parsed, ({ state }) => state?.length) as AccentInfo[];
}

function normalizeKey(text: string) {
  return upperFirst(text.toLocaleLowerCase());
}

export async function matchingWords(word: string) {
  const noAccent = word.toLowerCase();
  const res = await redis.zRangeByLex(DICTIONARY_KEY, `[${noAccent}`, `[${noAccent}ž`, 'LIMIT', '0', '60');
  debug('matchingWords', word, res.length);
  return matchAccents(res);
}

export async function matchAccents(words: string[]): Promise<string[]> {
  const res = await mapSeries(words, async (word: string) => {
    const accents = await hgetAsync(ACCENTUATED_WORDS, word) || '';
    return accents.split(',');
  });
  return [...words, ...lo.filter(lo.flatten(res))]
    .sort(lCompare);
}

function lCompare(a: string, b: string): number {

  let res = 0;

  lo.each(a, (l, i) => {
    res = i < b.length ? l.localeCompare(b[i]) : -1;
    return !res;
  });

  return res || (a.length - b.length);

}
