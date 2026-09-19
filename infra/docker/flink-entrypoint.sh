#!/usr/bin/env bash
set -e

# A restarted container retains its writable layer. These process-local files
# are disposable; HA job graphs/checkpoints/savepoints live outside /tmp in
# ZooKeeper/MinIO (or /flink-checkpoints). Run only before starting the JVM.
# Never follow symlinks, cross mounts, or touch durable state locations.
if [ "$$" -eq 1 ] && { [ "$1" = jobmanager ] || [ "$1" = taskmanager ]; }; then
  find /tmp -xdev -depth -mindepth 1 \
    \( -path '/tmp/tm_*' -o -path '/tmp/jm_*' -o -path '/tmp/flink-io-*' \
       -o -path '/tmp/flink-netty-shuffle-*' -o -path '/tmp/flink-dist-cache-*' \
       -o -path '/tmp/flink-web-*' -o -path '/tmp/executionGraphStore-*' \) -delete
  # Prior log families contain no application state. Console logs remain in
  # Docker's rotated logging stream; RocksDB now keeps logs in its DB folder.
  find /opt/flink/log -xdev -maxdepth 1 -type f \
    \( -name 'flink-*.log*' -o -name 'tmp_tm_*_LOG*' \) -delete
  echo "[flink-entrypoint] removed prior process temporary files"
fi

# STR-02 — install the S3 filesystem plugin so checkpoints and savepoints can live
# on durable object storage (MinIO) instead of a host-local Docker volume.
#
# We copy the jar ourselves rather than setting ENABLE_BUILT_IN_PLUGINS. That variable
# makes the official entrypoint's copy_plugins_if_required() `exit 1` for ANY named
# plugin missing from /opt/flink/opt, and this stack already relies on metrics-prometheus
# which ships pre-installed under /opt/flink/plugins (not in /opt/flink/opt) — setting the
# variable therefore kills both Flink containers on start. Doing the copy here keeps the
# two plugin mechanisms independent.
S3_PLUGIN_JAR="flink-s3-fs-presto-1.18.1.jar"
if [ -f "/opt/flink/opt/${S3_PLUGIN_JAR}" ]; then
  mkdir -p /opt/flink/plugins/s3-fs-presto
  cp -n "/opt/flink/opt/${S3_PLUGIN_JAR}" "/opt/flink/plugins/s3-fs-presto/" || true
  echo "[flink-entrypoint] s3-fs-presto plugin installed"
else
  echo "[flink-entrypoint] WARNING: ${S3_PLUGIN_JAR} not found; s3:// checkpoint paths will fail" >&2
fi

# Retained for local-filesystem fallback deployments (state.checkpoints.dir=file://...).
mkdir -p /flink-checkpoints
chown -R flink:flink /flink-checkpoints

exec /docker-entrypoint.sh "$@"
