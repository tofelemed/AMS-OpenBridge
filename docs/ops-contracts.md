# Deliberate operational contracts (do not "fix" these)

Plan 08 item 7 (INFO-01 / INFO-02). These behaviors were reviewed and **kept on
purpose**. If a change is proposed against one of them, the burden of proof is on
the change, not the contract.

## 1. At-least-once + idempotent sink — NOT exactly-once (INFO-01)

Three persistence paths deliberately run at-least-once with idempotent writes,
which is cheaper and operationally simpler than end-to-end exactly-once and gives
the same effective result:

| Path | Idempotency key | Where |
|---|---|---|
| IoTDB historian writes | `series + timestamp` (re-insert overwrites the same point) | `IoTDBPersistenceJob`, `RawLoopIotDbConsumer` |
| `live.*` Redis snapshot/live keys | `alarmId + ts` (last-write-wins per key) | live state publishers |
| CPLM result persistence | `ON CONFLICT` upsert | `cplm-api` consumers |

Duplicates on redelivery are absorbed by the key, so **enabling Kafka
transactions / exactly-once on these paths adds latency and failure modes without
changing the stored outcome.** The Flink *alarm lifecycle* path is the one place
exactly-once semantics matter, and it has its own guarantees — do not conflate
the two.

## 2. SignalR 30s poll fallback is correct by design (INFO-02)

The frontend keeps a 30-second polling fallback alongside the SignalR alarm push.
It is guarded per tick (a new poll never starts while one is in flight, timers
cannot stack) and exists so a wedged WebSocket degrades to 30s-stale data instead
of a frozen alarm list. It is not a bug, not a leftover, and its interval is not
worth tuning — investigate the push path instead if data looks stale.

## 3. Health semantics (Plan 10 C1, restated here for ops)

- Container liveness = `/health/ready` = **postgres only**. A down Kafka/Flink
  must never restart-loop ams-api.
- Pipeline state = `/health/pipeline` (kafka + flink-ingest) and the aggregate
  `/health`. "Container healthy but pipeline degraded" is a *designed* state,
  not a contradiction.

## 4. In-service rate limiter stays (Plan 10 C4)

ams-api keeps its own fixed-window limiter (`alarms-read` 1000/min,
`alarms-write` 300/min) even though the gateway also rate-limits: the in-service
limiter is the only protection against **in-network** callers that bypass the
gateway. Do not remove it as "duplicate".
