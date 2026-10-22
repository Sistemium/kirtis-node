#!/usr/bin/env bash
# Builds the LIEPA word stress engine from aleksas/phonology_engine into WebAssembly.
# Needs Emscripten (`brew install emscripten`). Output goes to src/phonology/engine/:
# phonology-engine.js (with the .wasm embedded), verb-endings.json and the upstream LICENSE.
set -euo pipefail

COMMIT=2baec9a28c0c506075a7c5bd26c86502144d5d95
SHA256=d4786fd398c034300275f8a0c12491499246148a690cbaea1f7bb7d0c6222b48

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../src/phonology/engine"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL -o "$WORK/src.tar.gz" "https://codeload.github.com/aleksas/phonology_engine/tar.gz/$COMMIT"
echo "$SHA256  $WORK/src.tar.gz" | shasum -a 256 -c -
tar -xzf "$WORK/src.tar.gz" -C "$WORK"
SRC="$WORK/phonology_engine-$COMMIT/native"

FUNCTIONS=(
  PhonologyEngineInit
  PhonologyEngineNormalizeText
  PhonologyEngineNormalizedTextFree
  PhonologyEngineNormalizedTextGetPhraseCount
  PhonologyEngineNormalizedTextGetPhrase
  PhonologyEngineProcessPhrase
  PhonologyEngineOutputFree
  PhonologyEngineOutputGetWordCount
  PhonologyEngineOutputGetWord
  PhonologyEngineOutputGetWordSyllables
  PhonologyEngineOutputGetWordStressOptionCount
  PhonologyEngineOutputGetWordStressOptionSelected
  PhonologyEngineOutputGetWordStressOption
  malloc
  free
)
EXPORTED=$(printf '_%s,' "${FUNCTIONS[@]}")

mkdir -p "$OUT"
cp "$WORK/phonology_engine-$COMMIT/LICENSE" "$OUT/LICENSE"
node "$HERE/parse-verb-endings.js" "$SRC/source/vgal.h" "$OUT/verb-endings.json"

cd "$SRC/source"
em++ -O2 -I ../include -Wno-write-strings \
  Transkr.cpp transcrLUSS.cpp Skiemen.cpp Kircdb.cpp fv2id.cpp ArKirciuoti.cpp \
  Engine.cpp strtokf.cpp stringWithLetterPosition.cpp TextNormalization.cpp \
  -sMODULARIZE=1 -sEXPORT_NAME=createPhonologyEngine \
  -sENVIRONMENT=node -sSINGLE_FILE=1 \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=5MB \
  -sEXPORTED_FUNCTIONS="${EXPORTED%,}" \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAP32 \
  -o "$OUT/phonology-engine.js"

echo "Built $OUT from $COMMIT"
