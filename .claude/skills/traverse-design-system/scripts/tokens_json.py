import re, json, sys, pathlib
root = pathlib.Path(sys.argv[1])
css = (root/'references/tokens.css').read_text(encoding='utf-8')
def block(sel):
    m = re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", css, re.S)
    body = re.sub(r'/\*.*?\*/', '', m.group(1), flags=re.S)
    return dict(re.findall(r"--traverse-([a-z0-9-]+):\s*([^;]+);", body))
def dotted(n):
    p = n.split('-')
    if p[0] in ('status','diag') and len(p) >= 3: return '.'.join(p[:3])
    if p[0] == 'chart' and p[1] in ('series','tooltip'): return '.'.join(p[:3])
    if p[0] in ('surface','border','text','action','ai','chart','space','radius','size','type','font','bp','focus') and len(p) > 1:
        return p[0] + '.' + '-'.join(p[1:])
    return n
def conv(d):
    out = {}
    for k, v in d.items():
        v = v.strip()
        ref = re.fullmatch(r"var\(--traverse-([a-z0-9-]+)\)", v)
        out[dotted(k)] = {"value": ("{" + dotted(ref.group(1)) + "}") if ref else v, "css": f"--traverse-{k}"}
    return out
data = {
  "$meta": {
    "skill": "traverse-design-system", "revision": "R1.2", "date": "2026-11-04",
    "source": "Traverse UI Design and Development Guide R01, pages 3-7",
    "authority": "references/tokens.css is authoritative; this file is a reference copy of the same values.",
    "provenance": "Regenerated from references/tokens.css on 2026-11-04 because the original tokens.json was not available. Schema: custom dotted path (not DTCG); 'value' holds the literal or a {dotted.reference}; 'css' holds the custom property name. Not consumed by any build step or gate.",
    "verification": "Run `python scripts/tokens_json.py . --check` from the skill folder; it compares every value with references/tokens.css"
  },
  "fixed": conv(block(":root {")) if False else conv(block(":root")),
  "day": conv(block('[data-theme="day"]')),
  "night": conv(block('[data-theme="night"]')),
}
if '--check' in sys.argv:
    j = json.loads((root/'references/tokens.json').read_text(encoding='utf-8'))
    n = 0; bad = []
    for sec, sel in (("fixed", ":root"), ("day", '[data-theme="day"]'), ("night", '[data-theme="night"]')):
        src = block(sel)
        got = {v["css"][len("--traverse-"):]: v["value"] for v in j[sec].values()}
        if set(got) != set(src): bad.append((sec, "key set differs", set(got) ^ set(src)))
        for k, v in src.items():
            v = v.strip(); ref = re.fullmatch(r"var\(--traverse-([a-z0-9-]+)\)", v)
            exp = ("{" + dotted(ref.group(1)) + "}") if ref else v
            n += 1
            if got.get(k) != exp: bad.append((sec, k, got.get(k), exp))
    hexes = sum(1 for sec in ("fixed","day","night") for v in j[sec].values() if re.fullmatch(r"#[0-9A-Fa-f]{6}", v["value"]))
    print(f"compared {n} values, {hexes} hex, mismatches {len(bad)}"); print(bad[:5])
    sys.exit(1 if bad else 0)
(root/'references/tokens.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding='utf-8')
print("written")
