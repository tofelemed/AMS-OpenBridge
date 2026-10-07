#!/usr/bin/env bash
# CHG-068: plain-bash test of the ZooKeeper start guard's quarantine function.  Run: bash tests/ops/zk-start-guard.test.sh
set -u
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/../../infra/docker/zookeeper/zk-start-guard.sh"
fail=0; t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
chk(){ if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 (got '$2', want '$3')"; fail=1; fi; }
export ZK_TXNLOG_DIR="$t"; mkdir -p "$t/version-2"
: > "$t/version-2/log.91a0"                       # zero-byte: must move
: > "$t/version-2/log.7dbe.zero-byte"             # zero-byte renamed in place: must move too
printf 'x' > "$t/version-2/log.1"                 # real log: must stay
printf 'x' > "$t/version-2/snapshot.919f"         # snapshot: must stay
out=$(zk_quarantine_zero_byte_logs 2>&1)
chk "zero-byte logs left version-2" "$(find "$t/version-2" -name 'log.*' -size 0 | wc -l | tr -d ' ')" "0"
chk "two files quarantined" "$(ls "$t/quarantine" | wc -l | tr -d ' ')" "2"
chk "real log kept" "$([ -s "$t/version-2/log.1" ] && echo y)" "y"
chk "snapshot kept" "$([ -s "$t/version-2/snapshot.919f" ] && echo y)" "y"
chk "message printed" "$(echo "$out" | grep -c 'zk-start-guard: quarantined')" "2"
out=$(zk_quarantine_zero_byte_logs 2>&1)          # idempotent
chk "second run is a no-op" "$out" ""
rm -rf "$t"; mkdir -p "$t"                        # no version-2 at all (first start)
chk "no version-2 dir: no error" "$(zk_quarantine_zero_byte_logs 2>&1; echo $?)" "0"
exit $fail
