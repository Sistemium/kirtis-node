import { findCached } from '../services/caching';
import { stressWithLiepa } from '../services/liepa';
import { Context } from 'koa';

// Cached VDU entries come first; words missing from the cache are stressed by the LIEPA engine
export default async function(ctx: Context) {
  const { word } = ctx.params;
  const cached = await findCached(word);
  if (cached.length) {
    ctx.body = cached;
    return;
  }
  const stressed = await stressWithLiepa(word);
  if (!stressed.length) {
    ctx.throw(404, 'Not a word');
  }
  ctx.body = stressed;
}
