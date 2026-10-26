# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend API for kirtis.info, a Lithuanian word stress (accent) lookup. Koa + TypeScript. There is no README.

Word lookups get accentuation and grammatical info from the VDU service (`https://kalbu.vdu.lt/ajax-call`) and cache it in Redis. VDU was down for several days in October 2026, so the LIEPA stress engine bundled in `src/phonology` (see below) answers when VDU cannot.

## Commands

```bash
npm ci
npm run serve        # tsc-watch: recompiles src/ to dist/ and restarts `node -r dotenv-flow/config dist/api.js`
npm run build        # wipes dist/, runs tsc, copies package.json into dist/ (dist/ is the deployable package)
npx tsc --noEmit     # typecheck; there is no linter
npm test             # mocha with ts-node (transpile-only) on test/testVdu.js, test/testLiepa.js and test/testSuggestions.js
npx mocha -r ts-node/register/transpile-only -r dotenv-flow/config test/testLiepa.js -g "homograph"   # single test
```

Toolchain constraints:
- TypeScript is pinned to 6.x. TypeScript 7 (the native Go compiler) ships no JS compiler API, and ts-node needs one.
- Tests use mocha directly with `ts-node/register/transpile-only` instead of `ts-mocha`. ts-mocha only supports mocha up to 11 and bundles the outdated ts-node 7.

Tests:
- `test/testVdu.js` checks the VDU response parser against real answers saved in `test/fixtures/`, and the input cleanup. `test/testLiepa.js` checks the stress engine and its class/state mapping. Neither needs Redis or network.
- `test/testSuggestions.js` needs a reachable Redis (`REDIS_HOST`, `REDIS_DB`). `sistemium-redis` connects on import, so the `before` hook waits for the client to be `ready` and the `after` hook quits it. Without the `after` hook, mocha never exits.
- `should find suggestions` asserts exact dictionary contents, so it passes only against the Redis that holds the word lists. That is the production Redis `redis1a.sistemium.net`, db 0, which also holds `kirtis_found_words` (`REDIS_HOST=redis1a.sistemium.net REDIS_DB=0 npm test`; the test only reads). Against an empty local Redis it returns `[]`. The db 1 in `nodemon.json` is empty.

## Configuration

Environment is loaded with `dotenv-flow` (`.env`, `.env.local`, …). None is committed, and `*.local` is gitignored.

- `PORT`: required; the server asserts it.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_SOCK`: read by `sistemium-redis`. Default is `127.0.0.1:6379`, db 0.
- `MONGO_URL`: host and database without the scheme (e.g. `host/kirtis`), because the adapter prepends `mongodb://`. The server starts listening only after Mongo connects, even though no Mongo models are in use.
- `DEBUG=stm:*` turns on `sistemium-debug` logging.

`nodemon.json` is left over from an older dev setup: nodemon is no longer a dependency, and its `esm-wallaby` exec map is stale. It is only useful as a record of the env var values that were used (they point at Sistemium's production Redis and Mongo hosts).

## Architecture

Routes are defined in `src/api.ts`:

- `GET /krc/:word`: the main lookup, in `src/controllers/krc.ts`. Each entry is `{ word, class, state }`: an accented form, its part of speech, and its grammatical features. The word is first cleaned up by `plainWord` (`src/services/words.ts`): trimmed, pasted stress marks stripped, one word of at most 40 characters. Then the sources are tried in order:
  1. the cached entries in `kirtis_found_words`, if they are a VDU answer;
  2. VDU itself (`src/services/vdu.ts`), whose answer is saved to the cache;
  3. the LIEPA engine (`src/services/liepa.ts`), when VDU cannot answer or does not know the word.

  Engine entries carry `source: "liepa"` and are cached too, but only as a provisional answer. While a word's cache value holds engine entries, every request asks VDU first, and a VDU answer replaces them. Otherwise the engine answer is served, and rewritten to the cache only when it changed.

  It returns 404 `Not a word` if none of them has the word. Nothing records "not found", so a word that VDU does not know is asked about again next time.
- VDU client details:
  - It uses Node's built-in `fetch` with a 3-second timeout.
  - After any failure (network error, timeout, unexpected body) it skips VDU for 60 seconds, so lookups go straight to the engine during an outage.
  - Since October 2026 VDU's `message` is a JSON list with one item per word (`"[]"` with code 502 for unknown words or phrases); before, it was `{ accentInfo }`. `parseVduResponse` accepts both.
  - Forms come in NFD (separate combining stress marks), as in the cache.
  - The `KEYS` map turns VDU abbreviations into `strp.json` keys.
- `GET /zodynas/:word`: autocomplete. It runs `ZRANGEBYLEX` on `mixed_accent_words` over the prefix range `[word` … `[wordž` (limit 60), expands each hit through the `accentuated_words` hash, and sorts with a custom letter-by-letter `localeCompare`.
- `GET /strp`: serves `src/static/strp.json`, which maps each abbreviation to its full Lithuanian name, grouped by grammatical category.

Redis keys, all in `src/services/caching.ts`. The service writes only `kirtis_found_words`. A value there is either a VDU answer (entries without `source`, including all entries from before October 2026) or an engine answer (entries with `source: "liepa"`), never a mix. Each write replaces the whole value.

| Key | Type | Used by |
|---|---|---|
| `kirtis_found_words` | hash: word → JSON `AccentInfo[]` | `/krc`, written with VDU and engine answers |
| `mixed_accent_words` | sorted set, queried by lex range | `/zodynas` (filled outside this repo) |
| `accentuated_words` | hash: plain word → comma-separated accented forms | `/zodynas` (filled outside this repo) |

Cache keys for `/krc` are normalized with `upperFirst(lowercase(word))`.

Entries need a class, both when read from the cache and when parsed from VDU. Entries with a class but an empty state are kept, because adverbs, particles and conjunctions have no features: `Kur̃`, `Kaĩ`, `geraĩ`. Until October 2026 they were filtered out, which hid such words even though their VDU answers were cached. Entries without a class are words VDU could not stress.

The old `kirtis_not_found_words` set may still exist in Redis, but it is no longer used.

The `class` and `state` abbreviations are the keys of `strp.json`, both for cached VDU entries and for engine entries. The frontend (Sistemium/krc-angular) loads `/api/strp` for tooltips, so a new abbreviation needs a `strp.json` key. `nekait.` ("Nekaitomas žodis") was added for the engine's uninflected words. The frontend shows `(class)` next to each word, so every entry needs a class.

### Stress engine (`src/phonology/`, tooling in `phonology/`)

It is the LIEPA word stress engine (C++, with stem dictionaries compiled in, BSD license) from [aleksas/phonology_engine](https://github.com/aleksas/phonology_engine), compiled to WebAssembly. `/krc` uses it for words that VDU cannot answer or does not know.

- `src/phonology/index.ts` wraps the engine and returns its raw stress options.
- `src/phonology/grammar.ts` turns the options into kirtis entries (class and state).
- `src/services/liepa.ts` is what `/krc` calls. It runs the input through `plainWord`, whose 40-character limit exists because the engine has fixed buffers sized for 50-letter words. It returns `[]` for characters outside Windows-1257.
- `src/phonology/engine/` holds generated files and is committed: `phonology-engine.js` (Emscripten `SINGLE_FILE` build with the `.wasm` embedded, so `tsc` copies it into `dist/` through `allowJs`), `verb-endings.json` and the upstream `LICENSE`.
- `npm run phonology:build` runs `phonology/build.sh`. It downloads a pinned commit, checks its SHA-256, extracts the verb endings table with `phonology/parse-verb-endings.js`, and builds the engine with `em++`. It needs Emscripten (`brew install emscripten`). Nothing else needs it.
- `npm run phonology:demo -- word ...` prints what `/krc` would return from the engine.
- `REDIS_HOST=redis1a.sistemium.net REDIS_DB=0 npm run phonology:compare -- [limit] [mismatches.tsv]` compares the engine's stress, class and state with the VDU answers in `kirtis_found_words`. It skips words whose cached value is an engine answer, and it only reads Redis, with `HSCAN`. 50,000 words take about 10 seconds.
- `npx tsc -p phonology/tsconfig.json` typechecks the tooling. Its tsconfig lists `types: ["node"]`, because TypeScript 6 no longer loads `@types/*` automatically; in `src/` the Node types arrive through `@types/koa`.

How `grammar.ts` derives class and state:
- Nouns, adjectives, numerals and pronouns get their class from the engine's stem type (`grammarRule >> 8`). `Kircdb.cpp` lists the noun and adjective stem types, including the masculine and feminine noun stems. The numeral (44–79) and pronoun (80–99) ranges come from comparing with VDU. State: nouns get gender, number and case; the others get number and case only.
- For verb forms, `grammarRule` is the row of the verb endings table (`GalMasV` in `vgal.h`, extracted to `verb-endings.json`). Each row gives part of speech (verb, participle, `padlv.`, `psdlv.`, infinitive, `būdn.`), tense, mood or voice, person or case, number, gender, pronominal form and reflexivity. "Singular and plural" or "masculine or feminine" rows become one entry for each value, as VDU does. Only the conditional (`Tar.`) and imperative (`Liep.`) moods are tagged, because VDU leaves the indicative out.
- Uninflected words get class `nekait.` and an empty state.
- Entries list the engine's picked option first, without duplicates.

Engine behavior that the wrapper relies on:
- It only recognizes uppercase Windows-1257 text: lowercase words get no stress options. The wrapper uppercases the input and puts the original spelling back in the output.
- Stress types: 0 is short (grave), 1 and 3 are acute, 2 is circumflex (tilde).
- "Vocabulary" says which dictionary matched: 0 verb, 1 uninflected word, 2 noun or adjective.
- For nouns and adjectives, `grammarRule = stemType << 8 | case`, where case 0–6 is singular and 7–13 is plural (nominative … vocative). The wrapper maps this to the case and number abbreviations from `strp.json`.
- There is no part of speech beyond those three groups, no gender, and no tense, person or mood for verbs.
- The wrapper follows Lithuanian spelling: an acute on i or u in a mixed diphthong (il, im, in, ir, ul, um, un, ur) or in "ui" is written as a grave (`dùrpių`, `mùistė`), as VDU does. The option's `accent` field still says `acute`.

Comparison with the cached VDU answers (2026-10-22, 50,000 words from `kirtis_found_words`, of which 44,434 had a VDU stress):
- The engine stresses 93% of the words. Its misses are mostly derived adjectives (`-inis`), abstract nouns (`-umas`), diminutives, and foreign or scientific terms.
- When it answers, its picked form is one of VDU's forms 97% of the time, and the stressed syllable is right 98% of the time.
- For entries whose form VDU also has, the class matches VDU 98% of the time. The state does not contradict VDU for 98% of nouns, 97% of participles, 93% of adjectives and 79% of verbs (ignoring `nesngr.`/`neįvardž.`, which VDU sets inconsistently). Nearly all verb differences are format: VDU usually omits `Tar.`/`Liep.` and sometimes the number of 3rd-person forms. Real tense or person contradictions are about 0.2%.
- It rarely lists every variant: 10% of words have several VDU stresses, and the engine finds all of them for only 17%.
- Of 4,864 typo-like entries that VDU could not stress, the engine stressed only 5%.
- These words are already in the cache. Words missing from it are rarer, so accuracy on them is probably lower.

### Models

`src/models/index.ts` sets up `KirtisModel` (`sistemium-data` with the Mongo store adapter). `defaultRoutes(router, map(models))` in `api.ts` would register REST routes for every model in the default export, but that export is empty, so there are no CRUD routes today.

### Internal packages

The `sistemium-*` dependencies are Sistemium's own npm packages:
- `sistemium-redis`: a promisified redis v3 client.
- `sistemium-data` and `sistemium-data-mongo`: models and the Mongo adapter.
- `sistemium-mongo`: provides `defaultRoutes` and `assert`.
- `sistemium-debug`: logging.

To check their behavior, read their compiled `lib/` in `node_modules`.
