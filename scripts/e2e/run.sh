#!/usr/bin/env bash
# Full e2e lifecycle: up -> seed -> jest -> down.
#
# E2E_REUSE=1 keeps the stack running afterwards (and lets the seeder skip when
# its marker matches). Extra arguments are passed to jest.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

teardown() {
    local rc=$?
    if [[ "${E2E_REUSE:-}" == 1 ]]; then
        printf '[e2e] E2E_REUSE=1: leaving btk-e2e running (npm run e2e:down to stop)\n' >&2
    else
        printf '[e2e] tearing down btk-e2e\n' >&2
        npm run --silent e2e:down >/dev/null 2>&1 || printf '[e2e] WARNING: teardown failed\n' >&2
    fi
    exit "$rc"
}
trap teardown EXIT
trap 'exit 130' INT TERM

npm run --silent e2e:up
npm run --silent e2e:seed
NODE_OPTIONS=--experimental-vm-modules npx jest -c e2e/jest.config.mjs --runInBand "$@"
