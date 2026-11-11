#!/usr/bin/env bash
# Runs every browser suite against a running server (default http://localhost:3100). Needs: npm run build && npx next start -p 3100, and playwright + chromium.
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"; fail=0
for f in tests/browser*.ts; do echo "=== $f"; npx tsx "$f" 2>&1 | tail -25 | grep -E "FAIL|passed|failed" ; [ "${PIPESTATUS[0]}" -eq 0 ] || fail=1; done
npx tsx tests/mcp-client.mts 2>&1 | tail -5 || fail=1
exit $fail
