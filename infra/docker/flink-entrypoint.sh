#!/usr/bin/env bash
set -e

mkdir -p /flink-checkpoints
chown -R flink:flink /flink-checkpoints

exec /docker-entrypoint.sh "$@"
