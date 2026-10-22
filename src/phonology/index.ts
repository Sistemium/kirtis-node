// TypeScript wrapper around the LIEPA word stress engine compiled to WebAssembly by build.sh.
// It mirrors the Python wrapper of aleksas/phonology_engine (pe_native.py, pe_output.py).

interface EngineModule {
  HEAPU8: Uint8Array
  HEAP32: Int32Array
  _malloc(size: number): number
  _free(ptr: number): void
  _PhonologyEngineInit(): number
  _PhonologyEngineProcessPhrase(text: number, pHandle: number): number
  _PhonologyEngineOutputFree(pHandle: number): number
  _PhonologyEngineOutputGetWordCount(handle: number, pValue: number): number
  _PhonologyEngineOutputGetWord(handle: number, wordIndex: number, pValue: number): number
  _PhonologyEngineOutputGetWordSyllables(handle: number, wordIndex: number, pValue: number): number
  _PhonologyEngineOutputGetWordStressOptionCount(handle: number, wordIndex: number, pValue: number): number
  _PhonologyEngineOutputGetWordStressOptionSelected(handle: number, wordIndex: number, pValue: number): number
  _PhonologyEngineOutputGetWordStressOption(
    handle: number, wordIndex: number, optionIndex: number,
    pLetterIndex: number, pStressType: number, pVocabulary: number, pGrammarRule: number,
  ): number
}

type EngineFactory = () => Promise<EngineModule>;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const createEngine: EngineFactory = require('./engine/phonology-engine.js');

export type Accent = 'grave' | 'acute' | 'circumflex';

// Which engine dictionary produced the option
export type WordGroup = 'verb' | 'uninflected' | 'nominal';

export interface StressOption {
  // The word with the accent mark, NFC-normalized
  stressed: string
  letterIndex: number
  accent: Accent
  group: WordGroup
  // Raw engine value, decoded by grammar.ts: the verb endings row for verbs,
  // stemType << 8 | case for nominal words, a word list index for uninflected words
  grammarRule: number
}

export interface WordStress {
  word: string
  // Letter indexes where syllables start, after the first one
  syllables: number[]
  // Index of the option the engine picked, or null when there are no options
  selected: number | null
  options: StressOption[]
}

// Engine stress types: 0 short (grave), 1 acute, 2 circumflex (tilde), 3 acute
const ACCENTS: Accent[] = ['grave', 'acute', 'circumflex', 'acute'];
const ACCENT_MARKS: Record<Accent, string> = {
  grave: '\u0300',
  acute: '\u0301',
  circumflex: '\u0303',
};
const GROUPS: WordGroup[] = ['verb', 'uninflected', 'nominal'];

// The engine works with Windows-1257 strings
const decoder = new TextDecoder('windows-1257');
const ENCODE = new Map<string, number>();
for (let byte = 1; byte < 256; byte += 1) {
  const char = decoder.decode(Uint8Array.of(byte));
  if (char !== '�' && !ENCODE.has(char)) {
    ENCODE.set(char, byte);
  }
}

function encode(text: string): Uint8Array {
  return Uint8Array.from(Array.from(text.normalize('NFC')), (char) => {
    const byte = ENCODE.get(char);
    if (byte === undefined) {
      throw new Error(`Cannot encode "${char}" in Windows-1257`);
    }
    return byte;
  });
}

export class PhonologyEngine {

  constructor(private readonly m: EngineModule) {
  }

  // Stresses every word of a phrase, without the engine's text normalization (numbers, abbreviations).
  // The engine only recognises uppercase text, so words are sent uppercased and returned in the original case.
  stressPhrase(text: string): WordStress[] {
    const { m } = this;
    const source = text.normalize('NFC');
    const upper = source.toLocaleUpperCase('lt');
    const textPtr = this.writeString(upper);
    const out = m._malloc(16);
    try {
      this.check(m._PhonologyEngineProcessPhrase(textPtr, out), 'ProcessPhrase');
      const handle = this.int(out);
      try {
        this.check(m._PhonologyEngineOutputGetWordCount(handle, out), 'GetWordCount');
        const count = this.int(out);
        const words: WordStress[] = [];
        let cursor = 0;
        for (let i = 0; i < count; i += 1) {
          const word = this.readWord(handle, i, out);
          // Find the word in the uppercased text to recover its original spelling
          const at = upper.length === source.length ? upper.indexOf(word.word, cursor) : -1;
          if (at >= 0) {
            cursor = at + word.word.length;
            words.push(withSpelling(word, source.slice(at, cursor)));
          } else {
            words.push(word);
          }
        }
        return words;
      } finally {
        m.HEAP32[out >> 2] = handle;
        m._PhonologyEngineOutputFree(out);
      }
    } finally {
      m._free(out);
      m._free(textPtr);
    }
  }

  stressWord(word: string): WordStress | undefined {
    return this.stressPhrase(word)[0];
  }

  private readWord(handle: number, index: number, out: number): WordStress {
    const { m } = this;

    this.check(m._PhonologyEngineOutputGetWord(handle, index, out), 'GetWord');
    const word = decoder.decode(this.readBytes(this.int(out)));

    this.check(m._PhonologyEngineOutputGetWordSyllables(handle, index, out), 'GetWordSyllables');
    const syllables = this.readSyllables(this.int(out));

    this.check(m._PhonologyEngineOutputGetWordStressOptionCount(handle, index, out), 'GetWordStressOptionCount');
    const optionCount = this.int(out);
    this.check(m._PhonologyEngineOutputGetWordStressOptionSelected(handle, index, out), 'GetWordStressOptionSelected');
    const selected = optionCount ? this.int(out) : null;

    const options: StressOption[] = [];
    for (let i = 0; i < optionCount; i += 1) {
      this.check(
        m._PhonologyEngineOutputGetWordStressOption(handle, index, i, out, out + 4, out + 8, out + 12),
        'GetWordStressOption',
      );
      const [letterIndex, stressType, vocabulary, grammarRule] = [0, 4, 8, 12].map((offset) => this.int(out + offset));
      options.push(decodeOption(word, letterIndex, stressType, vocabulary, grammarRule));
    }

    return { word, syllables, selected, options };
  }

  // Same rule as the Python wrapper: byte 2 marks a syllable start
  private readSyllables(ptr: number): number[] {
    const bytes = this.readBytes(ptr);
    const newline = bytes.indexOf(10);
    let values = Array.from(newline >= 0 ? bytes.subarray(0, newline) : bytes);
    if (values.length > 1 && values[values.length - 1] === 2) {
      values = values.slice(0, -1);
    }
    return values.flatMap((value, i) => (value === 2 ? [i] : []));
  }

  private writeString(text: string): number {
    const bytes = encode(text);
    const ptr = this.m._malloc(bytes.length + 1);
    this.m.HEAPU8.set(bytes, ptr);
    this.m.HEAPU8[ptr + bytes.length] = 0;
    return ptr;
  }

  // Heap views are replaced when memory grows, so always read them from the module
  private readBytes(ptr: number): Uint8Array {
    const heap = this.m.HEAPU8;
    let end = ptr;
    while (heap[end] !== 0) {
      end += 1;
    }
    return heap.slice(ptr, end);
  }

  private int(ptr: number): number {
    return this.m.HEAP32[ptr >> 2];
  }

  private check(result: number, name: string) {
    if (result !== 0) {
      throw new Error(`PhonologyEngine${name} failed with code ${result}`);
    }
  }

}

function withSpelling(word: WordStress, spelling: string): WordStress {
  return {
    ...word,
    word: spelling,
    options: word.options.map((option) => ({
      ...option,
      stressed: addAccent(spelling, option.letterIndex, option.accent),
    })),
  };
}

function addAccent(word: string, letterIndex: number, accent: Accent): string {
  return (word.slice(0, letterIndex + 1) + accentMark(word, letterIndex, accent) + word.slice(letterIndex + 1))
    .normalize('NFC');
}

// Lithuanian spelling writes an acute on i or u of a mixed diphthong (il, im, in, ir, ul, um, un, ur)
// or of "ui" with a grave: pìrštas, dùrpių, mùistė
function accentMark(word: string, letterIndex: number, accent: Accent): string {
  const letter = word.charAt(letterIndex).toLocaleLowerCase('lt');
  const next = word.charAt(letterIndex + 1).toLocaleLowerCase('lt');
  const inMixedDiphthong = (letter === 'i' || letter === 'u') && next !== '' && 'lmnr'.includes(next);
  const inUi = letter === 'u' && next === 'i';
  return accent === 'acute' && (inMixedDiphthong || inUi) ? ACCENT_MARKS.grave : ACCENT_MARKS[accent];
}

function decodeOption(
  word: string, letterIndex: number, stressType: number, vocabulary: number, grammarRule: number,
): StressOption {
  const accent = ACCENTS[stressType] || 'acute';
  const group = GROUPS[vocabulary] || 'uninflected';
  const stressed = addAccent(word, letterIndex, accent);
  return { stressed, letterIndex, accent, group, grammarRule };
}

let loading: Promise<PhonologyEngine> | undefined;

// Loads the WebAssembly module and initializes the engine once per process
export function loadPhonologyEngine(): Promise<PhonologyEngine> {
  if (!loading) {
    loading = createEngine().then((m) => {
      const result = m._PhonologyEngineInit();
      if (result !== 0) {
        throw new Error(`PhonologyEngineInit failed with code ${result}`);
      }
      return new PhonologyEngine(m);
    });
  }
  return loading;
}
