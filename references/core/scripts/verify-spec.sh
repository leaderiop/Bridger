#!/usr/bin/env bash
# One entry point for every mechanical spec check (report 07, R2). Exit status is the sum of failures.
#   bash references/core/scripts/verify-spec.sh [--since <rev>]
# --since adds the prototype-drift check: a change to a prototyped behaviour must touch the prototype or say why not.
set -u
here="$(cd "$(dirname "$0")/../../.." && pwd)"
since=""; [ "${1:-}" = "--since" ] && since="${2:?--since needs a revision}"
fail=0
run() { echo "== $*"; "$@" || fail=$((fail + 1)); }
run bash "$here/references/core/scripts/verify-traceability.sh" --strict
run bash "$here/references/core/scripts/verify-events.sh"
run bash "$here/references/core/scripts/verify-companions.sh"
run bash "$here/references/gxp/scripts/verify-traceability.sh"
for s in doc-typecheck verify-errors verify-cli; do run bash "$here/references/kit/scripts/$s.sh"; done
run node "$here/prototypes/host-core/scripts/gen-correspondence.mjs" --check
[ -n "$since" ] && run node "$here/prototypes/host-core/scripts/check-drift.mjs" "$since"
echo "verify-spec: $fail failing step(s)"
exit $((fail > 0))
