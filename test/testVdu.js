import { expect } from 'chai';
import { miToState } from '../src/services/vdu';

describe('VDU', function () {

  it('should parse MI', function () {

    INFO.forEach(([src, cls, state]) => {
      const res = miToState(src);
      expect(res.class).equal(cls);
      expect(res.state).eql(state);
    });


  });

});

const INFO = [
  ['vksm., es. l., 2 asm., dgs.', 'vksm.', ['esam.l.', 'IIasm.', 'dgsk.']],
  ['dkt., vyr. g., dgs. vard.', 'dkt.', ['vyr.gim.', 'dgsk.', 'V.']],
];
