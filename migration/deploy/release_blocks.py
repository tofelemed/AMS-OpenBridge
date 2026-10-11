"""Release-specific VM-STEPS blocks added after v2.7.0 (kept out of build-release.py, which is past its size budget).

Each block is opt-in through a `!directive` in the release manifest and is inserted into the generated
VM-STEPS.md just before the "# 8. post-update checks" section, i.e. after every image swap (step 6).
"""
from __future__ import annotations

DIRECTIVES = {"chg081-superadmin", "chg088-vp-republish"}


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


BLOCKS = {"chg081-superadmin": chg081_superadmin, "chg088-vp-republish": chg088_vp_republish}


def insert(steps: str, release: str, flags: set[str]) -> str:
    """Insert the blocks the manifest asks for before step 8; unchanged when it asks for none."""
    extra = "".join(BLOCKS[d](release) for d in sorted(flags & DIRECTIVES))
    if not extra:
        return steps
    marker = "\n# 8. post-update checks"
    i = steps.find(marker)
    return steps + extra if i < 0 else steps[:i] + extra + steps[i:]
