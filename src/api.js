import Koa from 'koa';
import koaBody from 'koa-bodyparser';
import logger from 'koa-logger';
import Router from '@koa/router';
import { defaultRoutes } from 'sistemium-mongo/lib/api';
import { map } from 'lodash';
import assert from 'sistemium-mongo/lib/assert';
import log from 'sistemium-debug';
import krc, { getVdu } from './controllers/krc';
// import auth from './api/auth';

import models, { connect } from './models';

const { PORT } = process.env;
const app = new Koa();
const router = new Router();
const { debug } = log('api');

defaultRoutes(router, map(models));

router.get('/krc/:word', krc);
router.get('/vdu/:word', getVdu);

app
  .use(logger())
  .use(koaBody())
  // .use(auth)
  .use(router.routes());


if (!module.parent) {

  assert(PORT, 'PORT must be specified');

  connect()
    // .then(archiveConnect)
    .then(() => {
      app.listen(PORT);
      debug('PORT', PORT);
    });

}

export default app;
