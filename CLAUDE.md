# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend API for kirtis.info, a Lithuanian word stress (accent) lookup. Koa + TypeScript. There is no README.

All data is served from Redis. Word lookups used to fetch accentuation and grammatical info from the VDU service (`https://kalbu.vdu.lt/ajax-call`) and cache it. That service stopped answering in October 2026, so the VDU client and its parser were removed. Lookups now return only words already in the cache. The old code is in git history: `src/services/vdu.ts` before the "Serve /krc from cache only" commit.

## Commands

```bash
npm ci
npm run serve        # tsc-watch: recompiles src/ to dist/ and restarts `node -r dotenv-flow/config dist/api.js`
npm run build        # wipes dist/, runs tsc, copies package.json into dist/ (dist/ is the deployable package)
npx tsc --noEmit     # typecheck; there is no linter
npm test             # mocha with ts-node (transpile-only) on test/testSuggestions.js
npx mocha -r ts-node/register/transpile-only -r dotenv-flow/config test/testSuggestions.js -g "should find suggestions"   # single test
```

Toolchain constraints:
- TypeScript is pinned to 6.x. TypeScript 7 (the native Go compiler) ships no JS compiler API, and ts-node needs one.
- Tests use mocha directly with `ts-node/register/transpile-only` instead of `ts-mocha`. ts-mocha only supports mocha up to 11 and bundles the outdated ts-node 7.

Tests:
- They need a reachable Redis (`REDIS_HOST`, `REDIS_DB`). `sistemium-redis` connects on import, so the `before` hook waits for the client to be `ready` and the `after` hook quits it. Without the `after` hook, mocha never exits.
- `should find suggestions`, the only test, asserts exact dictionary contents, so it passes only against the Redis that holds the word lists. That is the production Redis `redis1a.sistemium.net`, db 0, which also holds `kirtis_found_words` (`REDIS_HOST=redis1a.sistemium.net REDIS_DB=0 npm test`; the test only reads). Against an empty local Redis it returns `[]`. The db 1 in `nodemon.json` is empty.

## Configuration

Environment is loaded with `dotenv-flow` (`.env`, `.env.local`, …). None is committed, and `*.local` is gitignored.

- `PORT`: required; the server asserts it.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_SOCK`: read by `sistemium-redis`. Default is `127.0.0.1:6379`, db 0.
- `MONGO_URL`: host and database without the scheme (e.g. `host/kirtis`), because the adapter prepends `mongodb://`. The server starts listening only after Mongo connects, even though no Mongo models are in use.
- `DEBUG=stm:*` turns on `sistemium-debug` logging.

`nodemon.json` is left over from an older dev setup: nodemon is no longer a dependency, and its `esm-wallaby` exec map is stale. It is only useful as a record of the env var values that were used (they point at Sistemium's production Redis and Mongo hosts).

## Architecture

Routes are defined in `src/api.ts`:

- `GET /krc/:word`: the main lookup, in `src/controllers/krc.ts`. It returns the word's entries from `kirtis_found_words`, or 404 `Not a word` if there are none. Each entry is `{ word, class, state }`: an accented form, its part of speech, and its grammatical features.
- `GET /zodynas/:word`: autocomplete. It runs `ZRANGEBYLEX` on `mixed_accent_words` over the prefix range `[word` … `[wordž` (limit 60), expands each hit through the `accentuated_words` hash, and sorts with a custom letter-by-letter `localeCompare`.
- `GET /strp`: serves `src/static/strp.json`, which maps each abbreviation to its full Lithuanian name, grouped by grammatical category.

Redis keys, all in `src/services/caching.ts`. The service only reads Redis; nothing in this repo writes to it any more.

| Key | Type | Used by |
|---|---|---|
| `kirtis_found_words` | hash: word → JSON `AccentInfo[]` | `/krc` (filled from VDU in the past) |
| `mixed_accent_words` | sorted set, queried by lex range | `/zodynas` (filled outside this repo) |
| `accentuated_words` | hash: plain word → comma-separated accented forms | `/zodynas` (filled outside this repo) |

Cache keys for `/krc` are normalized with `upperFirst(lowercase(word))`. Entries without a `state` are filtered out when read. The old `kirtis_not_found_words` set may still exist in Redis, but it is no longer used.

The `class` and `state` abbreviations stored in the cache are the keys of `strp.json`. If a new data source is added, map its grammatical tags to those same abbreviations. The old VDU mapping (`KEYS` in `vdu.ts`) in git history is a starting point.

### Stress engine prototype (`phonology/`)

This is a candidate replacement data source for words that are not in the cache. It is not connected to any route yet.

It is the LIEPA word stress engine (C++, with stem dictionaries compiled in, BSD license) from [aleksas/phonology_engine](https://github.com/aleksas/phonology_engine), compiled to WebAssembly.

- `npm run phonology:build` runs `phonology/build.sh`. It downloads a pinned commit, checks its SHA-256, and builds `phonology/engine/` with `em++`. It needs Emscripten (`brew install emscripten`). The output is committed, so running the engine does not need Emscripten.
- `npm run phonology:demo -- word ...` prints the stress options for each word.
- `REDIS_HOST=redis1a.sistemium.net REDIS_DB=0 npm run phonology:compare -- [limit] [mismatches.tsv]` compares the engine with the VDU answers in `kirtis_found_words`. It only reads Redis, with `HSCAN`. 50,000 words take about 10 seconds.
- `npx tsc -p phonology/tsconfig.json` typechecks the folder. `phonology/` is outside `src/`, so `npm run build` does not include it. Its tsconfig lists `types: ["node"]`, because TypeScript 6 no longer loads `@types/*` automatically.

Engine behavior that the wrapper (`phonology/index.ts`) relies on:
- It only recognizes uppercase Windows-1257 text: lowercase words get no stress options. The wrapper uppercases the input and puts the original spelling back in the output.
- Stress types: 0 is short (grave), 1 and 3 are acute, 2 is circumflex (tilde).
- "Vocabulary" says which dictionary matched: 0 verb, 1 uninflected word, 2 noun or adjective.
- For nouns and adjectives, `grammarRule = stemType << 8 | case`, where case 0–6 is singular and 7–13 is plural (nominative … vocative). The wrapper maps this to the case and number abbreviations from `strp.json`.
- There is no part of speech beyond those three groups, no gender, and no tense, person or mood for verbs.
- The wrapper follows Lithuanian spelling: an acute on i or u in a mixed diphthong (il, im, in, ir, ul, um, un, ur) or in "ui" is written as a grave (`dùrpių`, `mùistė`), as VDU does. The option's `accent` field still says `acute`.

Comparison with the cached VDU answers (2026-10-22, 50,000 words from `kirtis_found_words`, of which 44,434 had a VDU stress):
- The engine stresses 93% of the words. Its misses are mostly derived adjectives (`-inis`), abstract nouns (`-umas`), diminutives, and foreign or scientific terms.
- When it answers, its picked form is one of VDU's forms 97% of the time, and the stressed syllable is right 98% of the time. Case and number agree with VDU 97% of the time.
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
