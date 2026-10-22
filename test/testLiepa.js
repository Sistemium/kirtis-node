import { expect } from 'chai';
import { stressWithLiepa } from '../src/services/liepa';

// Shorter view of entries: "word class [state]"
async function stress(word) {
  const entries = await stressWithLiepa(word);
  entries.forEach((entry) => expect(entry.source).equal('liepa'));
  return entries.map((entry) => `${entry.word} ${entry.class} [${entry.state.join(' ')}]`);
}

describe('LIEPA stress engine', function () {

  this.timeout(10000);

  it('should stress nouns with gender, number and case', async function () {
    expect(await stress('Kačiukas')).eql(['Kačiùkas dktv. [vyr.gim. vnsk. V.]']);
  });

  it('should list every reading of a homograph, the picked one first', async function () {
    expect(await stress('Kasa')).eql([
      'Kãsa vksm. [esam.l. IIIasm. vnsk. nesngr.]',
      'Kãsa vksm. [esam.l. IIIasm. dgsk. nesngr.]',
      'Kasà dktv. [mot.gim. vnsk. V.]',
      'Kasà dktv. [mot.gim. vnsk. Įn.]',
    ]);
  });

  it('should decode verb forms from the endings table', async function () {
    expect(await stress('Perbėgo')).eql([
      'Pérbėgo vksm. [būt.kart.l. IIIasm. vnsk. nesngr.]',
      'Pérbėgo vksm. [būt.kart.l. IIIasm. dgsk. nesngr.]',
    ]);
    expect(await stress('Dirbk')).eql(['Dìrbk vksm. [Liep. IIasm. vnsk. nesngr.]']);
    expect(await stress('Skaudinama')).eql([
      'Skaũdinama dlv. [mot.gim. esam.l. vnsk. V. neįvardž. nesngr. neveik.r.]',
    ]);
  });

  it('should mark adjectives and uninflected words', async function () {
    expect(await stress('Gražus')).eql(['Gražùs bdvr. [vnsk. V.]']);
    expect(await stress('Ačiū')).eql(['Ãčiū nekait. []']);
  });

  it('should write an acute in a mixed diphthong as a grave', async function () {
    expect(await stress('Durpių')).eql(['Dùrpių dktv. [mot.gim. dgsk. K.]']);
  });

  it('should ignore stress marks pasted with the word', async function () {
    expect(await stress('Kačiùkas')).eql(['Kačiùkas dktv. [vyr.gim. vnsk. V.]']);
  });

  it('should return nothing for non-words and bad input', async function () {
    for (const word of ['Qqqzzzx', 'labas rytas', 'naïve', '', 'a'.repeat(41)]) {
      expect(await stressWithLiepa(word), word).eql([]);
    }
  });

});
