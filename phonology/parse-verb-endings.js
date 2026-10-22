// Extracts the morphology of the engine's verb endings table (GalMasV in vgal.h) into JSON.
// The row index is what the engine returns as grammarRule for verb options.
// Usage: node parse-verb-endings.js vgal.h verb-endings.json
const fs = require('fs');

const [input, output] = process.argv.slice(2);
const source = new TextDecoder('windows-1257').decode(fs.readFileSync(input));

const defines = {};
for (const match of source.matchAll(/#define\s+(\w+)\s+(-?\d+)/g)) {
  defines[match[1]] = Number(match[2]);
}

const start = source.indexOf('GalMasV[');
const declared = Number(source.slice(start).match(/GalMasV\[(\d+)\]/)[1]);
const body = source.slice(start, source.indexOf('};', start));

// Struct fields after the ending string:
// KamTipas, Sangrazine, Asmenuote, KircRaide, Priegaide, KircTaisykle, PriesdTE,
// KalbDal, Laikas, NuosakaRusis, AsmuoLinksnis, Skaicius, Gimine, Apibreztumas
const rows = [];
for (const line of body.split('\n')) {
  const match = line.match(/^\s*\{\s*"[^"]*"\s*,([^}]*)\}/);
  if (!match) continue;
  const values = match[1].split(',').map((s) => s.trim()).filter(Boolean)
    .map((value) => (value in defines ? defines[value] : Number(value)));
  if (values.some(Number.isNaN)) {
    throw new Error(`Cannot parse row: ${line.trim()}`);
  }
  const [, reflexive, , , , , , pos, tense, moodVoice, personCase, number, gender, pronominal] = values;
  // A few rows carry no morphology
  rows.push(values.length < 14 ? null : [pos, tense, moodVoice, personCase, number, gender, pronominal, reflexive]);
}

if (rows.length !== declared) {
  throw new Error(`Parsed ${rows.length} rows, but GalMasV declares ${declared}`);
}

fs.writeFileSync(output, `${JSON.stringify({
  fields: ['pos', 'tense', 'moodVoice', 'personCase', 'number', 'gender', 'pronominal', 'reflexive'],
  rows,
})}\n`);
console.log(`Wrote ${rows.length} verb endings to ${output}`);
