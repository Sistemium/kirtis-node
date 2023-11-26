import { findCached, isNotFound, saveCached, saveNotFound } from '../services/caching';
import vdu, { accentInfoToStates } from '../services/vdu';
import { Context } from 'koa';


export default async function(ctx: Context) {
  const { word } = ctx.params;
  const cached = await findCached(word);
  if (cached) {
    ctx.body = cached;
    return;
  }
  const notFound = await isNotFound(word);
  if (notFound) {
    ctx.throw(404, 'Not a word');
  }
  const proxy = await vdu(word);
  if (!proxy) {
    await saveNotFound(word);
    ctx.throw(404, 'Not a vdu word');
  }
  const res = accentInfoToStates(proxy);
  ctx.assert(res.length, 404);
  await saveCached(word, res);
  ctx.body = res;
}


export async function getVdu(ctx: Context) {
  const { word } = ctx.params;
  ctx.body = await vdu(word);
}
