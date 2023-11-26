import { matchingWords } from '../services/caching';
import { Context } from 'koa';

export default async function(ctx: Context) {
  const { word } = ctx.params;
  ctx.assert(word, 400, 'Word is required');
  ctx.body = await matchingWords(word);
}
