// Prints what the stress engine returns for some words: npm run phonology:demo -- [word ...]
import { loadPhonologyEngine } from './index';

const SAMPLE = [
  // README examples of phonology_engine: kačiùkas, pérbėgo, kẽlią
  'kačiukas', 'perbėgo', 'kelią',
  // Words with more than one stress (homographs)
  'antis', 'kasa', 'pilis', 'dvaras',
  // Everyday words in different forms
  'mama', 'mamos', 'galva', 'rankomis', 'kalbėti', 'kalbėjome', 'gražus', 'gražiausia',
  'gerai', 'ačiū', 'universitetas', 'kompiuteris', 'Vilnius',
  // Not a word
  'qqqzzzx',
];

async function main() {
  const engine = await loadPhonologyEngine();
  const words = process.argv.slice(2).length ? process.argv.slice(2) : SAMPLE;
  for (const input of words) {
    const result = engine.stressWord(input);
    if (!result || !result.options.length) {
      console.log(`${input}: no stress`);
      continue;
    }
    const picked = result.selected === null ? undefined : result.options[result.selected];
    console.log(`${input} → ${picked?.stressed}`);
    for (const option of result.options) {
      const grammar = option.state.length ? ` ${option.state.join(' ')}` : '';
      console.log(`    ${option.stressed}  ${option.accent}, ${option.group}${grammar}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
