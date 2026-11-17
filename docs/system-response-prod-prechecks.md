# System Response: plant pre-checks (read-only)

Run on the plant VM before the SME fixes are approved (`system-response-fixes-for-sme.md`). Every command only
reads: Postgres runs with `default_transaction_read_only=on` and a 2-minute statement limit; IoTDB runs `select`
only. Each block writes its output to `/tmp/sr-precheck/`; step 9 packs it to send back.

Run the blocks in order, in one shell (the setup defines the helpers the other blocks use). The two 7-day IoTDB
scans (4b, 7a) read a week of samples for every loop: run them outside a busy period.

## 0. Setup

```bash
mkdir -p /tmp/sr-precheck && cd /opt/AMS-open
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=120000'
q()  { docker exec -e PGOPTIONS="$PGOPTIONS" instrumental-postgres psql -U postgres -d traverse_cplm -P pager=off -c "$1"; }
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' migration/.env | cut -d= -f2-)
iq() { docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" -e "$1"; }
nz() { awk -F'|' 'NF>=4 && $3+0>0 {gsub(/ /,"",$2); print $2, $3+0}' | sort -k2 -nr; }   # IoTDB rows with a count > 0
```

## 1. Health: engine running, retention working, sizes

```bash
{ docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'cplm-api|flink|instrumental-postgres|ams-iotdb'
  docker exec ams-flink-jobmanager flink list -m localhost:8081 | grep -i respon
  q "select record_class, days, max_bytes from analytics.retention_policy where record_class like 'RESPONSE%' order by 1"
  q "select capture_state, count(*) events, min(created_at)::timestamp(0) oldest, max(created_at)::timestamp(0) newest
     from analytics.response_event group by 1 order by 1"
  q "select relname, pg_size_pretty(pg_total_relation_size(c.oid)) size from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'analytics' and relname in ('response_event','response_metric','system_model') order by 1"
} 2>&1 | tee /tmp/sr-precheck/1-health.txt
```
Look for: the response job RUNNING; `newest` within the last hour; CENSORED `oldest` no more than 3 days ago (the
purge works). COMPLETE may be older where a model was built from the event.

## 2. Item 1: how events end, and which events happen

```bash
{ q "select event_type, capture_state, coalesce(nullif(censor_reason,''),'-') reason, count(*)
     from analytics.response_event where created_at > now() - interval '3 days' group by 1,2,3 order by 4 desc"
  q "select created_at::date as day, count(*) filter (where capture_state = 'CENSORED') censored,
            count(*) filter (where capture_state = 'COMPLETE') accepted, count(*) filter (where capture_state not in ('CENSORED','COMPLETE')) other
     from analytics.response_event where created_at > now() - interval '30 days' group by 1 order by 1"
  q "select count(distinct loop_id) loops_with_events_3d from analytics.response_event where created_at > now() - interval '3 days'"
  q "select loop_id, count(*) filter (where capture_state = 'CENSORED') censored, count(*) filter (where capture_state = 'COMPLETE') accepted,
            count(*) filter (where event_type = 'SERVO_STEP') sp_steps, count(*) filter (where event_type = 'RAMP_TRACKING') ramps,
            count(*) filter (where event_type = 'INPUT_TEST') input_tests
     from analytics.response_event where created_at > now() - interval '3 days' group by 1 order by 2 desc limit 20"
} 2>&1 | tee /tmp/sr-precheck/2-events.txt
```
Look for: the censored share and its main reason (the lab: 97 % input tests superseded); whether setpoint steps
happen at all; whether a few loops produce most events. Censored events are kept 3 days, so compare on the 3-day
query only.

## 3. Accepted events: model fit and model check

```bash
{ q "select r.loop_type, e.event_type, e.result->'subgates'->'D'->>'state' estimation,
            coalesce(nullif(e.result->'subgates'->'D'->'outputs'->>'legality',''),'-') legality,
            coalesce(nullif(e.result->'subgates'->'D'->'outputs'->>'reason',''),'-') reason, count(*)
     from analytics.response_event e join cpm.loop_registry r using (loop_id)
     where e.capture_state = 'COMPLETE' group by 1,2,3,4,5 order by 1, 6 desc"
  q "select coalesce(nullif(model_state,''),'-') model_state, coalesce(nullif(result->'subgates'->'E'->'outputs'->>'reason',''),'-') check_reason, count(*)
     from analytics.response_event where capture_state = 'COMPLETE' group by 1,2 order by 3 desc"
} 2>&1 | tee /tmp/sr-precheck/3-accepted.txt
```
Look for (items 1, 2, 5): how many accepted events get a model; LIC setpoint steps with legality
`PEM_NOT_INSTALLED_FOR_INTEGRATING` (item 5); why models stay Candidate or are Rejected.

## 4. Item 1: controller mode and sample rate (historian)

```bash
{ echo '--- 4a last mode per loop'
  iq "select last mode from root.hdpe.cpm.*" | awk -F'|' 'NF>=6 && $3 ~ /\.mode/ {gsub(/ /,"",$4); print $4}' | sort | uniq -c
  echo '--- 4b loops with MAN samples, last 7 days (change MAN if 4a shows another manual word)'
  iq "select count(mode) from root.hdpe.cpm.* where mode = 'MAN' and time > now() - 7d align by device" | nz | head -40
  echo '--- 4c samples per loop in the last hour (3600 = 1 s, 720 = 5 s, 60 = 1 min)'
  iq "select count(pv) from root.hdpe.cpm.* where time > now() - 1h align by device" | awk -F'|' 'NF>=4 && $3 ~ /[0-9]/ {print $3+0}' | sort -n | uniq -c
  q "select round((result->'subgates'->'A'->'outputs'->>'sample_grid_s')::numeric) grid_s, count(*)
     from analytics.response_event where created_at > now() - interval '3 days' group by 1 order by 1"
} 2>&1 | tee /tmp/sr-precheck/4-mode-rate.txt
```
Look for: whether loops are ever put in Manual (if none, item 1's Manual bump tests will rarely happen); the sample
interval (the source-gap rule censors after 60 s without a sample).

## 5. Item 2: tag name vs declared process behaviour

```bash
{ q "select loop_type, coalesce(dynamic_class,'(not declared)') behaviour, coalesce(classification_source,'-') source, count(*)
     from cpm.loop_registry where is_active group by 1,2,3 order by 1, 4 desc"
  q "select loop_id, loop_type, dynamic_class, classification_source from cpm.loop_registry where is_active and (
       (loop_type not like 'LIC%' and dynamic_class in ('INTEGRATING','NEAR_INTEGRATING','INTEGRATING_LAG')) or
       (loop_type like 'LIC%' and dynamic_class is not null and dynamic_class not in ('INTEGRATING','NEAR_INTEGRATING','INTEGRATING_LAG')))
     order by 1"
  q "select r.loop_type, m.family, m.model_state, count(*), count(m.reviewed_by) reviewed
     from analytics.system_model m join cpm.loop_registry r using (loop_id) group by 1,2,3 order by 1,2,3"
} 2>&1 | tee /tmp/sr-precheck/5-model-type.txt
```
Look for: how many loops have a declared behaviour at all; the second query lists the loops item 2 would change.

## 6. Item 3: PV ranges

```bash
{ q "with s as (select loop_type, case when jsonb_typeof(engineering->'pvMin') = 'number' and jsonb_typeof(engineering->'pvMax') = 'number'
                 then (engineering->>'pvMax')::float8 - (engineering->>'pvMin')::float8 end span
               from cpm.loop_registry where is_active)
     select loop_type, count(*) loops, count(span) with_range, round(min(span)::numeric,2) min_span,
            round((percentile_cont(0.5) within group (order by span))::numeric,2) median_span, round(max(span)::numeric,2) max_span,
            count(*) filter (where span < 20) span_under_20, count(*) filter (where span > 1000) span_over_1000
     from s group by 1 order by 1"
  q "select loop_id, loop_type, engineering->>'pvUnit' unit, engineering->>'pvMin' pv_min, engineering->>'pvMax' pv_max
     from cpm.loop_registry where is_active and jsonb_typeof(engineering->'pvMin') = 'number' and jsonb_typeof(engineering->'pvMax') = 'number'
       and (engineering->>'pvMax')::float8 - (engineering->>'pvMin')::float8 < 20 order by 1"
} 2>&1 | tee /tmp/sr-precheck/6-ranges.txt
```
Look for: loops without a range (they keep today's rule); loops with a span under 20, where today's 1.0-unit
minimum is 5 % of range or more.

## 7. Items 6 and 4: valve at its limit, operating region, controller tuning

```bash
{ echo '--- 7a loops with OP at or below 1 % or at or above 99 %, samples in the last 7 days'
  iq "select count(op) from root.hdpe.cpm.* where (op <= 1 or op >= 99) and time > now() - 7d align by device" | nz | head -40
  q "select state, count(*) bundles, count(*) filter (where resolved::text like '%pv_region%') with_pv_region
     from cpm.gate_config_bundle group by 1 order by 1"
  q "select signal_role, coalesce(source_system,'-') source_system, count(*) from cpm.loop_tag_map where is_active group by 1,2 order by 1,2"
  q "select to_jsonb(t) - 'unit_conversion' mapping from cpm.loop_tag_map t where loop_id = 'PIC80105' and is_active"
  q "select count(*) models, count(controller_snapshot_id) with_controller_tuning from analytics.system_model"
} 2>&1 | tee /tmp/sr-precheck/7-limits-tuning.txt
```
Look for: how often valves sit at a limit (7a; a loop whose OP is not 0–100 % shows wrongly here); whether any
bundle sets an operating region; whether the tag map carries anything beyond PV/SP/OP/VP/mode (it has no tuning
today) and how a source tag is named, so the DCS tuning tags can be named for item 4.

## 8. Item 7: decay ratio

```bash
{ q "select width_bucket(value, 0, 1, 5) bucket, round(min(value)::numeric,2) lo, round(max(value)::numeric,2) hi, count(*)
     from analytics.response_metric where quantity_id = 'decay_ratio' and value is not null group by 1 order by 1"
} 2>&1 | tee /tmp/sr-precheck/8-decay.txt
```
Look for: many values near 1 (bucket 5 and above) mean noise is being read as a second peak.

## 9. Pack and send back

```bash
unset IOTDB_PW PGOPTIONS
tar czf /tmp/sr-precheck.tgz -C /tmp sr-precheck && ls -l /tmp/sr-precheck.tgz
```
Send `/tmp/sr-precheck.tgz`. It holds counts, loop tags and ranges only: no passwords.

## 10. Follow-up after the first run (17 Nov)

Run in a new shell (step 9 cleared the password). The two 7-day counts in 10b repeat the heavy scans of 4b and 7a:
run outside a busy period. Paste the output back.

```bash
cd /opt/AMS-open && mkdir -p /tmp/sr-precheck
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' migration/.env | cut -d= -f2-)
iq() { docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" -e "$1"; }
nz() { awk -F'|' 'NF>=4 && $3+0>0 {gsub(/ /,"",$2); print $2, $3+0}' | sort -k2 -nr; }
{ echo '--- 10a loops in MAN with the output between 1 and 99 %, last 7 days: samples, lowest and highest output'
  iq "select count(op), min_value(op), max_value(op) from root.hdpe.cpm.* where mode = 'MAN' and op > 1 and op < 99 and time > now() - 7d align by device" | awk -F'|' 'NF>=6 && $3+0>0 {gsub(/ /,""); print $2, $3, $4, $5}' | sort -k2 -nr
  echo '--- 10b loops with any MAN sample, then loops with any output at a limit, last 7 days (4b and 7a stopped at 40)'
  iq "select count(mode) from root.hdpe.cpm.* where mode = 'MAN' and time > now() - 7d align by device" | nz | wc -l
  iq "select count(op) from root.hdpe.cpm.* where (op <= 1 or op >= 99) and time > now() - 7d align by device" | nz | wc -l
  echo '--- 10c last PV sample per loop, counted by hour'
  iq "select last pv from root.hdpe.cpm.*" | awk -F'|' 'NF>=6 && $3 ~ /\.pv/ {gsub(/ /,"",$2); print substr($2,1,13)}' | sort | uniq -c
} 2>&1 | tee /tmp/sr-precheck/10-followup.txt
unset IOTDB_PW
```
Look for: 10a, loops in Manual whose lowest and highest output differ by a few % or more. Those are where manual
moves or bump tests happen (item 1); equal values mean a parked output. 10b, the full counts behind 4b and 7a.
10c, the 84 loops without a recent PV are the loops retired on 11 and 16 Nov (see 12).

## 12. Re-check on the current loops (after the 16 Nov loop change)

Most of the old loops were retired on 16 Nov (06:33 and 13:09 UTC) and the real loops added; the 84 loops that
10c found without a recent PV are the retired ones. Blocks 2, 4 and 7 counted both lists. This block repeats the
figures that depend on the loop list, for the active loops only, from 16 Nov 13:10 UTC. Read-only.

```bash
cd /opt/AMS-open && mkdir -p /tmp/sr-precheck && cd /tmp/sr-precheck
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=120000'
q()  { docker exec -e PGOPTIONS="$PGOPTIONS" instrumental-postgres psql -U postgres -d traverse_cplm -P pager=off -c "$1"; }
qa() { docker exec -e PGOPTIONS="$PGOPTIONS" instrumental-postgres psql -U postgres -d traverse_cplm -At -c "$1"; }
IOTDB_PW=$(grep -E '^IOTDB_PASSWORD=' /opt/AMS-open/migration/.env | cut -d= -f2-)
iq() { docker exec ams-iotdb /iotdb/sbin/start-cli.sh -h 127.0.0.1 -p 6667 -u root -pw "$IOTDB_PW" -e "$1"; }
SINCE_SQL="timestamptz '2026-11-16 13:10+00'"; SINCE_IOT='2026-11-16T13:10:00.000+00:00'
ACT="loop_id in (select loop_id from cpm.loop_registry where is_active)"
onlyact() { awk 'NR==FNR {a[$1]; next} {d=$1; sub(/^root\.[^.]*\.cpm\./,"",d)} d in a {$1=d; print}' active-loops.txt -; }
{ echo '--- 12a active loops, loops with a live PV, and the difference'
  qa "select loop_id from cpm.loop_registry where is_active" | LC_ALL=C sort > active-loops.txt
  iq "select last pv from root.hdpe.cpm.*" | awk -F'|' 'NF>=6 && $3 ~ /\.pv/ {gsub(/ /,"",$2); gsub(/ /,"",$3); split($3,a,"."); print substr($2,1,16), a[4]}' | sort > last-pv.txt
  NEWEST=$(tail -1 last-pv.txt | cut -d' ' -f1); CUT=$(date -u -d "${NEWEST/T/ } UTC -10 min" +%Y-%m-%dT%H:%M)
  awk -v c="$CUT" '$1 >= c {print $2}' last-pv.txt | LC_ALL=C sort > live-loops.txt
  echo "active $(wc -l < active-loops.txt), live $(wc -l < live-loops.txt)"
  echo 'active, no live PV:'; LC_ALL=C comm -23 active-loops.txt live-loops.txt | paste -sd' ' -
  echo 'live, not active:';   LC_ALL=C comm -13 active-loops.txt live-loops.txt | paste -sd' ' -
  q "select count(distinct loop_id) inactive_loops_with_active_tag_map from cpm.loop_tag_map t
     where is_active and not exists (select 1 from cpm.loop_registry r where r.loop_id = t.loop_id and r.is_active)"
  echo '--- 12b events on active loops since the change'
  q "select event_type, capture_state, coalesce(nullif(censor_reason,''),'-') reason, count(*), count(distinct loop_id) loops
     from analytics.response_event where created_at >= $SINCE_SQL and $ACT group by 1,2,3 order by 4 desc"
  q "select count(distinct loop_id) loops_with_events from analytics.response_event where created_at >= $SINCE_SQL and $ACT"
  q "select coalesce(nullif(model_state,''),'-') model_state, coalesce(nullif(result->'subgates'->'E'->'outputs'->>'reason',''),'-') check_reason, count(*)
     from analytics.response_event where capture_state = 'COMPLETE' and created_at >= $SINCE_SQL and $ACT group by 1,2 order by 3 desc"
  echo '--- 12c last mode of active loops'
  iq "select last mode from root.hdpe.cpm.*" | awk -F'|' 'NF>=6 && $3 ~ /\.mode/ {gsub(/ /,"",$3); gsub(/ /,"",$4); split($3,a,"."); print a[4], $4}' | onlyact | awk '{print $2}' | sort | uniq -c
  H=$(( ($(date -u +%s) - $(date -u -d '2026-11-16 13:10 UTC' +%s)) / 3600 ))
  echo "--- 12d active loops with MAN samples since the change ($H h, about $((H * 770)) samples is the whole time): samples, lowest and highest output"
  iq "select count(op), min_value(op), max_value(op) from root.hdpe.cpm.* where mode = 'MAN' and time >= $SINCE_IOT align by device" | awk -F'|' 'NF>=6 && $3+0>0 {gsub(/ /,""); print $2, $3, $4, $5}' | onlyact | sort -k2 -nr
  echo "--- 12e active loops with the output at 0-1 % or 99-100 % since the change: samples (about $((H * 770)) is the whole time)"
  iq "select count(op) from root.hdpe.cpm.* where (op <= 1 or op >= 99) and time >= $SINCE_IOT align by device" | awk -F'|' 'NF>=4 && $3+0>0 {gsub(/ /,"",$2); print $2, $3+0}' | onlyact | sort -k2 -nr
} 2>&1 | tee /tmp/sr-precheck/12-current-loops.txt
unset IOTDB_PW PGOPTIONS
```
Look for: 12a, active loops with no live PV (new loops not flowing yet, or retired loops still marked active) and
inactive loops whose tag map is still active; 12b to 12e, the item 1 and item 6 figures on the real loops.

## Questions for the I&C team (no command)

- Can the OPC server read the PID block tuning? The DCS is Yokogawa CENTUM, where these are normally the P
  (proportional band), I and D items, for example `FCS0101.PIC80105.P`. Which control algorithm do the loops use
  (PID, PI-D, I-PD)? (Item 4.)
- Are bump tests done in Manual on this plant, and how often (item 1)?
