import Koa from 'koa';
import koaBody from 'koa-bodyparser';
import logger from 'koa-logger';
import Router from '@koa/router';
import { defaultRoutes } from 'sistemium-mongo/lib/api';
import { map } from 'lodash';
import assert from 'sistemium-mongo/lib/assert';
import log from 'sistemium-debug';
import krc, { getVdu } from './controllers/krc';
import models, { connect } from './models';
import suggestions from './controllers/suggestions';
import shortenings from './controllers/shortenings';

const { PORT } = process.env;
const app = new Koa();
const router = new Router();
const { debug } = log('api');

defaultRoutes(router, map(models));

router.get('/krc/:word', krc);
router.get('/vdu/:word', getVdu);
router.get('/zodynas/:word', suggestions);
router.get('/strp', shortenings);

app
  .use(logger())
  .use(koaBody())
  // .use(auth)
  .use(router.routes());


if (require.main === module) {

  assert(PORT, 'PORT must be specified');

  connect()
    // .then(archiveConnect)
    .then(() => {
      app.listen(PORT);
      debug('PORT', PORT);
    });

}

export default app;
