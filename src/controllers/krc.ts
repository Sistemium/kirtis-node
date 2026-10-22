import { findCached } from '../services/caching';
import { Context } from 'koa';

// Serves only words already in the Redis cache: the VDU source is gone
export default async function(ctx: Context) {
  const { word } = ctx.params;
  const cached = await findCached(word);
  if (!cached.length) {
    ctx.throw(404, 'Not a word');
  }
  ctx.body = cached;
}
