import { Context } from 'koa';
import log from 'sistemium-debug';
import { AccentInfo, findCached, saveCached } from '../services/caching';
import { stressWithLiepa } from '../services/liepa';
import { accentInfoToStates, askVdu } from '../services/vdu';
import { plainWord } from '../services/words';

const { error } = log('krc');

// Order of sources: the Redis cache, then VDU, then the LIEPA engine when VDU cannot answer
// or does not know the word. Both VDU and engine answers are cached. A cached engine answer
// (entries with source "liepa") is provisional: VDU is asked again and its answer replaces it.
export default async function(ctx: Context) {
  const word = plainWord(ctx.params.word);
  if (!word) {
    ctx.throw(404, 'Not a word');
  }
  const cached = await findCached(word);
  if (isVduAnswer(cached)) {
    ctx.body = cached;
    return;
  }
  const fromVdu = await stressWithVdu(word);
  if (fromVdu.length) {
    await saveQuietly(word, fromVdu);
    ctx.body = fromVdu;
    return;
  }
  const fromLiepa = await stressWithLiepa(word);
  if (!fromLiepa.length) {
    ctx.throw(404, 'Not a word');
  }
  if (JSON.stringify(fromLiepa) !== JSON.stringify(cached)) {
    await saveQuietly(word, fromLiepa);
  }
  ctx.body = fromLiepa;
}

// VDU entries carry no source; a cache value never mixes VDU and engine entries
function isVduAnswer(entries: AccentInfo[]): boolean {
  return entries.length > 0 && entries.every((entry) => !entry.source);
}

async function stressWithVdu(word: string): Promise<AccentInfo[]> {
  try {
    return accentInfoToStates(await askVdu(word));
  } catch {
    // askVdu has logged why VDU could not answer
    return [];
  }
}

// A failed write must not lose the answer
async function saveQuietly(word: string, entries: AccentInfo[]) {
  await saveCached(word, entries)
    .catch((e) => error('saveCached:', word, (e as Error).message));
}
