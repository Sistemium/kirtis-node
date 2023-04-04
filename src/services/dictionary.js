import strp from '../static/strp.json';

import log from 'sistemium-debug';

const { debug } = log('dictionary');

export async function shortenings(ctx) {
  ctx.body = strp;
}
