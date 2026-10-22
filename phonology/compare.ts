// Compares the stress engine with the VDU answers cached in Redis (kirtis_found_words). Read-only.
// Usage: REDIS_HOST=... REDIS_DB=0 npm run phonology:compare -- [limit] [mismatches.tsv]
import fs from 'fs';
import { client } from 'sistemium-redis';
import { loadPhonologyEngine, PhonologyEngine, WordStress } from './index';

const WORDS_HASH = 'kirtis_found_words';
const CASES = new Set(['V.', 'K.', 'N.', 'G.', 'Įn.', 'Vt.', 'Š.']);
const NUMBERS = new Set(['vnsk.', 'dgsk.']);
const ACCENTS = /[̀́̃]/g;
const VOWELS = /[aąeęėiįyouųū]+/g;

interface VduEntry {
  word: string
  class?: string
  state?: string[]
}

interface Tally {
  [name: string]: number
}

function lower(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase('lt');
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(ACCENTS, '').normalize('NFC');
}

// Index of the stressed syllable: vowel groups starting at or before the accent mark.
// Works for marks on a vowel and for circumflex on l, m, n, r after a vowel.
function stressedSyllable(form: string): number {
  const decomposed = form.normalize('NFD');
  const markAt = decomposed.search(ACCENTS);
  if (markAt < 0) {
    return -1;
  }
  const base = decomposed.slice(0, markAt).replace(ACCENTS, '');
  const letter = base.length - 1;
  const plain = stripAccents(form);
  let count = 0;
  for (const match of plain.matchAll(VOWELS)) {
    if ((match.index ?? 0) <= letter) {
      count += 1;
    }
  }
  return count;
}

function caseNumber(state: string[] = []): string | undefined {
  const caseName = state.find((s) => CASES.has(s));
  const number = state.find((s) => NUMBERS.has(s));
  return caseName && number ? `${caseName} ${number}` : undefined;
}

function add(tally: Tally, name: string, by = 1) {
  tally[name] = (tally[name] || 0) + by;
}

function percent(part: number, whole: number): string {
  return whole ? `${(100 * part / whole).toFixed(1)}%` : '-';
}

async function* scanWords(limit: number): AsyncGenerator<[string, VduEntry[]]> {
  let cursor = '0';
  let seen = 0;
  do {
    const [next, items]: [string, string[]] = await new Promise((resolve, reject) => {
      client.hscan(WORDS_HASH, cursor, 'COUNT', '1000', (error: Error | null, reply: [string, string[]]) => (
        error ? reject(error) : resolve(reply)
      ));
    });
    cursor = next;
    for (let i = 0; i < items.length && seen < limit; i += 2) {
      seen += 1;
      yield [items[i], JSON.parse(items[i + 1])];
    }
  } while (cursor !== '0' && seen < limit);
}

function stressWord(engine: PhonologyEngine, word: string): WordStress | undefined | Error {
  try {
    return engine.stressWord(word);
  } catch (error) {
    return error as Error;
  }
}

// sistemium-redis connects on import and has no offline queue
function redisReady(): Promise<void> {
  return new Promise((resolve) => (client.ready ? resolve() : client.once('ready', () => resolve())));
}

async function main() {
  const limit = Number(process.argv[2]) || 50000;
  const mismatchFile = process.argv[3];
  const [engine] = await Promise.all([loadPhonologyEngine(), redisReady()]);
  const mismatches: string[] = [];

  const words: Tally = {};
  const byClass: Tally = {};
  const byClassFound: Tally = {};
  const grammar: Tally = {};

  for await (const [key, entries] of scanWords(limit)) {
    const word = lower(key);
    // Entries without an accent mark are words VDU did not know (often typos)
    const accented = entries.filter((e) => e.word.normalize('NFD').search(ACCENTS) >= 0);
    const vduForms = new Set(accented.map((e) => lower(e.word)));
    // Skip entries whose accented form is not this word (data noise)
    if ([...vduForms].some((form) => stripAccents(form) !== word)) {
      add(words, 'skippedNoise');
      continue;
    }

    const result = stressWord(engine, word);
    if (result instanceof Error) {
      add(words, 'encodeError');
      continue;
    }
    if (!vduForms.size) {
      add(words, 'vduUnknown');
      if (result?.options.length) add(words, 'vduUnknownEngineStressed');
      continue;
    }
    add(words, 'total');
    const options = result?.options ?? [];
    const engineForms = new Set(options.map((o) => lower(o.stressed)));
    const selected = result && result.selected !== null ? lower(options[result.selected].stressed) : undefined;
    const vduSyllables = new Set([...vduForms].map(stressedSyllable));

    if (!options.length) {
      add(words, 'noOptions');
    } else {
      add(words, 'withOptions');
      if (selected && vduForms.has(selected)) add(words, 'selectedExact');
      if (selected && vduSyllables.has(stressedSyllable(selected))) add(words, 'selectedSyllable');
      if ([...engineForms].some((f) => vduForms.has(f))) add(words, 'anyExact');
      if ([...engineForms].every((f) => vduForms.has(f))) add(words, 'allEngineCorrect');
      if ([...vduForms].every((f) => engineForms.has(f))) add(words, 'allVduFound');
    }
    if (vduForms.size > 1) {
      add(words, 'vduHomographs');
      if ([...vduForms].every((f) => engineForms.has(f))) add(words, 'vduHomographsAllFound');
    }

    // Recall per VDU part of speech: is this (form, class) among the engine's forms?
    const pairs = new Set(accented.map((e) => `${lower(e.word)}\t${e.class || '-'}`));
    for (const pair of pairs) {
      const [form, cls] = pair.split('\t');
      add(byClass, cls);
      if (engineForms.has(form)) add(byClassFound, cls);
    }

    // Grammar: for engine nominal options whose form VDU also has, does VDU list the same case and number?
    for (const option of options) {
      const form = lower(option.stressed);
      if (option.group !== 'nominal' || !vduForms.has(form)) continue;
      add(grammar, 'checked');
      const engineCase = option.state.join(' ');
      const vduCases = new Set(accented.filter((e) => lower(e.word) === form).map((e) => caseNumber(e.state)));
      if (vduCases.has(engineCase)) add(grammar, 'agree');
    }

    if (mismatchFile && !(selected && vduForms.has(selected))) {
      const vdu = accented.map((e) => `${lower(e.word)} ${e.class || ''}`).join(', ');
      const eng = options.map((o) => `${lower(o.stressed)} ${o.group}${o.state.length ? ` ${o.state.join(' ')}` : ''}`).join(', ');
      mismatches.push([word, selected || '-', vdu, eng || '-'].join('\t'));
    }
  }

  const total = words.total || 0;
  const withOptions = words.withOptions || 0;
  console.log(`Words compared: ${total} (skipped as noise: ${words.skippedNoise || 0}, encoding errors: ${words.encodeError || 0})`);
  console.log(`Words VDU did not know (no accent): ${words.vduUnknown || 0}, engine stressed ${words.vduUnknownEngineStressed || 0} of them`);
  console.log(`Engine found stress:            ${percent(withOptions, total)}  (${withOptions})`);
  console.log('Of the words the engine stressed:');
  console.log(`  picked form is a VDU form:    ${percent(words.selectedExact || 0, withOptions)}`);
  console.log(`  picked syllable is right:     ${percent(words.selectedSyllable || 0, withOptions)}`);
  console.log(`  some engine form matches VDU: ${percent(words.anyExact || 0, withOptions)}`);
  console.log(`  every engine form is in VDU:  ${percent(words.allEngineCorrect || 0, withOptions)}`);
  console.log(`  every VDU form found:         ${percent(words.allVduFound || 0, withOptions)}`);
  console.log(`Words with several VDU stresses: ${words.vduHomographs || 0}, all of them found: ${percent(words.vduHomographsAllFound || 0, words.vduHomographs || 0)}`);
  console.log(`Case and number agree with VDU (nominal options with a VDU form): ${percent(grammar.agree || 0, grammar.checked || 0)} of ${grammar.checked || 0}`);
  console.log('VDU forms found by the engine, by VDU part of speech:');
  Object.entries(byClass)
    .sort(([, a], [, b]) => b - a)
    .forEach(([cls, count]) => {
      console.log(`  ${cls.padEnd(12)} ${String(count).padStart(7)}  ${percent(byClassFound[cls] || 0, count)}`);
    });

  if (mismatchFile) {
    fs.writeFileSync(mismatchFile, `word\tengine picked\tVDU forms\tengine forms\n${mismatches.join('\n')}\n`);
    console.log(`Mismatches written to ${mismatchFile}: ${mismatches.length}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.quit());
