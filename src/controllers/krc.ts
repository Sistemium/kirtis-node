import { findCached, isNotFound, saveCached, saveNotFound } from '../services/caching';
import vdu, { accentInfoToStates } from '../services/vdu';
// import { axios } from 'sistemium-data/types/util/axios';


export default async function(ctx) {
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
    ctx.throw(404, 'Not a vtu word');
  }
  const res = accentInfoToStates(proxy);
  await saveCached(word, res);
  ctx.body = res;
}


export async function getVdu(ctx) {
  const { word } = ctx.params;
  ctx.body = await vdu(word);
}
