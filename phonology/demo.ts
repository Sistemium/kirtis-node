// Prints what /krc would return from the stress engine: npm run phonology:demo -- [word ...]
import { stressWithLiepa } from '../src/services/liepa';

const SAMPLE = [
  // README examples of phonology_engine: kačiùkas, pérbėgo, kẽlią
  'kačiukas', 'perbėgo', 'kelią',
  // Words with more than one stress (homographs)
  'antis', 'kasa', 'pilis',
  // Different parts of speech and forms
  'mamos', 'rankomis', 'kalbėjome', 'dirbk', 'skaudinama', 'gražus', 'ačiū', 'Vilnius',
  // Not a word
  'qqqzzzx',
];

async function main() {
  const words = process.argv.slice(2).length ? process.argv.slice(2) : SAMPLE;
  for (const word of words) {
    const entries = await stressWithLiepa(word);
    console.log(entries.length ? word : `${word}: no stress`);
    for (const entry of entries) {
      console.log(`    ${entry.word}  ${entry.class}  ${entry.state.join(' ')}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
