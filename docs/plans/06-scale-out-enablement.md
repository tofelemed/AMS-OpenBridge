# Plan 06 — Scale-Out Enablement

> **STATUS (2026-08-11): DEFERRED by decision — ams-api stays single-instance.**
> Measured footprint (191 MB RAM / ~4.5% CPU with the full lab pipeline) is nowhere near
> one instance's limits, and replicas buy no real availability while Kafka (RF=1),
> Postgres, Flink, and Redis are single points of failure (Plan 09). Revisit when
> concurrent operator connections approach ~500+ or Plan 09 is committed — then do both
> together. **Item 2's shutdown note was executed now** (the only single-instance-relevant
> piece): the three UI-topic consumers (`AlarmStateDeltaConsumerService`,
> `ReplayResultConsumerService`, `DriftAlertConsumerService`) now call `consumer.Close()`
> so restarts don't stall delta delivery for the broker session timeout. Everything else
> below is untouched and remains the playbook for when scale-out is actually needed.
> **The partition-split trap stands: never run 2 replicas before item 2's group-id fix.**

**Phase:** 2 · **Effort:** M · **Depends on:** Plan 04 (gateway load-balances replicas), Plan 02 (CPLM single-member enforcement)
**Gaps closed:** SCALE-01
**Objective:** remove the architectural pin that forces `ams-api` to run as a single instance, so the API tier can scale horizontally to the target operator count.

## Why

`ams-api` holds ~2,000 SignalR connections and fans out ~10k messages/s at target scale — but it **cannot be replicated today**. There is no SignalR backplane (an explicit code comment says "Single-instance backend does not need Redis backplane"), and worse, the UI-topic consumers use fixed group ids with `Clients.All`: adding a second instance would split Kafka partitions between them, so each instance's connected clients would receive only *half* the alarm deltas. That is a silent correctness failure, not just a capacity limit.

## Work items

| # | Task | Gap | Where | Effort |
|---|---|---|---|---|
| 1 | Add the SignalR Redis backplane | SCALE-01 | `AMS.Api/Program.cs` | S |
| 2 | Fix the UI-topic consumer group strategy | SCALE-01 | `AMS.Api/BackgroundServices/*ConsumerService.cs` | M |
| 3 | Make the instance stateless and health-probe correct | SCALE-01 | `AMS.Api` | S |
| 4 | Run and load-test multiple replicas | SCALE-01 | compose/Helm, load harness | M |

## Implementation steps

### 1. SignalR backplane

- Register `AddSignalR().AddStackExchangeRedis(...)` pointing at the Redis **cache tier** from Plan 05 (not the contract tier — backplane traffic must never evict snapshots, and vice versa).
- Configure a dedicated channel prefix so backplane traffic is isolated from cache and snapshot keys.
- Remove the "single-instance backend" comment and the unused `StackExchange.Redis` import left behind.

### 2. UI-topic consumers under replication

Three consumers (`AlarmStateDeltaConsumerService`, `ReplayResultConsumerService`, `DriftAlertConsumerService`) each read a topic with a **fixed group id** and broadcast to `Clients.All`. Under replication, partitions split and each replica sees a subset.

Choose one pattern and apply it consistently:

- **Recommended — per-instance group id:** give each replica a unique group (e.g. `ams-delta-consumer-ui-{instanceId}`) so **every** replica consumes **all** partitions and can broadcast the full stream to its own clients. With the backplane in place, deduplicate at the hub or accept idempotent broadcasts (the UI applies deltas by id).
- **Alternative — single dispatcher:** keep one shared group and have the consuming replica publish to the backplane, letting all instances fan out. Fewer Kafka connections, but reintroduces a single consuming member that must be leader-elected.

Note these consumers are also the three that never call `consumer.Close()` on shutdown (dispose only) — fix that here so a rebalance does not wait for the session timeout on every deploy.

### 3. Stateless instance hygiene

- Audit for in-memory state that assumes a single instance (caches, counters, dedupe sets) and move anything shared to Redis.
- Separate liveness from readiness: readiness should fail while the hub/backplane or Kafka connection is not established, so the gateway does not route to a warming instance.
- Confirm graceful shutdown drains SignalR connections so clients reconnect to a healthy replica.

### 4. Prove it

- Deploy ≥2 replicas behind the gateway.
- Load test to the target model: ~2,000 concurrent hub connections, ~10k msg/s fan-out.
- Verify every connected client receives **every** alarm delta regardless of which replica it landed on — this is the acceptance test that the group-id fix worked.

## Exit criteria

- [ ] Two or more `ams-api` replicas run simultaneously behind the gateway.
- [ ] A client connected to replica A receives alarm deltas produced through replica B (backplane proven).
- [ ] With N replicas running, **no** alarm delta is missed by any connected client (partition-split defect gone).
- [ ] Load test sustains ~2,000 connections and ~10k msg/s within the field-to-HMI latency budget.
- [ ] Rolling restart of one replica does not drop alarm delivery for clients on the other.
- [ ] Backplane traffic uses the cache tier and cannot evict snapshot contract keys.

## Rollback

Scale back to a single replica — the backplane is harmless with one instance. Revert the group-id change only together with the replica count, since per-instance groups on a single instance are fine but shared groups on multiple instances are not.

## Risks & notes

- **Do not scale replicas before item 2 lands.** Running two instances with today's shared group ids silently halves alarm delivery — the failure is invisible in logs.
- `cplm-api` remains deliberately single-member for its result consumers (Plan 02 item 3 enforces it technically); its **API surface** can still scale if the consumers are gated to one instance. Keep that split explicit in the deployment manifest.
- Sticky sessions at the gateway are an interim option if the backplane is delayed, but they do not fix the consumer partition-split — item 2 is required either way.
- Backplane adds a Redis dependency to the realtime path; Redis HA is considered in [Plan 09](./09-replication-clustering-ha.md).
