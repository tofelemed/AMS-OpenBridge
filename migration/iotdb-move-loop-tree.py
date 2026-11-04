#!/usr/bin/env python3
"""CHG-101 - move the loop historian tree in IoTDB (root.site1.cpm -> root.hdpe.cpm) with NO data loss.

IoTDB 1.3.2 cannot rename a database or a path, so the move is a COPY (SELECT ... INTO, which keeps
each series' data type, encoding and compression), verified series by series. The old tree is never
touched: this tool has no delete. Runbook: migration/IOTDB-LOOP-TREE-MOVE.md.

  plan     read-only: databases, TTLs, device counts, conflicts
  prepare  CREATE DATABASE <new db> + SET TTL (the old database's TTL unless --ttl-ms)
  copy     copy [--from, --to) of every device under --old into --new; resumable (--state)
  verify   per series, count(new) >= count(old) over [--from, --to); any shortfall = exit 1

--layout v1 (default) copies the tree as it is. --layout v2 / v2-back move to / back from the CHG-102
layout (aligned raw devices, KPIs in their own databases): see migration/iotdb_move_v2.py.

Exit codes: 0 ok, 1 verify failed or IoTDB error, 2 precondition not met, 3 low disk (resume later).

Connection: by default `docker exec <container> curl` against the container's own REST port, which
works on the plant VM where 8181 is not published. --rest-url talks to a published port instead.
Password: env IOTDB_PASSWORD, else IOTDB_PASSWORD= from --env-file. Run as `python3 -I`.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I drops the script dir; the helper sits beside it
import iotdb_move_v2 as v2  # noqa: E402

DAY_MS = 86_400_000


class IoTDBError(RuntimeError):
    def __init__(self, msg: str, code: int | None = None):
        super().__init__(msg)
        self.code = code


# 305 = statement hit IoTDB's query timeout (60 s default): seen in the lab rehearsal under load.
# Every statement this tool sends is idempotent (SELECT INTO rewrites the same (series, time)),
# so timeouts and transport failures are retried; anything else (bad SQL, auth) fails at once.
RETRYABLE = {305, None}
# Seen on the first v2 bulk run (lab 2026-11-04): regions are created lazily on the first write to a new database,
# and one chunk failed with an NPE inside IoTDB. A SELECT INTO re-run writes the same points, so retrying is safe.
RETRYABLE_TEXT = ("no available DataRegionGroup", "NullPointerException")


def retryable(e: "IoTDBError") -> bool:
    return e.code in RETRYABLE or any(t in str(e) for t in RETRYABLE_TEXT)


def _curl_quote(s: str) -> str:
    """Escape backslash and double quote for a double-quoted value in a curl config file."""
    if any(c in s for c in "\n\r\t\v"):
        raise IoTDBError("control character in a curl config value")   # json.dumps never emits one
    return s.replace("\\", "\\\\").replace('"', '\\"')


class IoTDB:
    def __init__(self, user: str, password: str, rest_url: str | None, container: str,
                 retries: int = 4, pause_ms: int = 0):
        self.user, self.password = user, password
        self.rest_url = rest_url.rstrip("/") if rest_url else None
        self.container = container
        self.retries, self.pause_ms = retries, pause_ms

    def _post(self, endpoint: str, sql: str) -> dict:
        for attempt in range(self.retries + 1):
            try:
                out = self._post_once(endpoint, sql)
                if self.pause_ms:
                    time.sleep(self.pause_ms / 1000)   # pacing: leave IoTDB headroom for the live writer
                return out
            except IoTDBError as e:
                if not retryable(e) or attempt == self.retries:
                    raise
                wait = 15 * (attempt + 1)
                print(f"  retry {attempt + 1}/{self.retries} in {wait} s: {str(e)[:160]}", file=sys.stderr)
                time.sleep(wait)
        raise AssertionError("unreachable")

    def _post_once(self, endpoint: str, sql: str) -> dict:
        body = json.dumps({"sql": sql}).encode("utf-8")
        if self.rest_url:
            auth = base64.b64encode(f"{self.user}:{self.password}".encode()).decode()
            req = urllib.request.Request(f"{self.rest_url}/rest/v2/{endpoint}", data=body, method="POST",
                                         headers={"Content-Type": "application/json",
                                                  "Authorization": f"Basic {auth}"})
            try:
                with urllib.request.urlopen(req, timeout=900) as r:
                    raw = r.read()
            except OSError as e:
                raise IoTDBError(f"REST call failed: {e}") from e
        else:
            # Credentials and body go to curl as a config file on stdin (-K -), never in argv:
            # argv is visible in `ps` on the host and in docker exec events.
            cmd = ["docker", "exec", "-i", self.container, "curl", "-sS", "--max-time", "900", "-K", "-",
                   "-H", "Content-Type: application/json", f"http://127.0.0.1:8181/rest/v2/{endpoint}"]
            cfg = (f'user = "{_curl_quote(f"{self.user}:{self.password}")}"\n'
                   f'data-binary = "{_curl_quote(body.decode("utf-8"))}"\n')
            p = subprocess.run(cmd, input=cfg.encode("utf-8"), capture_output=True)
            if p.returncode != 0:
                raise IoTDBError(f"docker exec curl failed ({p.returncode}): "
                                 f"{p.stderr.decode(errors='replace').strip()}")
            raw = p.stdout
        try:
            data = json.loads(raw)
        except ValueError as e:
            raise IoTDBError(f"non-JSON answer: {raw[:300]!r}") from e
        # Queries answer without "code"; failures and nonQuery answer {"code": n, "message": ...}.
        if isinstance(data, dict) and data.get("code") not in (None, 200):
            raise IoTDBError(f"IoTDB {data.get('code')}: {data.get('message')} -- SQL: {sql}",
                             int(data.get("code")))
        return data

    def query(self, sql: str) -> dict:
        return self._post("query", sql)

    def execute(self, sql: str) -> None:
        self._post("nonQuery", sql)


def columns(resp: dict) -> dict[str, list]:
    """Column-major REST result -> {column name: values}."""
    names = resp.get("column_names") or resp.get("expressions") or []
    return dict(zip(names, resp.get("values") or []))


def databases(db: IoTDB) -> dict[str, int | None]:
    c = columns(db.query("show databases"))
    return dict(zip(c.get("Database", []), c.get("TTL", [])))


def owner(path: str, dbs: dict) -> str | None:
    """The database a path belongs to (databases are prefix-exclusive)."""
    for d in dbs:
        if path == d or path.startswith(d + "."):
            return d
    return None


def list_devices(db: IoTDB, prefix: str, loops: list[str]) -> list[str]:
    devs = sorted(columns(db.query(f"show devices {prefix}.**")).get("Device", []))
    if loops:
        want = set(loops)
        devs = [d for d in devs if loop_of(d, prefix) in want]
    return devs


def loop_of(device: str, prefix: str) -> str:
    return device[len(prefix) + 1:].split(".")[0]


def now_ms() -> int:
    return int(time.time() * 1000)


def parse_ms(v: str) -> int:
    if v == "now":
        return now_ms()
    if v.lstrip("-").isdigit():
        return int(v)
    dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise SystemExit(f"time '{v}' has no zone - give Z or +hh:mm")
    return int(dt.timestamp() * 1000)


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def chunks(a: int, b: int, size: int) -> list[tuple[int, int]]:
    """[a, b) cut on an absolute grid, so boundaries repeat between runs (resume keys)."""
    out, cur = [], a
    while cur < b:
        nxt = min((cur // size + 1) * size, b)
        out.append((cur, nxt))
        cur = nxt
    return out


# ── preconditions ─────────────────────────────────────────────────────────────

def check_layout(args, dbs: dict) -> tuple[str, int]:
    """Returns (old database, target TTL ms). Exits 2 on anything unsafe."""
    old, new, new_db = args.old, args.new, args.new_db
    if old == new or new.startswith(old + ".") or old.startswith(new + "."):
        fail(f"--old {old} and --new {new} overlap; they must be disjoint trees")
    if not (new == new_db or new.startswith(new_db + ".")):
        fail(f"--new {new} is not inside --new-db {new_db}")
    old_db = owner(old, dbs)
    if old_db is None:
        fail(f"--old {old} is in no IoTDB database (nothing to move?)")
    ttl = args.ttl_ms if args.ttl_ms is not None else dbs.get(old_db)
    if not ttl or ttl <= 0:
        fail(f"old database {old_db} has no TTL; pass --ttl-ms explicitly (never create an unbounded historian)")
    if owner(new_db, dbs) not in (None, new_db):
        fail(f"--new-db {new_db} would sit inside existing database {owner(new_db, dbs)} - databases cannot nest")
    nested = [d for d in dbs if d.startswith(new_db + ".")]
    if nested:
        fail(f"databases already exist under {new_db}: {nested}")
    if new_db in dbs and dbs[new_db] != ttl:
        fail(f"{new_db} exists with TTL {dbs[new_db]} ms, expected {ttl} ms - fix by hand, never lower it blindly")
    return old_db, ttl


def fail(msg: str, code: int = 2) -> None:
    print(f"PRECONDITION FAILED: {msg}", file=sys.stderr)
    raise SystemExit(code)


def default_from(args, dbs: dict) -> int:
    if args.from_:
        return parse_ms(args.from_)
    ttl = dbs.get(owner(args.old, dbs) or "")
    if not ttl:
        fail("old database has no TTL, so the oldest data is unbounded: pass --from")
    size = args.chunk_days * DAY_MS
    return (now_ms() - ttl - DAY_MS) // size * size   # everything still alive, snapped to the grid


def disk_ok(args) -> bool:
    if not args.disk_path:
        return True
    free_gb = shutil.disk_usage(args.disk_path).free / 1024 ** 3
    if free_gb < args.min_free_gb:
        print(f"LOW DISK: {free_gb:.1f} GB free on {args.disk_path} < {args.min_free_gb} GB. "
              "Stopped; free space and re-run the same command to resume.", file=sys.stderr)
        return False
    return True


# ── subcommands ───────────────────────────────────────────────────────────────

def cmd_plan(db: IoTDB, args) -> int:
    dbs = databases(db)
    print("databases:")
    for d, t in dbs.items():
        print(f"  {d:<24} TTL {t if t else 'NONE (unbounded)'}")
    old_db, ttl = check_layout(args, dbs)
    if args.layout != "v1":
        return v2.cmd_plan(sys.modules[__name__], db, args)
    devs = list_devices(db, args.old, args.loop)
    loops = sorted({loop_of(d, args.old) for d in devs})
    raw = [d for d in devs if d.count(".") == args.old.count(".") + 1]
    a, b = default_from(args, dbs), parse_ms(args.to)
    stmts = len(raw) * len(chunks(a, b, args.chunk_days * DAY_MS)) + (len(devs) - len(raw))
    print(f"old tree   {args.old} (database {old_db}, TTL {dbs[old_db]} ms)")
    print(f"new tree   {args.new} (database {args.new_db}: "
          f"{'exists' if args.new_db in dbs else 'to be created by prepare'}, TTL {ttl} ms)")
    print(f"devices    {len(devs)} ({len(loops)} loops, {len(raw)} raw, {len(devs) - len(raw)} kpi)")
    print(f"window     {iso(a)} .. {iso(b)}  ->  ~{stmts} SELECT INTO statements")
    print("plan OK (read-only, nothing changed)")
    return 0


def cmd_prepare(db: IoTDB, args) -> int:
    dbs = databases(db)
    _, ttl = check_layout(args, dbs)
    if args.new_db not in dbs:
        try:
            db.execute(f"CREATE DATABASE {args.new_db}")
        except IoTDBError:
            # Under load IoTDB retries DDL internally and can report the retry's status (seen in the lab:
            # a DELETE that succeeded answered 508 "does not exist"). Judge by what exists, not the answer.
            if args.new_db not in databases(db):
                raise
        print(f"created database {args.new_db}")
    db.execute(f"SET TTL TO {args.new_db} {ttl}")
    got = databases(db).get(args.new_db)
    if got != ttl:
        fail(f"{args.new_db} reports TTL {got}, expected {ttl}", 1)
    print(f"database {args.new_db} ready, TTL {ttl} ms ({ttl / DAY_MS:g} d)")
    return 0


def load_state(path: str) -> dict[tuple[str, int], int]:
    done: dict[tuple[str, int], int] = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) >= 3:
                    k = (p[0], int(p[1]))
                    done[k] = max(done.get(k, -1), int(p[2]))
    return done


def cmd_copy(db: IoTDB, args) -> int:
    dbs = databases(db)
    check_layout(args, dbs)
    if args.new_db not in dbs:
        fail(f"database {args.new_db} does not exist - run prepare first")
    a, b = default_from(args, dbs), parse_ms(args.to)
    if b <= a:
        fail(f"--to {iso(b)} is not after --from {iso(a)}")
    state = args.state or f"iotdb-move-{args.new.replace('.', '_')}.state"
    # --ignore-state re-copies everything (repair after a failed verify); still appends to the file.
    done = {} if args.ignore_state else load_state(state)
    if args.layout != "v1":
        return v2.cmd_copy(sys.modules[__name__], db, args, a, b, state, done)
    devs = list_devices(db, args.old, args.loop)
    depth = args.old.count(".") + 1
    size = args.chunk_days * DAY_MS
    print(f"copy {args.old} -> {args.new}  window {iso(a)} .. {iso(b)}  devices {len(devs)}  state {state}")
    total = skipped = 0
    t0 = time.time()
    with open(state, "a", encoding="utf-8") as st:
        for i, dev in enumerate(devs, 1):
            if not disk_ok(args):
                return 3
            target = args.new + dev[len(args.old):]
            parts = chunks(a, b, size) if dev.count(".") == depth else [(a, b)]
            written = 0
            for ca, cb in parts:
                if done.get((dev, ca), -1) >= cb:
                    skipped += 1
                    continue
                r = columns(db.query(f"select * into {target}(::) from {dev} "
                                     f"where time >= {ca} and time < {cb}"))
                n = sum(int(x) for x in r.get("Written", []) if x is not None)
                written += n
                st.write(f"{dev}\t{ca}\t{cb}\t{n}\n")
                st.flush()
                os.fsync(st.fileno())
            total += written
            if i % 25 == 0 or i == len(devs) or written:
                print(f"  [{i}/{len(devs)}] {dev} -> {written} points ({time.time() - t0:.0f} s)")
    print(f"copy done: {total} points written, {skipped} chunks already done (resume). Next: verify.")
    return 0


def series_counts(db: IoTDB, prefix: str, loop: str, a: int, b: int) -> dict[str, int]:
    # FROM X.** with count(*) means X.**.* (two or more levels): it would SKIP the raw X.pv/sp/op/vp/mode
    # series. FROM X covers the raw device, FROM X.** the kpi devices below it.
    r = columns(db.query(f"select count(*) from {prefix}.{loop}, {prefix}.{loop}.** "
                         f"where time >= {a} and time < {b}"))
    out = {}
    for expr, vals in r.items():
        path = expr[len("count("):-1] if expr.startswith("count(") else expr
        out[path[len(prefix):]] = int(vals[0]) if vals and vals[0] is not None else 0
    return out


def cmd_verify(db: IoTDB, args) -> int:
    dbs = databases(db)
    a, b = default_from(args, dbs), parse_ms(args.to)
    if args.layout != "v1":
        return v2.cmd_verify(sys.modules[__name__], db, args, a, b)
    devs = list_devices(db, args.old, args.loop)
    loops = sorted({loop_of(d, args.old) for d in devs})
    print(f"verify {args.old} vs {args.new}  window {iso(a)} .. {iso(b)}  loops {len(loops)}")
    bad, extra, n_series, old_pts, new_pts = [], 0, 0, 0, 0
    for i, loop in enumerate(loops, 1):
        old = series_counts(db, args.old, loop, a, b)
        try:
            new = series_counts(db, args.new, loop, a, b)
        except IoTDBError:
            new = {}            # whole loop absent from the new tree
        for suffix, n in old.items():
            if n == 0:
                continue
            n_series += 1
            m = new.get(suffix, 0)
            old_pts += n
            new_pts += m
            if m < n:
                bad.append(f"{args.old}{suffix}: old {n}, new {m} (missing {n - m})")
            elif m > n:
                extra += 1      # written straight to the new tree by the live writer
        if i % 25 == 0 or i == len(loops):
            print(f"  [{i}/{len(loops)}] checked")
    print(f"series {n_series}, points old {old_pts}, new {new_pts}, series with extra new points {extra}")
    if bad:
        print(f"VERIFY FAILED: {len(bad)} series short in the new tree:")
        for line in bad[:50]:
            print("  " + line)
        return 1
    print("VERIFY OK: every point of the old tree in this window exists in the new tree")
    return 0


def read_password(args) -> str:
    if os.environ.get("IOTDB_PASSWORD"):
        return os.environ["IOTDB_PASSWORD"]
    if args.env_file and os.path.exists(args.env_file):
        with open(args.env_file, encoding="utf-8") as f:
            for line in f:
                if line.startswith("IOTDB_PASSWORD="):
                    return line.split("=", 1)[1].strip().strip('"')
    fail("no IoTDB password: set IOTDB_PASSWORD or pass --env-file with IOTDB_PASSWORD=")
    return ""


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["plan", "prepare", "copy", "verify"])
    ap.add_argument("--old", default="root.site1.cpm", help="source tree (default root.site1.cpm)")
    ap.add_argument("--new", required=True, help="target tree, e.g. root.hdpe.cpm")
    ap.add_argument("--new-db", help="target database (default: --new)")
    ap.add_argument("--layout", choices=["v1", "v2", "v2-back"], default="v1",
                    help="v1 = same shape; v2 = into the CHG-102 layout; v2-back = rollback from it")
    ap.add_argument("--kpi-db", default="root.hdpe.kpi", help="v2 KPI database (gate_*, long_*)")
    ap.add_argument("--kpis-db", default="root.hdpe.kpis", help="v2 short-KPI database (short_*)")
    ap.add_argument("--ttl-ms", type=int, help="TTL of the new database (default: the old database's)")
    ap.add_argument("--from", dest="from_", help="window start: epoch ms, ISO-8601 with zone, or now "
                                                 "(default: oldest live data = now - old TTL - 1 d)")
    ap.add_argument("--to", default="now", help="window end (exclusive), same forms (default now)")
    ap.add_argument("--loop", action="append", default=[], help="limit to this loop node (repeatable)")
    ap.add_argument("--chunk-days", type=int, default=7, help="raw-device copy chunk (default 7 d)")
    ap.add_argument("--state", help="resume file for copy (default iotdb-move-<new>.state)")
    ap.add_argument("--ignore-state", action="store_true",
                    help="copy every chunk again (repair after a failed verify; idempotent)")
    ap.add_argument("--disk-path", help="filesystem holding the IoTDB volume; copy stops below --min-free-gb")
    ap.add_argument("--min-free-gb", type=float, default=5.0)
    ap.add_argument("--retries", type=int, default=4, help="retries for timeouts/transport errors (default 4)")
    ap.add_argument("--pause-ms", type=int, default=0, help="sleep after each statement (pacing on a live plant)")
    ap.add_argument("--container", default="ams-iotdb")
    ap.add_argument("--rest-url", help="use a published REST port instead of docker exec; give "
                                       "127.0.0.1, not localhost (Windows tries IPv6 first: ~20 s per call)")
    ap.add_argument("--user", default="root")
    ap.add_argument("--env-file", default="migration/.env")
    args = ap.parse_args(argv)
    args.new_db = args.new_db or args.new
    db = IoTDB(args.user, read_password(args), args.rest_url, args.container, args.retries, args.pause_ms)
    try:
        return {"plan": cmd_plan, "prepare": cmd_prepare,
                "copy": cmd_copy, "verify": cmd_verify}[args.command](db, args)
    except IoTDBError as e:
        print(f"IOTDB ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
