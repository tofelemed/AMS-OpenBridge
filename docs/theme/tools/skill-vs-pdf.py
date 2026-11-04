"""PRM-004 Phase 0: compare every hex value in skill tokens.json with guide R01 pages 3-5.
Reads the PDF text with pdftotext. Prints per-token results and a total; exit 1 on any mismatch.
Usage: python docs/theme/tools/skill-vs-pdf.py <pdf> <tokens.json> [output.md]"""
import json
import re
import subprocess
import sys

pdf, tokens = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
HEX = re.compile(r"#[0-9A-Fa-f]{6}\b")

text = {}
for page in (3, 4, 5):
    text[page] = subprocess.run(["pdftotext", "-f", str(page), "-l", str(page), "-layout", pdf, "-"], capture_output=True, text=True, encoding="utf-8").stdout


def rows(page):
    """Each table row as (label, [hex values in reading order])."""
    found = []
    for line in text[page].splitlines():
        values = [v.upper() for v in HEX.findall(line)]
        if values:
            found.append((line.split("#")[0].strip(), values))
    return found


data = json.load(open(tokens, encoding="utf-8"))
day, night, fixed = data["day"], data["night"], data["fixed"]
lookup = lambda sec, key: sec[key]["value"].upper() if key in sec else None
checks = []


def compare(token, where, skill, pdf_value):
    checks.append((token, where, skill, pdf_value, skill == pdf_value))


core = {r[0]: r[1] for r in rows(3)}
for name in ["surface.page", "surface.panel", "surface.raised", "surface.hover", "surface.selected", "border.subtle", "border.strong", "text.primary", "text.secondary", "text.muted", "action.primary", "action.hover", "action.active", "action.on", "focus", "ai.fg", "ai.bg"]:
    pair = core.get(name)
    compare(name, "p.3 day", lookup(day, name), pair[0] if pair else None)
    compare(name, "p.3 night", lookup(night, name), pair[1] if pair and len(pair) > 1 else None)

status = {r[0].lower(): r[1] for r in rows(4) if r[0] in ("Danger", "Warning", "Success", "Info", "Unknown")}
for name in ["danger", "warning", "success", "info", "unknown"]:
    v = status.get(name)
    compare(f"status.{name}.fg", "p.4 day", lookup(day, f"status.{name}.fg"), v[0] if v else None)
    compare(f"status.{name}.bg", "p.4 day", lookup(day, f"status.{name}.bg"), v[1] if v else None)
    compare(f"status.{name}.fg", "p.4 night", lookup(night, f"status.{name}.fg"), v[2] if v else None)
    compare(f"status.{name}.bg", "p.4 night", lookup(night, f"status.{name}.bg"), v[3] if v else None)

diag_rows = [r for r in rows(4) if len(r[1]) == 2 and r[0][:1] in ("F", "C", "S", "M")]
for code, row in zip("fcsm", diag_rows):
    compare(f"diag.{code}.fill", "p.4", lookup(fixed, f"diag.{code}.fill"), row[1][0])
    compare(f"diag.{code}.text", "p.4", lookup(fixed, f"diag.{code}.text"), row[1][1])

series = [r for r in rows(5) if len(r[1]) == 2][:6]
for i, row in enumerate(series, 1):
    compare(f"chart.series.{i}", "p.5 day", lookup(day, f"chart.series.{i}"), row[1][0])
    compare(f"chart.series.{i}", "p.5 night", lookup(night, f"chart.series.{i}"), row[1][1])

bad = [c for c in checks if not c[4]]
lines = ["| Token | Where | Skill | Guide | Match |", "|---|---|---|---|---|"] + [f"| `{c[0]}` | {c[1]} | `{c[2]}` | `{c[3]}` | {'yes' if c[4] else '**NO**'} |" for c in checks]
if out:
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(f"compared {len(checks)} values, mismatches {len(bad)}")
for c in bad[:20]:
    print("MISMATCH", c)
sys.exit(1 if bad else 0)
