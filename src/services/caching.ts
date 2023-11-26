import * as redis from 'sistemium-redis';
import log from 'sistemium-debug';
import lo, { upperFirst } from 'lodash';
import { mapSeries } from 'async';
import { hgetAsync } from 'sistemium-redis';

const WORDS_HASH = 'kirtis_found_words';
const NOT_FOUND_SET = 'kirtis_not_found_words';
const DICTIONARY_KEY = 'mixed_accent_words';
const ACCENTUATED_WORDS = 'accentuated_words';

const { debug } = log('caching');

export async function findCached(word: string) {
  const cached = await redis.hgetAsync(WORDS_HASH, normalizeKey(word));
  debug('findCached:', word, cached);
  return cached && JSON.parse(cached);
}

export async function saveCached(word: string, data: any) {
  const cached = JSON.stringify(data);
  await redis.hsetAsync(WORDS_HASH, normalizeKey(word), cached);
  debug('saveCached:', word, cached);
}

export async function saveNotFound(word: string) {
  await redis.saddAsync(NOT_FOUND_SET, normalizeKey(word));
  debug('saveNotFound:', word);
}

export async function isNotFound(word: string) {
  const notFound = await redis.sIsMemberAsync(NOT_FOUND_SET, normalizeKey(word));
  debug('findCached:', word, notFound);
  return !!notFound;
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
