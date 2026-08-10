#!/usr/bin/env bash
set -e

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
