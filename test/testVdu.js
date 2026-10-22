import { expect } from 'chai';
import { miToState } from '../src/services/vdu';
import { matchingWords } from '../src/services/caching';
import { client } from 'sistemium-redis';

/*
Needs a reachable Redis: set REDIS_HOST (and REDIS_DB if not 0)
 */

describe('VDU', function () {

  // The client connects on import, so it may already be ready here
  before(function (done) {
    if (client.ready) {
      done();
      return;
    }
    client.once('ready', () => done());
  });

  // An open connection keeps mocha from exiting
  after(function (done) {
    client.quit(() => done());
  });

  it('should parse MI', function () {

    INFO.forEach(([src, cls, state]) => {
      const res = miToState(src);
      expect(res.class).equal(cls);
      expect(res.state).eql(state);
    });

  });

  it('should find suggestions', async function () {

    const matching = await matchingWords('mama');
    expect(matching).eql([
      'mamai',
      'mama',
      'mamaites',
      'mamaite',
      'mamaitės',
      'mamaitės',
      'mamaitė',
      'mamaitė',
      'mamai',
      'mamas',
      'mamas',
      'mama',
      'mamą',
    ]);

  });

});

const INFO = [
  ['vksm., es. l., 2 asm., dgs.', 'vksm.', ['esam.l.', 'IIasm.', 'dgsk.']],
  ['dkt., vyr. g., dgs. vard.', 'dktv.', ['vyr.gim.', 'dgsk.', 'V.']],
];
