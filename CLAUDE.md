# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Backend API for kirtis.info, a Lithuanian word stress (accent) lookup. Koa + TypeScript. It gets accentuation and grammatical info from the VDU service (`https://kalbu.vdu.lt/ajax-call`) and caches the results in Redis. There is no README.

## Commands

```bash
npm ci
npm run serve        # tsc-watch: recompiles src/ to dist/ and restarts `node -r dotenv-flow/config dist/api.js`
npm run build        # wipes dist/, runs tsc, copies package.json into dist/ (dist/ is the deployable package)
npx tsc --noEmit     # typecheck; there is no linter
npm test             # ts-mocha test/testVdu.js
npx ts-mocha test/testVdu.js -r dotenv-flow/config -g "should parse MI"   # single test
```

Tests:
- They need a reachable Redis and `REDIS_OFFLINE_QUEUE=1`.
- `should find suggestions` asserts exact dictionary contents, so it only passes against Redis that holds the production word lists.
- Known bug: the `before` hook waits for the Redis client's `connect` event. `sistemium-redis` connects on import, so with a fast (local) Redis the event has already fired and the hook times out. Every test then fails, including the pure `miToState` parsing test.

## Configuration

Environment is loaded with `dotenv-flow` (`.env`, `.env.local`, …). None is committed, and `*.local` is gitignored.

- `PORT`: required; the server asserts it.
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_SOCK`: read by `sistemium-redis`. Default is `127.0.0.1:6379`, db 0.
- `MONGO_URL`: host and database without the scheme (e.g. `host/kirtis`), because the adapter prepends `mongodb://`. The server starts listening only after Mongo connects, even though no Mongo models are in use.
- `DEBUG=stm:*` turns on `sistemium-debug` logging.

`nodemon.json` is left over from an older dev setup: nodemon is no longer a dependency, and its `esm-wallaby` exec map is stale. It is only useful as a record of the env var values that were used (they point at Sistemium's production Redis and Mongo hosts).

## Architecture

Routes are defined in `src/api.ts`:

- `GET /krc/:word`: the main lookup, in `src/controllers/krc.ts`. It checks the Redis cache, then the not-found set, then calls VDU, parses the result with `accentInfoToStates`, and caches it. A miss (empty VDU result, or nothing left after parsing) is added to the not-found set with no expiry. That word then returns 404 until it is removed from `kirtis_not_found_words` by hand.
- `GET /vdu/:word`: raw VDU response, not cached (for debugging).
- `GET /zodynas/:word`: autocomplete. It runs `ZRANGEBYLEX` on `mixed_accent_words` over the prefix range `[word` … `[wordž` (limit 60), expands each hit through the `accentuated_words` hash, and sorts with a custom letter-by-letter `localeCompare`.
- `GET /strp`: serves `src/static/strp.json`, which maps each abbreviation to its full Lithuanian name, grouped by grammatical category.

Redis keys, all in `src/services/caching.ts`:

| Key | Type | Written by |
|---|---|---|
| `kirtis_found_words` | hash: word → JSON `AccentInfo[]` | `/krc` |
| `kirtis_not_found_words` | set | `/krc` |
| `mixed_accent_words` | sorted set, queried by lex range | outside this repo (read-only here) |
| `accentuated_words` | hash: plain word → comma-separated accented forms | outside this repo (read-only here) |

Cache keys for `/krc` are normalized with `upperFirst(lowercase(word))`. The VDU request sends the lowercased word.

### VDU parsing (`src/services/vdu.ts`)

- VDU returns `message` as a JSON string containing `accentInfo: [{ accented: string[], information: [{ mi }] }]`.
- `mi` is a comma-separated morphological description. The first part is the part of speech, and the rest are features.
- `miToState` translates VDU abbreviations into kirtis abbreviations through the `KEYS` map. A part with no direct match is split on spaces and each piece is mapped separately; for example `dgs. vard.` becomes `dgsk.`, `V.`.
- Results are de-duplicated, and entries without a class or state are dropped.
- Every output abbreviation in `KEYS` is a key in `strp.json`. When you add or change a mapping, keep the two files in sync.

### Models

`src/models/index.ts` sets up `KirtisModel` (`sistemium-data` with the Mongo store adapter). `defaultRoutes(router, map(models))` in `api.ts` would register REST routes for every model in the default export, but that export is empty, so there are no CRUD routes today.

### Internal packages

The `sistemium-*` dependencies are Sistemium's own npm packages:
- `sistemium-redis`: a promisified redis v3 client.
- `sistemium-data` and `sistemium-data-mongo`: models and the Mongo adapter; HTTP calls use `sistemium-data/lib/util/axios`.
- `sistemium-mongo`: provides `defaultRoutes` and `assert`.
- `sistemium-debug`: logging.

To check their behavior, read their compiled `lib/` in `node_modules`.
