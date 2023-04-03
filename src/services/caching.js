import { sIsMemberAsync, saddAsync, hgetAsync, hsetAsync } from 'sistemium-redis';
import log from 'sistemium-debug';
import { upperFirst } from 'lodash';

const WORDS_HASH = 'kirtis_found_words';
const NOT_FOUND_SET = 'kirtis_not_found_words';

const { debug } = log('caching');

export async function findCached(word) {
  const cached = await hgetAsync(WORDS_HASH, normalizeKey(word));
  debug('findCached:', word, cached);
  return cached && JSON.parse(cached);
}

export async function saveCached(word, data) {
  const cached = JSON.stringify(data);
  hsetAsync(WORDS_HASH, normalizeKey(word), cached);
  debug('saveCached:', word, cached);
}

export async function saveNotFound(word) {
  saddAsync(NOT_FOUND_SET, normalizeKey(word));
  debug('saveNotFound:', word);
}

export async function isNotFound(word) {
  const notFound = await sIsMemberAsync(NOT_FOUND_SET, normalizeKey(word));
  debug('findCached:', word, notFound);
  return !!notFound;
}

function normalizeKey(text) {
  return upperFirst(text.toLocaleLowerCase());
}
