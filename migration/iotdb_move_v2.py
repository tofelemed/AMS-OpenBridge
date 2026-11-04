"""CHG-101 x CHG-102 - layout v2 support for iotdb-move-loop-tree.py (imported by it; not run directly).

Layout v2 (infra/docker/iotdb-layout-v2.sh, the single source of truth for templates and mounts):
  raw   <new>.<loop>                    ALIGNED, template cpm_raw set on the raw database
  KPI   <kpi-db>.<family>.<loop>        gate_12h/24h, long_4h/12h/24h (template per family subtree)
  short <kpis-db>.<family>.<loop>       short_1m .. short_60m
The legacy tree keeps KPIs under the loop: <old>.<loop>.kpi.<family>.

  --layout v2       legacy tree (--old)  -> v2   (the forward move)
  --layout v2-back  v2 (--old = raw db)  -> legacy tree (--new); the rollback copy-back

Target field types are read from IoTDB, never from a list kept here:
  v2       the template mounted on the target device's parent path; a device whose parent has no
           template, or a field the template lacks, is REFUSED (writing it would auto-extend the
           template for every device, or auto-create an unaligned series).
  v2-back  the existing legacy series; a field with no legacy series keeps its source type.
A numeric field whose source type differs is cast (DOUBLE -> FLOAT forward, FLOAT -> DOUBLE back).
"""
from __future__ import annotations

import os
import re
import time

NUMERIC = {"FLOAT", "DOUBLE", "INT32", "INT64", "BOOLEAN"}
FAMILY = re.compile(r"^(gate|long|short)_\d+[mh]$")
ROLLUP_FAMILIES = {"m1"}          # filled by the 1-minute continuous query, never copied


class Refused(Exception):
    """A device or field the target layout has no place for."""


IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def q(name: str) -> str:
    """A measurement name for SQL - bare, never back-quoted. IoTDB 1.3.2 keeps back-quotes LITERALLY in
    a SELECT ... INTO target list next to a cast: the lab copy created series named `pv` (with the quotes)
    and auto-extended the template with them. So only plain identifiers are accepted, and used bare."""
    if not IDENT.match(name):
        raise Refused(f"measurement name {name!r} is not a plain identifier")
    return name


class Layout:
    def __init__(self, h, args):
        self.h, self.mode = h, args.layout
        self.old, self.new = args.old, args.new
        self.kpi_db, self.kpis_db = args.kpi_db, args.kpis_db

    # ── where a device lives and goes ──
    def source_patterns(self, loop: str) -> list[str]:
        if self.mode == "v2":
            return [f"{self.old}.{loop}.**"]
        return [f"{self.old}.{loop}.*", f"{self.kpi_db}.*.{loop}.*", f"{self.kpis_db}.*.{loop}.*"]

    def loops(self, db) -> list[str]:
        """Every loop with any device - also a loop that has KPI devices but no raw one."""
        def devices(pattern: str) -> list[str]:
            try:
                return self.h.columns(db.query(f"show devices {pattern}")).get("Device", [])
            except self.h.IoTDBError:
                return []          # a KPI database that does not exist (yet) holds no loops
        out = {d[len(self.old) + 1:].split(".")[0] for d in devices(f"{self.old}.**")}
        if self.mode == "v2-back":
            for base in (self.kpi_db, self.kpis_db):
                out |= {d.rsplit(".", 1)[1] for d in devices(f"{base}.*.*")
                        if d[len(base) + 1:].split(".")[0] not in ROLLUP_FAMILIES}
        return sorted(out)

    def is_raw(self, dev: str) -> bool:
        return dev.count(".") == self.old.count(".") + 1 and dev.startswith(self.old + ".")

    def target(self, dev: str) -> str:
        if self.is_raw(dev):
            return self.new + dev[len(self.old):]
        if self.mode == "v2":
            parts = dev[len(self.old) + 1:].split(".")
            if len(parts) != 3 or parts[1] != "kpi" or not FAMILY.match(parts[2]):
                raise Refused(f"{dev}: not <loop>.kpi.<family> - no place in layout v2")
            loop, fam = parts[0], parts[2]
            return f"{self.kpis_db if fam.startswith('short_') else self.kpi_db}.{fam}.{loop}"
        for base in (self.kpi_db, self.kpis_db):
            if dev.startswith(base + "."):
                fam, loop = dev[len(base) + 1:].split(".")
                if not FAMILY.match(fam):
                    raise Refused(f"{dev}: family {fam} has no legacy place")
                return f"{self.new}.{loop}.kpi.{fam}"
        raise Refused(f"{dev}: outside {self.old}, {self.kpi_db}, {self.kpis_db}")

    def skip(self, dev: str) -> bool:
        return self.mode == "v2-back" and dev.startswith(self.kpi_db + ".") and \
            dev[len(self.kpi_db) + 1:].split(".")[0] in ROLLUP_FAMILIES


def schema(h, db, patterns: list[str]) -> dict[str, dict[str, str]]:
    """{device: {field: data type}} for every series under the patterns."""
    out: dict[str, dict[str, str]] = {}
    for p in patterns:
        try:
            c = h.columns(db.query(f"show timeseries {p}"))
        except h.IoTDBError:   # a pattern under a missing database matches nothing
            continue
        for ts, dt in zip(c.get("Timeseries", []), c.get("DataType", [])):
            dev, field = ts.rsplit(".", 1)
            out.setdefault(dev, {})[field] = dt
    return out


def template_mounts(h, db) -> dict[str, dict[str, str]]:
    """{mount path: {field: data type}} for every device template set in IoTDB."""
    mounts: dict[str, dict[str, str]] = {}
    for name in h.columns(db.query("show device templates")).get("TemplateName", []):
        nodes = h.columns(db.query(f"show nodes in device template {name}"))
        fields = dict(zip(nodes.get("ChildNodes", []), nodes.get("DataType", [])))
        for path in h.columns(db.query(f"show paths set device template {name}")).get("Paths", []):
            mounts[path] = fields
    return mounts


class Planner:
    """Builds one typed SELECT ... INTO per (device, chunk); refuses what the target cannot hold."""

    def __init__(self, h, db, args):
        self.h, self.db, self.lay = h, db, Layout(h, args)
        self.mounts = template_mounts(h, db) if args.layout == "v2" else {}

    def check_targets_exist(self) -> None:
        if self.lay.mode != "v2":
            return
        polluted = sorted({f"{path}: {f}" for path, fields in self.mounts.items()
                           for f in fields if not IDENT.match(f)})
        if polluted:
            self.h.fail("a device template holds a non-identifier node (an earlier quoted write extended "
                        f"it) - fix the template by hand first: {polluted[:5]}")
        dbs = self.h.databases(self.db)
        for d in (self.lay.kpi_db, self.lay.kpis_db):
            if d not in dbs:
                self.h.fail(f"database {d} missing - run iotdb-init with IOTDB_LAYOUT=v2 first")
        if self.lay.new not in self.mounts:
            self.h.fail(f"no device template set on {self.lay.new} - run iotdb-init with IOTDB_LAYOUT=v2 "
                        "(after prepare, on an EMPTY raw database)")

    def target_types(self, target: str, src: dict[str, str]) -> dict[str, str]:
        if self.lay.mode == "v2":
            parent = target.rsplit(".", 1)[0]
            if parent not in self.mounts:
                raise Refused(f"{target}: no device template set on {parent}")
            return self.mounts[parent]
        existing = schema(self.h, self.db, [f"{target}.*"]).get(target, {})
        return {f: existing.get(f, t) for f, t in src.items()}

    def statement(self, dev: str, src: dict[str, str], a: int, b: int) -> tuple[str, str]:
        target = self.lay.target(dev)
        tgt = self.target_types(target, src)
        sel, into = [], []
        for f in sorted(src):
            if f not in tgt:
                raise Refused(f"{dev}.{f}: not in the target template - refusing (would auto-extend it)")
            s, t = src[f], tgt[f]
            if s == t:
                sel.append(q(f))
            elif s in NUMERIC and t in NUMERIC - {"BOOLEAN"}:
                sel.append(f"cast({q(f)} AS {t})")
            else:
                raise Refused(f"{dev}.{f}: {s} -> {t} is not a lossless-enough cast")
            into.append(q(f))
        aligned = "aligned " if self.lay.mode == "v2" else ""
        return target, (f"select {', '.join(sel)} into {aligned}{target}({', '.join(into)}) from {dev} "
                        f"where time >= {a} and time < {b}")


def selected_loops(lay: Layout, db, args) -> list[str]:
    loops = lay.loops(db)
    return [lp for lp in loops if lp in set(args.loop)] if args.loop else loops


def cmd_plan(h, db, args) -> int:
    p = Planner(h, db, args)
    p.check_targets_exist()
    n_dev = n_raw = 0
    refused: list[str] = []
    loops = selected_loops(p.lay, db, args)
    for loop in loops:
        for dev, src in schema(h, db, p.lay.source_patterns(loop)).items():
            if p.lay.skip(dev):
                continue
            try:
                p.statement(dev, src, 0, 1)
                n_dev += 1
                n_raw += p.lay.is_raw(dev)
            except Refused as e:
                refused.append(str(e))
    print(f"layout {args.layout}: {len(loops)} loops, {n_dev} devices ({n_raw} raw, {n_dev - n_raw} kpi)")
    if refused:
        print(f"PLAN REFUSED: {len(refused)} device(s)/field(s) have no place in the target layout:")
        for r in refused[:50]:
            print("  " + r)
        return 2
    print("plan OK (read-only, nothing changed)")
    return 0


def cmd_copy(h, db, args, a: int, b: int, state: str, done: dict) -> int:
    p = Planner(h, db, args)
    p.check_targets_exist()
    size = args.chunk_days * h.DAY_MS
    loops = selected_loops(p.lay, db, args)
    print(f"copy ({args.layout}) {args.old} -> {args.new}  window {h.iso(a)} .. {h.iso(b)}  "
          f"loops {len(loops)}  state {state}")
    total = skipped = 0
    t0 = time.time()
    with open(state, "a", encoding="utf-8") as st:
        for i, loop in enumerate(loops, 1):
            if not h.disk_ok(args):
                return 3
            written = 0
            for dev, src in sorted(schema(h, db, p.lay.source_patterns(loop)).items()):
                if p.lay.skip(dev):
                    continue
                for ca, cb in (h.chunks(a, b, size) if p.lay.is_raw(dev) else [(a, b)]):
                    if done.get((dev, ca), -1) >= cb:
                        skipped += 1
                        continue
                    try:
                        _, sql = p.statement(dev, src, ca, cb)
                    except Refused as e:
                        print(f"REFUSED: {e}. Nothing written for it; fix the layout, then re-run.")
                        return 2
                    r = h.columns(db.query(sql))
                    n = sum(int(x) for x in r.get("Written", []) if x is not None)
                    written += n
                    st.write(f"{dev}\t{ca}\t{cb}\t{n}\n")
                    st.flush()
                    os.fsync(st.fileno())
            total += written
            print(f"  [{i}/{len(loops)}] {loop} -> {written} points ({time.time() - t0:.0f} s)")
    print(f"copy done: {total} points written, {skipped} chunks already done (resume). Next: verify.")
    return 0


def _stats(h, db, dev: str, fields: dict[str, str], a: int, b: int) -> dict[str, tuple]:
    """{field: (count, min, max)} - min/max only for numeric fields."""
    num = [f for f, t in fields.items() if t in NUMERIC - {"BOOLEAN"}]
    exprs = [f"count({q(f)})" for f in fields] + [f"min_value({q(f)})" for f in num] + \
            [f"max_value({q(f)})" for f in num]
    r = h.columns(db.query(f"select {', '.join(exprs)} from {dev} where time >= {a} and time < {b}"))
    # Keyed by name: IoTDB leaves out the columns of series that do not exist (yet) on the device.
    got: dict[tuple[str, str], object] = {}
    for expr, v in r.items():
        fn, path = expr.split("(", 1)
        got[(fn, path[:-1].rsplit(".", 1)[1].strip("`"))] = v[0] if v else None
    return {f: (int(got.get(("count", f)) or 0), got.get(("min_value", f)), got.get(("max_value", f)))
            for f in fields}


def _close(x, y) -> bool:
    if x is None or y is None:
        return x is None and y is None
    x, y = float(x), float(y)
    return abs(x - y) <= max(1e-6 * abs(x), 1e-30)    # FLOAT keeps ~7 digits (lab rel. error 6e-8)


def cmd_verify(h, db, args, a: int, b: int) -> int:
    p = Planner(h, db, args)
    loops = selected_loops(p.lay, db, args)
    print(f"verify ({args.layout}) {args.old} vs {args.new}  window {h.iso(a)} .. {h.iso(b)}  loops {len(loops)}")
    bad: list[str] = []
    n_series = old_pts = new_pts = extra = 0
    for i, loop in enumerate(loops, 1):
        for dev, src in sorted(schema(h, db, p.lay.source_patterns(loop)).items()):
            if p.lay.skip(dev):
                continue
            try:
                target = p.lay.target(dev)
            except Refused as e:
                bad.append(str(e))
                continue
            old = _stats(h, db, dev, src, a, b)
            try:
                new = _stats(h, db, target, src, a, b)
            except h.IoTDBError:
                new = {}
            for f, (n, lo, hi) in old.items():
                if n == 0:
                    continue
                n_series += 1
                m, lo2, hi2 = new.get(f, (0, None, None))
                old_pts, new_pts = old_pts + n, new_pts + m
                if m < n:
                    bad.append(f"{dev}.{f}: old {n}, new {m} (missing {n - m})")
                elif m > n:
                    extra += 1     # the live writer added points: min/max no longer comparable
                elif not (_close(lo, lo2) and _close(hi, hi2)):
                    bad.append(f"{dev}.{f}: min/max old {lo}/{hi}, new {lo2}/{hi2}")
        if i % 25 == 0 or i == len(loops):
            print(f"  [{i}/{len(loops)}] checked")
    print(f"series {n_series}, points old {old_pts}, new {new_pts}, series with extra new points {extra}")
    if bad:
        print(f"VERIFY FAILED: {len(bad)} problem(s):")
        for line in bad[:50]:
            print("  " + line)
        return 1
    print("VERIFY OK: every point of the old tree in this window exists in the new layout, min/max equal")
    return 0
