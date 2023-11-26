import strp from '../static/strp.json';
import { Context } from 'koa';

export default async function (ctx: Context) {
  ctx.body = strp;
}
