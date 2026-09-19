#!/usr/bin/env bash
# Run in a disposable image, never against a live Flink container:
# docker run --rm --network none --entrypoint bash \
#   -v <repo>/infra/docker/flink-entrypoint.sh:/opt/flink-entrypoint.sh:ro \
#   -v <repo>/scripts/test-flink-startup-cleanup.sh:/verify-cleanup.sh:ro \
#   ams-flink:1.0-SNAPSHOT /verify-cleanup.sh
set -euo pipefail
if [ "$$" -ne 1 ]; then echo "Requires an isolated container PID 1" >&2; exit 1; fi
mkdir -p /tmp/tm_test/nested /tmp/jm_test /tmp/flink-io-test /tmp/keep \
  /flink-checkpoints /opt/flink/log
touch /tmp/tm_test/nested/obsolete /tmp/jm_test/obsolete /tmp/flink-io-test/obsolete \
  /tmp/keep/retained /flink-checkpoints/retained \
  /opt/flink/log/flink-test.log /opt/flink/log/tmp_tm_test_db_LOG.old.1
ln -s /flink-checkpoints /tmp/tm_symlink
# Replace the downstream launcher only in this disposable container.
cat > /docker-entrypoint.sh <<'VERIFY'
#!/usr/bin/env bash
set -euo pipefail
test ! -e /tmp/tm_test
test ! -e /tmp/jm_test
test ! -e /tmp/flink-io-test
test ! -L /tmp/tm_symlink
test -f /tmp/keep/retained
test -f /flink-checkpoints/retained
test ! -f /opt/flink/log/flink-test.log
test ! -f /opt/flink/log/tmp_tm_test_db_LOG.old.1
echo "PASS: obsolete files removed; unrelated tmp, symlink target and checkpoints retained"
VERIFY
chmod +x /docker-entrypoint.sh
exec bash /opt/flink-entrypoint.sh jobmanager
