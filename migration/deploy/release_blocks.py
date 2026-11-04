"""Release-specific VM-STEPS blocks added after v2.7.0 (kept out of build-release.py, which is past its size budget).

Each block is opt-in through a `!directive` in the release manifest and is inserted into the generated
VM-STEPS.md just before the "# 8. post-update checks" section, i.e. after every image swap (step 6) - or, for a
PRE_SWAP block (v2.8.0+), just before "# 4. load": after the source extract (4a) and before step 5, whose
deploy.sh --prod already recreates every changed service.
"""
from __future__ import annotations

DIRECTIVES = {"chg081-superadmin", "chg088-vp-republish", "chg099-cpm15", "chg091-cpm16", "chg102-cpm17", "chg102-cpm18",
              "chg102-cpm19", "chg102-cpm20"}


def chg081_superadmin(release: str) -> str:
    # CHG-081: mirrors changes_tracker.md "Patch release v2.7.1". The password is typed on the VM only.
    return f"""
# 6j. CHG-081 SuperAdmin role (traverse_auth, ONE transaction) - AFTER the traverse-auth-service swap.
#     Choose the SuperAdmin username / email / password first; type the password on the VM only (never in a file).
#     Every Admin / Engineer is logged out once. The script aborts before revoking anything unless the user exists.
docker exec -i instrumental-postgres psql -U postgres -d traverse_auth -1 -v ON_ERROR_STOP=1 \\
  -v su_username=superadmin -v su_email=superadmin@local -v su_password='<secret>' < /tmp/{release}/ops/cpm-14-superadmin-role.sql
#     last line: cpm-14 OK | 1 | <keys> | <n> | Admin, Engineer...  Then log in as the SuperAdmin: Administration opens;
#     an Admin login shows no Gate Configuration / Pipeline Health / Governance / Administration.
#     Rollback: ops/cpm-14-superadmin-role.rollback.sql gives Admin those keys back (the SuperAdmin role / user stay, harmless).
"""


def chg088_vp_republish(release: str) -> str:
    # CHG-088: the engine reads vpApplicability from cplm.loop.engineering only after each loop is republished.
    return f"""
# 6k. CHG-088 valve-position declaration to the engine - AFTER the new cplm-api is healthy and the 7 Flink jobs RUN.
#     Until a loop is republished the engine treats it as EXPECTED (the old behaviour), so the order is safe.
#     Chunks of 20 (the endpoint upserts signal assets first; 100 per call timed out on a loaded host). Idempotent.
export ADMIN_PW='...'                                   # an Admin (or the SuperAdmin) password; cpm.manage is required
python3 /tmp/{release}/ops/republish-all-loops.py           # dry run: prints the loop count
python3 /tmp/{release}/ops/republish-all-loops.py --apply   # last line: republished N/N loops - OK
#     Proof: a loop declared without a VP (registry checkbox unticked) loses the NO_VP flag on its next 12h/24h window;
#     G14 then reads NOT_APPLICABLE on a valve call, which stays SUSPECTED (0.89 cap kept - only a measured VP confirms).
"""


def chg099_cpm15(release: str) -> str:
    # CHG-099: the new cplm-api names evidence_manifest.reconstruction_of / analysis_run_id, so the columns come first.
    return f"""
# 4d. CHG-099 evidence reconstruction stored beside the original - BEFORE step 5 (its deploy.sh swaps cplm-api).
#     Online, additive, re-runnable: two nullable columns on analytics.evidence_manifest + two indexes (lab: instant on 1.05 M rows).
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-15-evidence-reconstruction-beside.sql
bash migration/02-apply-schemas.sh 2>&1 | tail -3                 # normalises ownership of the new objects to ams_user
"""


def chg091_cpm16(release: str) -> str:
    # CHG-091: the row is read by the new cplm-api's evidence sweeper (every 15 min); the model rule needs no row.
    return f"""
# 6l. CHG-091 Response retention - AFTER the new cplm-api is healthy. Online; one retention_policy row (RESPONSE_CENSORED = 3 d).
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-16-response-retention.sql
#     Within ~20 min (first sweep 5 min after start, then every 15) the log names the backlog it removed:
docker logs --since 30m traverse-cplm-api 2>&1 | grep 'Evidence retention:' | tail -2   # "... response event(s) and N unreviewed model(s) purged"
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select model_state, count(*) from analytics.system_model group by 1"
#     expected: unreviewed models older than 14 d gone (Marun 2026-10-15: 4,744), newest per loop and path kept.
"""


def chg102_cpm17(release: str) -> str:
    # CHG-102: the old cplm-api cannot maintain hourly partitions, so it stays stopped until step 6 starts the new image.
    return f"""
# 4e. CHG-102 short features in HOURLY partitions kept 6 h by DROP; LONG_FEATURES 1 d by DROP - BEFORE step 6 (its deploy.sh
#     recreates cplm-api). The 30-min DELETE cron retires (migration/prune-short-features.sh stays in the repo for rollback).
#     cplm-api is STOPPED from here until step 6 starts the new image: the old image's maintenance cannot read hourly partitions.
#     Seconds at plant size: the rows of the last 6 h are copied, the day partitions dropped (~1.1 GB back to the disk at once).
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select pg_size_pretty(pg_total_relation_size('analytics.cplm_short_feature_results'))"   # before (Marun 2026-11-03: 1110 MB)
sudo rm -f /etc/cron.d/cpa-prune-short-features
docker stop traverse-cplm-api
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-17-hot-window-partitions.sql
#     NOTICE: analytics.cplm_short_feature_results: N daily + 0 hourly partitions replaced by 10 hourly; M rows of the last 6 h kept
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select record_class||'='||coalesce(days::text,'-')||'d/'||coalesce(hours::text,'-')||'h' from analytics.retention_policy where record_class in ('SHORT_FEATURES','LONG_FEATURES','GATE_RESULTS') order by 1"
#     expected: GATE_RESULTS=14d/-h  LONG_FEATURES=1d/-h  SHORT_FEATURES=1d/6h
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select pg_size_pretty(pg_total_relation_size('analytics.cplm_short_feature_results'))"   # after: the 6 h of rows only
ls /etc/cron.d/ | grep -c prune-short-features   # 0
#     Do NOT docker start traverse-cplm-api here. After step 6, within a minute:
#       docker logs --since 5m traverse-cplm-api 2>&1 | grep Partitions   # no "every partition is Day" warning
#     From then on one hourly partition is created and one dropped per hour:
#       docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select count(*) from pg_inherits where inhparent = 'analytics.cplm_short_feature_results'::regclass"   # ~11-12
#     Rollback (cplm-api STOPPED): psql ... < /tmp/{release}/ops/cpm-17-hot-window-partitions.rollback.sql, then the previous
#     cplm-api image (step 2's list), then the cron back:
#       sudo cp migration/cron.d/cpa-prune-short-features /etc/cron.d/ && sudo chmod 644 /etc/cron.d/cpa-prune-short-features
"""


def chg102_cpm18(release: str) -> str:
    # CHG-102 Phase 6: additive tables the new cplm-api's FleetKpiDailyJob fills; the old image ignores them.
    return f"""
# 4f. CHG-102 daily fleet KPIs kept 3 years (analytics.cplm_kpi_daily + cplm_kpi_daily_run, retention KPI_DAILY = 1095 d)
#     - BEFORE the cplm-api swap (step 6 deploy.sh), so the new image finds the tables on its first pass. Online, additive,
#     re-runnable, instant; cplm-api may be running or stopped.
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-18-kpi-daily.sql
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select record_class||'='||coalesce(days::text,'-')||'d' from analytics.retention_policy where record_class = 'KPI_DAILY'"
#     expected: KPI_DAILY=1095d
#     After the swap, ~2 min after the new cplm-api starts, the first pass backfills the ended days the gate results still hold (13 x 2):
#       docker logs --since 10m traverse-cplm-api 2>&1 | grep 'KPI daily' | tail -3   # "... N day-window(s) stored ..."
#       docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select window_kind, count(*), min(day), max(day) from analytics.cplm_kpi_daily_run group by 1"
#     expected: 12h and 24h, ~13 days each, max(day) = yesterday (UTC; a day is taken 1 h after its end).
#     Rollback (online; the stored history is lost, the trend falls back to 14 days live):
#       docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-18-kpi-daily.rollback.sql
"""


def chg102_cpm19(release: str) -> str:
    # CHG-102 Phase 5b-1: additive archive tables the new cplm-api's EvidenceArchiver fills; the old image ignores them.
    return f"""
# 4g. CHG-102 evidence boundary archive (analytics.evidence_archive day partitions + evidence_archive_run, retention
#     EVIDENCE_ARCHIVE = 30 d / 12 GiB) - BEFORE the cplm-api swap (step 6 deploy.sh), so the new image archives from its first
#     pass. Online, additive, re-runnable (lock_timeout 10 s: if it fires, re-run); cplm-api may be running or stopped.
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-19-evidence-archive.sql
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select record_class||'='||coalesce(days::text,'-')||'d/'||coalesce((max_bytes>>30)::text,'-')||'GiB' from analytics.retention_policy where record_class = 'EVIDENCE_ARCHIVE'"
#     expected: EVIDENCE_ARCHIVE=30d/12GiB
#     After the swap and the new Flink jar, the first boundary (00:00 / 12:00 plant time) + 15 min is archived:
#       docker exec traverse-cplm-api curl -s localhost:5000/health | python3 -m json.tool | grep -A15 evidenceArchive   # installed true, behind false, lostToSweep 0
#       docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select window_kind, count(*), sum(artifact_count), pg_size_pretty(sum(payload_bytes)), max(window_end) from analytics.evidence_archive_run group by 1"
#     Rollback (online; every archived set is lost, the workbench serves live evidence only):
#       docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-19-evidence-archive.rollback.sql
"""


def chg102_cpm20(release: str) -> str:
    # CHG-102 Phase 5c: analysis_run.purpose allows EVALUATE (+ two partial indexes); the old image never writes EVALUATE.
    return f"""
# 4h. CHG-102 on-demand evaluation (analysis_run.purpose EVALUATE + reuse / in-flight indexes) - BEFORE the cplm-api swap
#     (step 6 deploy.sh). Online, additive, re-runnable (lock_timeout 10 s: if it fires, re-run). The two Kafka topics
#     traverse.cpa.clpm.evaluation.requests.v1 / .status.v1 come from kafka/topics.txt (04-create-kafka-topics.sh).
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-20-on-demand-evaluation.sql
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select pg_get_constraintdef(oid) from pg_constraint where conname = 'analysis_run_purpose_check'"
#     expected: CHECK ((purpose = ANY (ARRAY['REPLAY'::text, 'SHADOW'::text, 'EVIDENCE_RECONSTRUCTION'::text, 'EVALUATE'::text])))
#     cpm-20b: episodes and pins keep archived SETS past their day (evidence_archive_kept; EVIDENCE_ARCHIVE_EPISODE = 30 d
#     after close / 4 GiB). Without it the new image keeps the cpm-19 behaviour (a pinned day kept whole). Needs cpm-19.
docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-20b-evidence-archive-keep.sql
docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select record_class, days, max_bytes from analytics.retention_policy where record_class = 'EVIDENCE_ARCHIVE_EPISODE'"
#     expected: EVIDENCE_ARCHIVE_EPISODE|30|4294967296
#     After the swap and the on-demand Flink job: the Workbench "Evaluate window" (or POST /api/v1/cpm/analysis-runs
#     {{"purpose":"EVALUATE","loopId":"<loop>","windowKind":"12h"}}) ends FINISHED within seconds:
#       docker exec instrumental-postgres psql -U postgres -d traverse_cplm -Atc "select state, count(*), max(created_at) from analytics.analysis_run where purpose = 'EVALUATE' group by 1"
#     Rollback (online; roll the cplm-api image back first - EVALUATE runs and their gate rows are deleted):
#       docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-20-on-demand-evaluation.rollback.sql
#       docker exec -i instrumental-postgres psql -U postgres -d traverse_cplm -v ON_ERROR_STOP=1 < /tmp/{release}/ops/cpm-20b-evidence-archive-keep.rollback.sql   (kept sets lost)
"""


BLOCKS = {"chg081-superadmin": chg081_superadmin, "chg088-vp-republish": chg088_vp_republish,
          "chg099-cpm15": chg099_cpm15, "chg091-cpm16": chg091_cpm16, "chg102-cpm17": chg102_cpm17,
          "chg102-cpm18": chg102_cpm18, "chg102-cpm19": chg102_cpm19, "chg102-cpm20": chg102_cpm20}
PRE_SWAP = {"chg099-cpm15", "chg102-cpm17", "chg102-cpm18", "chg102-cpm19", "chg102-cpm20"}


def _at(steps: str, marker: str, extra: str) -> str:
    if not extra:
        return steps
    i = steps.find(marker)
    return steps + extra if i < 0 else steps[:i] + extra + steps[i:]


def insert(steps: str, release: str, flags: set[str]) -> str:
    """Insert the blocks the manifest asks for (PRE_SWAP before step 4, the rest before step 8); unchanged when it asks for none."""
    chosen = sorted(flags & DIRECTIVES)
    pre = "".join(BLOCKS[d](release) for d in chosen if d in PRE_SWAP)
    post = "".join(BLOCKS[d](release) for d in chosen if d not in PRE_SWAP)
    return _at(_at(steps, "\n# 4. load", pre), "\n# 8. post-update checks", post)
