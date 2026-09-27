#!/usr/bin/env bash
# Truncate the IoTDB datanode log FILES past 200 MB. Explicit paths only, never a glob: Kafka data
# segments are also *.log and ZooKeeper transaction logs live in a volume named "-logs".
# 2026-09-26: the PI archiver IoTDB reached 1.28 GB in each of these, because it throws on every
# Thrift request and its rotation never rolls the active file; ours reached 227 MB the same day.
# Cron: migration/cron.d/cpa-capacity  (hourly, as root)
for f in /var/lib/docker/volumes/piarchiver-iotdb-logs/_data/log_datanode_all.log \
         /var/lib/docker/volumes/piarchiver-iotdb-logs/_data/log_datanode_error.log \
         /var/lib/docker/volumes/ams-cpa_iotdb-logs/_data/log_datanode_all.log \
         /var/lib/docker/volumes/ams-cpa_iotdb-logs/_data/log_datanode_error.log; do
  [ -f "$f" ] || continue
  sz=$(stat -c%s "$f")
  [ "$sz" -gt 209715200 ] && truncate -s 0 "$f" && echo "capped $sz bytes: $f"
done
exit 0
