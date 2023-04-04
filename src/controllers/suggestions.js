import { matchingWords } from '../services/caching';

export default async function(ctx) {
  const { word } = ctx.params;
  ctx.assert(word, 400, 'Word is required');
  ctx.body = await matchingWords(word);
}
