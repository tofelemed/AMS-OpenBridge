# ZooKeeper start guard for Instrumental's ZooKeeper (CHG-068, release v2.7.0)

Why: a zero-byte transaction log (disk full) makes ZooKeeper 3.8.x crash-loop with `EOFException`
(ZOOKEEPER-2332 / 2376, fixed only in 3.9.3+; seen 2026-09-26 and 2026-10-06, see `migration/MARUN-DISK.md` J).
The guard moves any zero-byte `log.*` out of `version-2/` into `quarantine/` before ZooKeeper starts. Nothing is deleted.

When: inside the v2.7.0 Flink swap window, AFTER the Flink cancel and `docker rm -f ams-flink-taskmanager ams-flink-jobmanager`
(every job is already cancelled) and BEFORE `deploy.sh --prod`, so Kafka's coordinator is back before the jobs return.
ZooKeeper is down about 1 minute (Kafka has no coordinator meanwhile).

Files (from the release `src-<commit>.tar.gz`, extracted over /opt/AMS-open):
`/opt/AMS-open/infra/docker/zookeeper/zk-start-guard.sh` and `/opt/AMS-open/migration/instrumental/zookeeper-start-guard.override.yml`.

## 0. Pre-flight (STOP if anything differs)
```bash
docker inspect instrumental-zookeeper -f '{{.Config.Image}} | {{.Config.Entrypoint}} | {{.Config.Cmd}} | {{.Config.User}}'
docker inspect instrumental-zookeeper -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"
"}}{{end}}'
```
Required: a `cp-zookeeper` image, empty entrypoint (`[]`), `[/etc/confluent/docker/run]`, user `appuser`, and a mount at
`/var/lib/zookeeper/log`. Otherwise STOP: do not apply; read their compose first, then set `ZK_TXNLOG_DIR` / edit the override.

Back up BOTH volumes (as `MARUN-DISK.md` J step 1) before applying: `microservices_zookeeper-data` and `microservices_zookeeper-logs`
to `/var/tmp/zk-backup-<date>` (a few MB).

## Steps
Pin their compose project. A different project name (`-p`) creates NEW EMPTY ZooKeeper volumes = a new cluster id while Kafka keeps the
old one = `InconsistentClusterIdException`. Take the project, config file(s) and directory from the running container, never from memory.
```bash
S=/opt/AMS-open
L() { docker inspect instrumental-zookeeper -f "{{index .Config.Labels \"$1\"}}"; }
SVC=$(L com.docker.compose.service); PROJ=$(L com.docker.compose.project)
CFG=$(L com.docker.compose.project.config_files); ZKDIR=$(L com.docker.compose.project.working_dir)
echo "$SVC $PROJ $CFG $ZKDIR"        # service must be `zookeeper` (else edit the override); project `microservices`
cp $S/infra/docker/zookeeper/zk-start-guard.sh $ZKDIR/zk-start-guard.sh && chmod +x $ZKDIR/zk-start-guard.sh
cp $S/migration/instrumental/zookeeper-start-guard.override.yml $ZKDIR/
cd $ZKDIR && docker compose -p "$PROJ" -f "$CFG" -f zookeeper-start-guard.override.yml up -d zookeeper     # ONLY zookeeper
for i in $(seq 12); do docker logs instrumental-zookeeper 2>&1 | grep -q 'binding to port' && break; sleep 5; done   # up to 60 s
docker logs instrumental-zookeeper 2>&1 | grep -E 'zk-start-guard|binding to port|Snapshot loaded'
docker exec instrumental-kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --list | wc -l                   # 75
docker exec instrumental-kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --describe --under-replicated-partitions   # empty
```
(If `$CFG` lists several files, pass each with its own `-f`.) Expected: `binding to port` within 60 s; a `zk-start-guard: quarantined ...`
line only if a zero-byte log existed; 75 topics; 0 under-replicated.

## STOP rule and rollback
If ZooKeeper has not bound after the 60 s poll, roll back BEFORE continuing, with the SAME `-p` and `-f` (the guard files can stay):
```bash
cd $ZKDIR && docker compose -p "$PROJ" -f "$CFG" up -d zookeeper
```
Quarantined files stay in `<logs volume>/quarantine/` (never delete them); copy that directory next to the backup for forensics:
`docker run --rm -v microservices_zookeeper-logs:/l:ro -v /var/tmp/zk-backup-<date>:/b alpine cp -a /l/quarantine /b/`.
If the guard did nothing, check the txn-log mount is `/var/lib/zookeeper/log`, else set `ZK_TXNLOG_DIR` in the override.
Daily check section 2 counts zero-byte logs in the `microservices_zookeeper-logs` volume (ACT > 0: `MARUN-DISK.md` J).
