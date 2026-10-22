// Turns stress engine options into kirtis entries: part of speech (class) and grammatical
// features (state), using the abbreviations of src/static/strp.json, as VDU entries do.
import type { AccentInfo } from '../services/caching';
import type { StressOption, WordStress } from './index';
import verbEndings from './engine/verb-endings.json';

export const SOURCE = 'liepa';

const CASES = ['V.', 'K.', 'N.', 'G.', 'Įn.', 'Vt.', 'Š.'];

// Stem types of the engine's noun/adjective dictionary (KamTipai in Kircdb.cpp).
// Numerals and pronouns are not named there; their ranges come from comparing with VDU.
const MASCULINE_NOUN_STEMS = new Set([0, 1, 2, 3, 4, 10, 11, 12, 13, 14, 34, 35]);
const FEMININE_NOUN_STEMS = new Set([5, 6, 7, 8, 9, 15, 36]);
const ADJECTIVE_STEMS = new Set([16, 18, 20, 22, 24, 26, 37, 39, 41]);
const isNumeralStem = (stem: number) => stem >= 44 && stem < 80;
const isPronounStem = (stem: number) => stem >= 80 && stem < 100;

// Codes of the verb endings table (defines at the top of vgal.h)
const PARTS_OF_SPEECH: Record<number, string> = {
  1: 'vksm.', // verb
  2: 'dlv.', // participle
  3: 'padlv.',
  4: 'psdlv.',
  5: 'vksm.', // infinitive
  6: 'būdn.',
  7: 'prvks.',
};
const PARTICIPLE = 2;
const HALF_PARTICIPLE = 4;
const VERB = 1;
const TENSES: Record<number, string> = { 1: 'esam.l.', 2: 'būt.kart.l.', 3: 'būt.d.l.', 4: 'būs.l.', 5: 'būt.l.' };
// VDU leaves the indicative mood out, so only the other two are shown
const MOODS: Record<number, string> = { 2: 'Liep.', 3: 'Tar.' };
const VOICES: Record<number, string> = { 1: 'veik.r.', 2: 'neveik.r.', 3: 'reikiamyb.' };
const PERSONS: Record<number, string> = { 1: 'Iasm.', 2: 'IIasm.', 3: 'IIIasm.' };
// "Singular and plural" and "masculine or feminine" become one entry for each, as VDU does
const NUMBERS: Record<number, string[]> = { 1: ['vnsk.'], 2: ['dgsk.'], 3: ['vnsk.', 'dgsk.'] };
const GENDERS: Record<number, string[]> = {
  1: ['vyr.gim.'], 2: ['mot.gim.'], 3: ['vyr.gim.', 'mot.gim.'], 4: ['bevrd.gim.'],
};
const PRONOMINAL: Record<number, string> = { 0: 'neįvardž.', 1: 'įvardž.' };

type VerbEnding = [
  pos: number, tense: number, moodVoice: number, personCase: number,
  number: number, gender: number, pronominal: number, reflexive: number,
];
const VERB_ENDINGS = verbEndings.rows as (VerbEnding | null)[];

function tags(...values: (string | undefined)[]): string[] {
  return values.filter((value): value is string => !!value);
}

function nominalEntries(stressed: string, grammarRule: number): AccentInfo[] {
  const stem = grammarRule >> 8;
  const caseIndex = grammarRule & 0xff;
  const number = caseIndex < 7 ? 'vnsk.' : 'dgsk.';
  const caseName = CASES[caseIndex % 7];
  if (ADJECTIVE_STEMS.has(stem)) {
    return [{ word: stressed, class: 'bdvr.', state: [number, caseName] }];
  }
  if (isNumeralStem(stem)) {
    return [{ word: stressed, class: 'sktv.', state: [number, caseName] }];
  }
  if (isPronounStem(stem)) {
    return [{ word: stressed, class: 'įvrd.', state: [number, caseName] }];
  }
  const gender = MASCULINE_NOUN_STEMS.has(stem) ? 'vyr.gim.' : FEMININE_NOUN_STEMS.has(stem) ? 'mot.gim.' : undefined;
  return [{ word: stressed, class: 'dktv.', state: tags(gender, number, caseName) }];
}

function verbEntries(stressed: string, grammarRule: number): AccentInfo[] {
  const ending = VERB_ENDINGS[grammarRule];
  if (!ending) {
    return [{ word: stressed, class: 'vksm.', state: [] }];
  }
  const [pos, tense, moodVoice, personCase, number, gender, pronominal, reflexive] = ending;
  const reflexivity = reflexive ? 'sngr.' : 'nesngr.';
  const entries: AccentInfo[] = [];
  for (const numberTag of NUMBERS[number] || [undefined]) {
    for (const genderTag of GENDERS[gender] || [undefined]) {
      let state: string[];
      if (pos === VERB) {
        state = tags(TENSES[tense], MOODS[moodVoice], PERSONS[personCase], numberTag, reflexivity);
      } else if (pos === PARTICIPLE || pos === HALF_PARTICIPLE) {
        state = tags(
          genderTag, TENSES[tense], numberTag, CASES[personCase - 1],
          PRONOMINAL[pronominal], reflexivity, VOICES[moodVoice],
        );
      } else {
        state = tags(TENSES[tense], reflexivity);
      }
      entries.push({ word: stressed, class: PARTS_OF_SPEECH[pos] || 'vksm.', state });
    }
  }
  return entries;
}

// Entries for one stress option, without the source mark
export function optionEntries(option: StressOption): AccentInfo[] {
  switch (option.group) {
    case 'nominal':
      return nominalEntries(option.stressed, option.grammarRule);
    case 'verb':
      return verbEntries(option.stressed, option.grammarRule);
    default:
      return [{ word: option.stressed, class: 'nekait.', state: [] }];
  }
}

// All entries for a word: the engine's picked option first, duplicates removed
export function wordEntries(word: WordStress): AccentInfo[] {
  const { options, selected } = word;
  const ordered = selected === null
    ? options
    : [options[selected], ...options.filter((_option, index) => index !== selected)];
  const seen = new Set<string>();
  const entries: AccentInfo[] = [];
  for (const entry of ordered.flatMap(optionEntries)) {
    const key = `${entry.word}|${entry.class}|${entry.state.join(' ')}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ ...entry, source: SOURCE });
    }
  }
  return entries;
}
