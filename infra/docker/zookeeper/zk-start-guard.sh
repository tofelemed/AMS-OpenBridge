#!/usr/bin/env bash
# ZooKeeper start guard (CHG-068). A zero-byte transaction log (left behind when the disk filled, ZOOKEEPER-2332/2376,
# fixed upstream only in 3.9.3+) makes ZooKeeper 3.8.x exit with EOFException at startup, and renaming it in place
# does not help (log.<hex>.<anything> is still parsed as a log). A zero-byte log holds no transactions, so moving it
# out of version-2/ loses nothing. Quarantine, never delete, then start ZooKeeper as usual.
# Tested by tests/ops/zk-start-guard.test.sh (sourced: the exec below only runs when executed).
set -u

zk_quarantine_zero_byte_logs() {
  local logdir="${ZK_TXNLOG_DIR:-/var/lib/zookeeper/log}" q f
  q="$logdir/quarantine"
  for f in "$logdir"/version-2/log.*; do
    [ -e "$f" ] || continue
    if [ ! -s "$f" ]; then
      mkdir -p "$q" && mv "$f" "$q/$(basename "$f").$(date -u +%Y%m%dT%H%M%SZ)" \
        && echo "zk-start-guard: quarantined zero-byte transaction log $(basename "$f") -> $q" >&2
    fi
  done
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  zk_quarantine_zero_byte_logs
  exec /etc/confluent/docker/run
fi
