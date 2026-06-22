#!/usr/bin/env bash
# AMS CI contract gate — static + unit verification (no Kafka/Flink cluster required).
# Runs on every commit. Full runtime verification: e2e-full-system-test.ps1 in lab/staging.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1"; FAILED=1; }

echo ""
echo "=== AMS CI Contract Gate (static subset) ==="
echo ""

# ── 1. Contract documentation present ───────────────────────
echo "[Docs]"
for f in production-contracts.md e2e-testing-plan.md; do
  if [[ -f "$ROOT/docs/$f" ]]; then pass "docs/$f exists"; else fail "docs/$f missing"; fi
done
grep -q "Truth Domain Resolver Priority" "$ROOT/docs/production-contracts.md" && pass "truth domain stack documented" || fail "truth domain stack missing"
grep -q "Projection correctness definition" "$ROOT/docs/production-contracts.md" && pass "UI projection correctness documented" || fail "projection correctness missing"

# ── 2. Frontend contract static checks ──────────────────────
echo ""
echo "[Frontend static]"
MAPPERS="$ROOT/src/frontend/src/api/alarmMappers.ts"
CONSOLE="$ROOT/src/frontend/src/components/AlarmConsole/AlarmConsole.tsx"

if grep -E "eventTimeEpochMs.*Date\.now\(\)" "$MAPPERS" 2>/dev/null; then
  fail "alarmMappers uses Date.now() for eventTime (contract violation)"
else
  pass "no Date.now() fallback for eventTime in alarmMappers"
fi

if grep -E 'commandId.*ui-\$\{' "$CONSOLE" 2>/dev/null || grep -E "ui-\`\$\{" "$CONSOLE" 2>/dev/null; then
  fail "AlarmConsole generates client ui-* commandIds"
else
  pass "no client ui-* commandId generation in AlarmConsole"
fi

if [[ -f "$ROOT/src/frontend/src/utils/alarmReconciliation.ts" ]]; then
  pass "alarmReconciliation.ts present"
else
  fail "alarmReconciliation.ts missing"
fi

# ── 3. Backend identity helpers ─────────────────────────────
echo ""
echo "[Backend static]"
for f in AlarmKeys.java AlarmPartitionKeys.cs; do
  found=$(find "$ROOT/src" -name "$f" 2>/dev/null | head -1)
  if [[ -n "$found" ]]; then pass "$f found"; else fail "$f missing"; fi
done
grep -q "logicalAlarmFamilyId\|LogicalAlarmFamilyId" "$ROOT/src/flink/src/main/java/com/ams/flink/util/AlarmKeys.java" 2>/dev/null && \
  pass "Flink logicalAlarmFamilyId defined" || fail "Flink family id missing"

# ── 4. E2E / agent scripts present ──────────────────────────
echo ""
echo "[Runtime verification scripts]"
for s in e2e-full-system-test.ps1 ams-contract-validation-agent.ps1 ams-readiness-score.ps1 replay-kafka-dlq.ps1; do
  if [[ -f "$ROOT/scripts/$s" ]]; then pass "scripts/$s"; else fail "scripts/$s missing"; fi
done

# ── 5. .NET integration tests (contract JSON) ───────────────
echo ""
echo "[.NET contract tests]"
TEST_PROJ="$ROOT/src/backend/AMS.Tests.Contract/AMS.Tests.Contract.csproj"
if command -v dotnet >/dev/null 2>&1 && [[ -f "$TEST_PROJ" ]]; then
  if dotnet test "$TEST_PROJ" -c Release \
    --filter "FullyQualifiedName~NormalizedAlarmEventJson" \
    -v q; then
    pass "NormalizedAlarmEventJson tests"
  else
    fail "NormalizedAlarmEventJson tests"
  fi
elif [[ ! -f "$TEST_PROJ" ]]; then
  echo "  [SKIP] AMS.Tests.Contract.csproj not found"
else
  echo "  [SKIP] dotnet not available"
fi

# ── 6. Frontend typecheck ───────────────────────────────────
echo ""
echo "[Frontend typecheck]"
if command -v npm >/dev/null 2>&1 && [[ -f "$ROOT/src/frontend/package.json" ]]; then
  (cd "$ROOT/src/frontend" && npm ci --prefer-offline --silent && npx tsc --noEmit) \
    && pass "tsc --noEmit" || fail "tsc --noEmit"
else
  echo "  [SKIP] npm not available"
fi

echo ""
echo "========================================"
if [[ $FAILED -eq 0 ]]; then
  echo "CI contract gate: PASS"
  exit 0
else
  echo "CI contract gate: FAIL"
  exit 1
fi
