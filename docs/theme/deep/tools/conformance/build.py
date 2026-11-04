"""Part H: renders docs/theme/deep/conformance-matrix.md from the cell data and template.

Run from the repository root, without writing bytecode:
    python -B docs/theme/deep/tools/conformance/build.py
Totals are computed here, so edit cells_g.py / cells_cpa.py and rebuild; never edit totals by hand.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from cells_cpa import CPA_CELLS, CPA_COLUMNS, CPA_REQS  # noqa: E402
from cells_g import G_CELLS, G_REQS, ROUTES  # noqa: E402

DEEP = HERE.parents[1]
THEME = DEEP.parent
WORD = {"P": "pass", "F": "fail", "N": "not assessable", "-": "does not apply"}
CODES = [r[0] for r in ROUTES]


def cell_map(groups, req, allowed):
    """route -> group; each route may appear once."""
    out = {}
    for group in groups:
        for code in group["routes"]:
            if code not in allowed:
                raise SystemExit(f"{req}: route {code} is outside the allowed set")
            if code in out:
                raise SystemExit(f"{req}: route {code} appears twice")
            out[code] = group
    return out


def token(group):
    if group is None or group["v"] == "-":
        return "·"
    return group["v"] + ("*" if group["rm"] else "")


def table(header, rows):
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def evidence_rows(reqs, cells):
    rows = []
    for req, *_ in reqs:
        for group in cells[req]:
            verdict = WORD[group["v"]] + (", re-measure" if group["rm"] else "")
            routes = ", ".join(group["routes"])
            if len(group["routes"]) == len(CODES):
                routes = "All 32"
            elif len(group["routes"]) == 31 and "LOG" not in group["routes"]:
                routes = "All except LOG"
            rows.append([req, routes, verdict, group["why"], group["cite"] or "n/a"])
    return rows


def main():
    gmaps = {req: cell_map(G_CELLS[req], req, CODES) for req, _ in G_REQS}
    for req, cells in gmaps.items():
        missing = [c for c in CODES if c not in cells]
        if missing:
            raise SystemExit(f"{req}: no cell for {missing}")
    cmaps = {req: cell_map(CPA_CELLS[req], req, CPA_COLUMNS) for req, *_ in CPA_REQS}

    counts = {"G": Counter(), "C": Counter()}
    per_req = {}
    for key, maps in (("G", gmaps), ("C", cmaps)):
        for req, cells in maps.items():
            tally = Counter(g["v"] for g in cells.values())
            rm = sum(1 for g in cells.values() if g["rm"])
            per_req[req] = tally
            counts[key].update(tally)
            counts[key]["rm"] += rm

    totals = {k: counts["G"][k] + counts["C"][k] for k in ("P", "F", "N", "-", "rm")}
    scored = totals["P"] + totals["F"] + totals["N"]
    cpa_cells_possible = len(CPA_REQS) * len(CODES)
    cpa_scored = counts["C"]["P"] + counts["C"]["F"] + counts["C"]["N"]
    cpa_outside = cpa_cells_possible - cpa_scored

    totals_table = table(
        ["Set", "Pass", "Fail", "Not assessable", "Scored", "Of which re-measure", "Not addressed (not counted)"],
        [["G01-G12, 32 routes", counts["G"]["P"], counts["G"]["F"], counts["G"]["N"],
          counts["G"]["P"] + counts["G"]["F"] + counts["G"]["N"], counts["G"]["rm"], counts["G"]["-"]],
         [f"CPA requirements, {len(CPA_REQS)} rows", counts["C"]["P"], counts["C"]["F"], counts["C"]["N"],
          cpa_scored, counts["C"]["rm"], cpa_outside],
         ["**All**", f"**{totals['P']}**", f"**{totals['F']}**", f"**{totals['N']}**", f"**{scored}**",
          f"**{totals['rm']}**", f"**{counts['G']['-'] + cpa_outside}**"]])

    manifest = json.loads((THEME / "screenshots/current/manifest.json").read_text(encoding="utf8"))["routes"]
    key_rows = []
    for code, path, slug in ROUTES:
        shots = "1440, 1366, 1920" if slug and len(manifest[slug]["themes"]["day"].get("shots", {})) >= 3 else ("1440" if slug else "none")
        key_rows.append([code, f"`{path}`", slug or "not captured", shots])

    g_rows = []
    for code, path, _ in ROUTES:
        cells = [token(gmaps[req].get(code)) for req, _t in G_REQS]
        tally = Counter(c[0] for c in cells if c != "·")
        g_rows.append([code] + cells + [tally["P"], tally["F"], tally["N"]])
    foot = ["**Pass**"] + [per_req[r]["P"] for r, _ in G_REQS] + [counts["G"]["P"], "", ""]
    foot2 = ["**Fail**"] + [per_req[r]["F"] for r, _ in G_REQS] + ["", counts["G"]["F"], ""]
    foot3 = ["**Not assessable**"] + [per_req[r]["N"] for r, _ in G_REQS] + ["", "", counts["G"]["N"]]
    g_grid = table(["Route"] + [r for r, _ in G_REQS] + ["P", "F", "N"], g_rows + [foot, foot2, foot3])

    c_rows = []
    for req, page, text in CPA_REQS:
        c_rows.append([req, page, text] + [token(cmaps[req].get(c)) for c in CPA_COLUMNS])
    c_grid = table(["ID", "Page", "Requirement"] + CPA_COLUMNS, c_rows)

    kb_rows = []
    for code, _p, slug in ROUTES:
        if not slug or "keyboard" not in manifest[slug] or not manifest[slug].get("keyboard"):
            continue
        m = manifest[slug]
        kb, walk = m["keyboard"], m["tabWalk"]
        critical = m["themes"]["day"]["axe"]["nodesByImpact"].get("critical", 0)
        kb_rows.append([code, f"{kb['pointerWithoutKeyboard']} / {kb['clickTargets']}", kb["tableRows"],
                        kb["charts"]["canvases"], f"{walk['ringVisible']} / {walk['stops']}", critical])
    kb_table = table(["Route", "Pointer-only / click targets", "Table rows (0 focusable)", "Canvases in capture (0 focusable)",
                      "Tab stops with a detected ring", "axe critical nodes, Day"], kb_rows)

    rem_rows = []
    for req, *_ in [*G_REQS, *CPA_REQS]:
        cells = gmaps.get(req) or cmaps[req]
        marked = [c for c, g in cells.items() if g["rm"]]
        if marked:
            rem_rows.append([req, ", ".join(c for c in CODES if c in marked)])

    subs = {
        "TOTALS": totals_table,
        "ROUTE_KEY": table(["Code", "Route", "Capture slug", "Widths captured"], key_rows),
        "G_GRID": g_grid,
        "G_EVIDENCE": table(["Check", "Routes", "Verdict", "Evidence", "Cite"], evidence_rows(G_REQS, G_CELLS)),
        "KEYBOARD": kb_table,
        "CPA_GRID": c_grid,
        "CPA_EVIDENCE": table(["ID", "Routes", "Verdict", "Evidence", "Cite"], evidence_rows(CPA_REQS, CPA_CELLS)),
        "REMEASURE": table(["Check", "Cells"], rem_rows),
        "N_CPA_REQS": len(CPA_REQS),
        "N_DOTS": counts["G"]["-"] + cpa_outside,
    }
    text = (HERE / "template.md").read_text(encoding="utf8")
    for key, value in subs.items():
        text = text.replace("{{" + key + "}}", str(value))

    def count_token(match):
        verdict, req = match.group(1), match.group(2)
        return str(per_req[req][verdict])

    text = re.sub(r"\{\{([PFN]):([A-Z]+\d+)\}\}", count_token, text)
    left = re.findall(r"\{\{[^}]+\}\}", text)
    if left:
        raise SystemExit(f"unreplaced tokens: {left}")
    (DEEP / "conformance-matrix.md").write_text(text, encoding="utf8", newline="\n")
    print({k: totals[k] for k in ("P", "F", "N", "rm")}, "dots", subs["N_DOTS"], "scored", scored,
          "lines", text.count("\n") + 1)


if __name__ == "__main__":
    main()
