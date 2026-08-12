# HA Production Guide — Plan 09 (approved topology)

**Decisions (recorded 2026-08-12):** Kafka **3 brokers with ZooKeeper** (matches the
existing 3-broker+ZK production Kafka estate — the KRaft migration was deliberately NOT
taken); Flink **as recommended** (2 JobManagers, ZooKeeper HA, ≥2 TaskManagers, durable
object-store checkpoints); IoTDB **one main + one replica** (async pipe DR, manual
promote — not a consensus cluster); PostgreSQL **primary + one streaming replica +
PgBouncer**; EMQX **left single-node by decision**.

Everything below was **built and drilled in the lab** with
[infra/docker/docker-compose.ha.yml](../infra/docker/docker-compose.ha.yml) on 2026-08-12.
Drill results are quoted inline so production knows what "good" looks like.

```powershell
# Run the HA topology (dev/staging drill):
docker compose -f docker-compose.yml -f docker-compose.ha.yml up -d
# Plain dev stays single-node: the base file alone is unchanged.
```

---

## 1. Kafka — 3 brokers, RF=3, min.insync.replicas=2

### Target contract (production)
| Setting | Value | Why |
|---|---|---|
| brokers | 3 (ZooKeeper mode) | matches existing estate; survives any one broker |
| `default.replication.factor` / `offsets.topic.replication.factor` | 3 | every partition on all three |
| `min.insync.replicas` | **2** on critical topics + `__consumer_offsets` | acks=all means "durable on ≥2 brokers" |
| producers | `acks=all` + idempotence (ams-api already sets `EnableIdempotence=true`) | no acked-then-lost writes |
| `auto.create.topics.enable` | **false** | every topic provisioned as code |
| topic provisioning | `scripts/kafka-reset-lab-topics.ps1` topic list (create-only in prod; set `$minIsr = "2"`) | one source of truth |
| retention on event-sourced topics | raise from 7d per replay-window requirement | 24h/7d bounds alarm replay |

### Migrating existing RF=1 topics → RF=3 (the rehearsed procedure)
```bash
# 1. topic list + partition counts
kafka-topics --bootstrap-server <b1> --list | grep -v '^__' > topics.txt
kafka-topics --bootstrap-server <b1> --describe | grep -E '^Topic:' \
  | awk '$2 !~ /^__/ {print $2"\t"$6}' > partitions.txt
# (filter on the topic NAME field — TopicIds can contain "__" and a naive grep eats them)

# 2. generate the RF=3 plan (round-robin over brokers 1,2,3) and execute
python scripts/kafka-rf-migrate.py topics.txt partitions.txt 3 > rf3.json
kafka-reassign-partitions --bootstrap-server <b1> --reassignment-json-file rf3.json --execute
kafka-reassign-partitions --bootstrap-server <b1> --reassignment-json-file rf3.json --verify

# 3. __consumer_offsets the same way (50 partitions), then:
kafka-configs --alter --entity-type topics --entity-name __consumer_offsets \
  --add-config min.insync.replicas=2
# 4. done when: kafka-topics --describe --under-replicated-partitions returns NOTHING
```

**Drill result (lab):** all 30 topics / 174 partitions migrated RF=1→3, zero
under-replicated. With one broker killed: `acks=all, min.insync=2` produce **succeeded**,
a fresh consumer group read **2500/2500** messages, and recovery returned to zero
under-replicated partitions.

### Two traps the drill caught — read before your first failover
1. **`__consumer_offsets` must exist BEFORE the first broker failure.** It is created
   lazily on first group coordination; with a broker already down, its RF=3 creation
   fails and **no consumer group can form** (looks like "consumer hangs / reads 0").
   After provisioning topics, run one throwaway consumer while all brokers are up.
2. **ZooKeeper data-dir mounts (cp-zookeeper image):** the image declares anonymous
   volumes at `/var/lib/zookeeper/data` and `/log`. Mount your volumes at those EXACT
   paths — a parent-dir mount is silently shadowed, ZK state is abandoned on every
   container recreate, and brokers then die with `InconsistentClusterIdException`.
   (This was the root cause of the lab's recurring "kafka needs a volume reset" failures;
   fixed in the base compose 2026-08-12.)

Also production-required (not drilled in the lab): SASL/mTLS on both listeners — they are
PLAINTEXT in the lab — and partition counts sized to consumer parallelism.

## 2. Flink — JobManager HA (ZooKeeper), 2 TMs, object-store state

Config (the overlay carries it verbatim; production changes only the endpoints):
```yaml
high-availability.type: zookeeper
high-availability.zookeeper.quorum: <zk1>:2181,<zk2>:2181,<zk3>:2181   # lab used 1 ZK
high-availability.storageDir: s3://ams-flink/ha                       # same store as checkpoints
high-availability.cluster-id: /ams-flink-ha
```
- Both JMs run identical config except `jobmanager.rpc.address` (own hostname each).
- TaskManagers get the same HA block and find the leader via ZK — no static JM address.
- Checkpoints/savepoints already live on MinIO/S3 (Plan 02); HA metadata goes to the
  same bucket. **HA without durable checkpoints is worthless** — restore needs both.
- The standby JM's REST answers "leader election ongoing" until it leads — that is
  normal, not a fault. Point dashboards/automation at both, or at a VIP/LB.
- **Supervisor subordination:** `ensure_flink_jobs.py` (the 60s supervisor) must only
  submit a job that is genuinely ABSENT, never restart one HA is already recovering —
  with HA on, a JM kill is recovered by the standby in seconds, and a supervisor that
  re-submits in that window creates duplicate jobs.

**Drill result (lab):** stateful job (StateMachineExample) checkpointed to
`s3://ams-flink/checkpoints/...`; the **leader** JM was killed; the standby took over and
the job was **RUNNING again in 9 seconds**, `restored from chk-1` — i.e. **with keyed
state, automatically**. The killed JM rejoined as standby with no intervention.

Production sizing: 2 TMs minimum so a TM loss has somewhere to reschedule; keep the
TaskManager unlimited-memory note from the compose file in mind (CPLM diagnostics state).

## 3. PostgreSQL — primary + streaming replica + PgBouncer

### One-time primary preparation
```sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD '<PG_REPLICATION_PASSWORD>';
```
```bash
echo 'host replication replicator all scram-sha-256' >> $PGDATA/pg_hba.conf
psql -c 'SELECT pg_reload_conf();'
# wal_level=replica and max_wal_senders=10 are PG15 defaults — nothing to change.
```

### Replica bootstrap
The overlay's `postgres-replica` entrypoint does it: empty PGDATA →
`pg_basebackup -h <primary> -U replicator -Fp -Xs -R -P` (`-R` writes `standby.signal` +
`primary_conninfo`), then starts as a **hot standby** (read-only, queryable).

### PgBouncer cutover (production)
- Lab-verified image: `edoburu/pgbouncer` (bitnami versioned tags are gone from docker.io).
- `pool_mode=transaction`, `default_pool_size=20`, `max_client_conn=500` as the starting
  point for ~12 client processes; set explicit Npgsql pool sizes per service.
- Cutover = change each service's `ConnectionStrings` host `postgres:5432` →
  `pgbouncer:6432`. **Caveat:** transaction pooling breaks session state (LISTEN/NOTIFY,
  advisory locks, temp tables). Audit before cutover; route offenders directly.

### Failover (manual, rehearsed)
```bash
docker exec -u postgres <replica> pg_ctl promote -D /var/lib/postgresql/data
# then repoint PgBouncer's DB_HOST at the new primary and reload it.
```

**Drill result (lab):** streaming replication attached (`pg_stat_replication`:
`streaming/async`, replay lag **8.8 ms**); writes on the primary visible on the replica;
replica correctly refused writes; queries through PgBouncer worked against the real `ams`
DB; `pg_ctl promote` made the replica writable in ~2 s while the primary was untouched.

Production additions beyond the drill: automated failover (Patroni + etcd — needs its own
3-node DCS; adopt when a maintenance-window manual promote is no longer acceptable),
PITR/WAL archiving with a rehearsed restore, and image pinning by digest.

## 4. IoTDB — primary + async pipe replica (DR)

```sql
-- on the primary, replica reachable at <replica-host>:6667
CREATE PIPE ha_dr WITH SINK ('sink'='iotdb-thrift-sink',
                             'sink.node-urls'='<replica-host>:6667');
SHOW PIPES;   -- expect RUNNING
```
- This is **DR, not HA**: async, last-writer-wins, no automatic failover. Promote =
  repoint `IOTDB_HOST` (Flink jobs, historian-bff) at the replica. Accept the async gap:
  points not yet piped at failure time are lost — matches the approved decision.
- Replica runs the same standalone image; schema auto-creates on pipe delivery.
- The upgrade path when consensus is required later: 3C3D per platform spec §6 —
  the plan doc keeps it; nothing here forecloses it.
- Credentials: move off `root/root` on BOTH nodes; the pipe accepts
  `'sink.username'/'sink.password'` options.

**Drill result (lab):** pipe `RUNNING`; a point inserted on the primary was readable on
the replica within ~8 s.

## 5. EMQX — single node (decision)

Left as-is per decision. Clients already reconnect through the gateway path (`/mqtt-ws`).
If clustering is ever wanted: EMQX core-replica clustering needs shared auth/ACL state —
treat as a separate change with its own drill.

## 6. Dev vs production footprint

| | dev (base compose) | drill (base + ha overlay) | production |
|---|---|---|---|
| Kafka | 1 broker, RF=1, auto-create ON | 3 brokers, RF=3, auto-create OFF | 3 brokers (existing estate), RF=3, minIsr=2, SASL/mTLS |
| Flink | 1 JM + 1 TM, no HA | 2 JM (ZK HA) + 2 TM | same, 3-node ZK quorum |
| Postgres | single | + streaming replica + PgBouncer | same + Patroni/PITR when approved |
| IoTDB | single | + pipe replica | same, credentials rotated |
| ZK | 1 node | 1 node (lab quorum) | the existing 3-node ensemble |

After drills the lab returns to the base footprint: RF rolled back to 1 (including
`__consumer_offsets` — **an RF=3/minIsr=2 offsets topic on a single broker blocks every
offset commit**), pipe dropped, replica volumes removed. The overlay changes nothing
unless explicitly composed in.
