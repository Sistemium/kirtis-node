import { Context } from 'koa';
import log from 'sistemium-debug';
import { AccentInfo, findCached, saveCached } from '../services/caching';
import { stressWithLiepa } from '../services/liepa';
import { accentInfoToStates, askVdu } from '../services/vdu';
import { plainWord } from '../services/words';

const { error } = log('krc');

// Order of sources: the Redis cache, then VDU (its answer is cached),
// then the LIEPA engine when VDU cannot answer or does not know the word
export default async function(ctx: Context) {
  const word = plainWord(ctx.params.word);
  if (!word) {
    ctx.throw(404, 'Not a word');
  }
  const cached = await findCached(word);
  if (cached.length) {
    ctx.body = cached;
    return;
  }
  const fromVdu = await stressWithVdu(word);
  if (fromVdu.length) {
    ctx.body = fromVdu;
    return;
  }
  const fromLiepa = await stressWithLiepa(word);
  if (!fromLiepa.length) {
    ctx.throw(404, 'Not a word');
  }
  ctx.body = fromLiepa;
}

async function stressWithVdu(word: string): Promise<AccentInfo[]> {
  let entries: AccentInfo[];
  try {
    entries = accentInfoToStates(await askVdu(word));
  } catch {
    // askVdu has logged why VDU could not answer
    return [];
  }
  if (entries.length) {
    // A failed write must not lose the answer
    await saveCached(word, entries)
      .catch((e) => error('saveCached:', word, (e as Error).message));
  }
  return entries;
}
