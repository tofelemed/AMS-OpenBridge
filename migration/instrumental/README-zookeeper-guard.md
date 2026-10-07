# ZooKeeper start guard for Instrumental's ZooKeeper (CHG-068, release v2.7.0)

Why: a zero-byte transaction log (disk full) makes ZooKeeper 3.8.x crash-loop with `EOFException`
(ZOOKEEPER-2332 / 2376, fixed only in 3.9.3+; seen 2026-09-26 and 2026-10-06, see `migration/MARUN-DISK.md` J).
The guard moves any zero-byte `log.*` out of `version-2/` into `quarantine/` before ZooKeeper starts. Nothing is deleted.

When: inside the v2.7.0 Flink swap window, AFTER the Flink cancel and `docker rm -f ams-flink-taskmanager ams-flink-jobmanager`
(every job is already cancelled) and BEFORE `deploy.sh --prod`, so Kafka's coordinator is back before the jobs return.
ZooKeeper is down about 1 minute (Kafka has no coordinator meanwhile).

Files (from the release `src-<commit>.tar.gz`, extracted over /opt/AMS-open):
`/opt/AMS-open/infra/docker/zookeeper/zk-start-guard.sh` and `/opt/AMS-open/migration/instrumental/zookeeper-start-guard.override.yml`.

## Steps
```bash
S=/opt/AMS-open
docker inspect instrumental-zookeeper -f '{{index .Config.Labels "com.docker.compose.service"}}'                # must be `zookeeper`; else edit the override
ZKDIR=$(docker inspect instrumental-zookeeper -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
cp $S/infra/docker/zookeeper/zk-start-guard.sh $ZKDIR/zk-start-guard.sh && chmod +x $ZKDIR/zk-start-guard.sh
cp $S/migration/instrumental/zookeeper-start-guard.override.yml $ZKDIR/
cd $ZKDIR && docker compose -f <their compose file> -f zookeeper-start-guard.override.yml up -d zookeeper     # ONLY zookeeper
docker logs instrumental-zookeeper 2>&1 | grep -E 'zk-start-guard|binding to port|Snapshot loaded'
docker exec instrumental-kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --list | wc -l                   # 75
docker exec instrumental-kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --describe --under-replicated-partitions   # empty
```
Expected: `binding to port` within 60 s; a `zk-start-guard: quarantined ...` line only if a zero-byte log existed; 75 topics; 0 under-replicated.

## STOP rule and rollback
If ZooKeeper has not bound within 60 s, roll back BEFORE continuing (the old behaviour; the guard files can stay):
```bash
cd $ZKDIR && docker compose -f <their compose file> up -d zookeeper
```
Check the log dir if the guard did nothing: their txn-log mount must be `/var/lib/zookeeper/log`, else set `ZK_TXNLOG_DIR` in the override.
Daily check section 2 counts zero-byte logs in the `microservices_zookeeper-logs` volume (ACT > 0: `MARUN-DISK.md` J).
