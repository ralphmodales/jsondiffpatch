#!/bin/bash
set -e

MODE="${1:-new}"

if [ "$MODE" = "base" ]; then
  npx vitest run \
    packages/jsondiffpatch/test/index.spec.ts \
    packages/jsondiffpatch/test/formatters/html.spec.ts \
    packages/jsondiffpatch/test/formatters/jsonpatch.spec.ts \
    packages/jsondiffpatch/test/formatters/annotated.spec.ts
elif [ "$MODE" = "new" ]; then
  npx vitest run packages/jsondiffpatch/test/compose.spec.ts
else
  echo "Usage: ./test.sh {base|new}"
  exit 1
fi
