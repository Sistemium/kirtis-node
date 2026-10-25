import fs from 'fs';
import path from 'path';
import { expect } from 'chai';
import { accentInfoToStates, miToState, parseVduResponse } from '../src/services/vdu';
import { plainWord } from '../src/services/words';

// Real VDU answers saved on 2026-10-25
function fixture(word) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `vdu-${word}.json`), 'utf8'));
}

// Shorter view of entries: "word class [state]", forms NFC-normalized (VDU sends NFD)
function view(entries) {
  return entries.map((e) => `${e.word.normalize('NFC')} ${e.class} [${e.state.join(' ')}]`);
}

describe('VDU', function () {

  it('should parse the current response format', function () {
    expect(view(accentInfoToStates(parseVduResponse(fixture('kasa'))))).eql([
      'kãsa dktv. [mot.gim. vnsk. Š.]',
      'kãsa vksm. [esam.l. IIIasm.]',
      'kasà dktv. [mot.gim. vnsk. Įn.]',
      'kasà dktv. [mot.gim. vnsk. V.]',
    ]);
  });

  it('should keep classes without features, like adverbs', function () {
    expect(view(accentInfoToStates(parseVduResponse(fixture('gerai'))))).eql([
      'geraĩ prvks. []',
      'gẽrai bdvr. [mot.gim. vnsk. N.]',
    ]);
  });

  it('should return nothing for words VDU does not know', function () {
    expect(parseVduResponse(fixture('qqqzzzx'))).eql([]);
    const unstressed = { code: 200, message: '[[{"accented":["radikulitams"],"information":[]}]]' };
    expect(accentInfoToStates(parseVduResponse(unstressed))).eql([]);
  });

  it('should still parse the old response format', function () {
    const [items] = JSON.parse(fixture('kasa').message);
    const old = { message: JSON.stringify({ accentInfo: items }) };
    expect(view(accentInfoToStates(parseVduResponse(old)))).length(4);
  });

  it('should reject a body it does not understand', function () {
    expect(() => parseVduResponse({ error: 'oops' })).throw('Unexpected VDU response');
    expect(() => parseVduResponse(undefined)).throw('Unexpected VDU response');
  });

  it('should parse MI', function () {
    INFO.forEach(([src, cls, state]) => {
      const res = miToState(src);
      expect(res.class).equal(cls);
      expect(res.state).eql(state);
    });
  });

});

describe('Input cleanup', function () {

  it('should trim the word and strip pasted stress marks', function () {
    expect(plainWord('  mama ')).equal('mama');
    expect(plainWord('Kačiùkas')).equal('Kačiukas');
    expect(plainWord('ąžuolas')).equal('ąžuolas');
  });

  it('should reject phrases, empty and overlong input', function () {
    expect(plainWord('labas rytas')).equal(undefined);
    expect(plainWord('   ')).equal(undefined);
    expect(plainWord('a'.repeat(41))).equal(undefined);
  });

});

const INFO = [
  ['vksm., es. l., 2 asm., dgs.', 'vksm.', ['esam.l.', 'IIasm.', 'dgsk.']],
  ['dkt., vyr. g., dgs. vard.', 'dktv.', ['vyr.gim.', 'dgsk.', 'V.']],
];
