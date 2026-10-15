"""Release-specific VM-STEPS blocks added after v2.7.0 (kept out of build-release.py, which is past its size budget).

Each block is opt-in through a `!directive` in the release manifest and is inserted into the generated
VM-STEPS.md just before the "# 8. post-update checks" section, i.e. after every image swap (step 6) - or, for a
PRE_SWAP block (v2.8.0+), just before "# 4. load": after the source extract (4a) and before step 5, whose
deploy.sh --prod already recreates every changed service.
"""
from __future__ import annotations

DIRECTIVES = {"chg081-superadmin", "chg088-vp-republish", "chg099-cpm15", "chg091-cpm16"}


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


BLOCKS = {"chg081-superadmin": chg081_superadmin, "chg088-vp-republish": chg088_vp_republish,
          "chg099-cpm15": chg099_cpm15, "chg091-cpm16": chg091_cpm16}
PRE_SWAP = {"chg099-cpm15"}


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
