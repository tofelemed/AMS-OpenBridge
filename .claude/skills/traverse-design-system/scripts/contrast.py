#!/usr/bin/env python3
"""Verify WCAG 2.1 contrast of the Traverse token set. Reads references/tokens.css.
Exit 1 if any pairing listed in PAIRS falls below its threshold except the documented exceptions.
Run after every token change; paste the output into the change record."""
import re, sys, pathlib
css = pathlib.Path(__file__).resolve().parent.parent.joinpath("references/tokens.css").read_text()
def block(sel):
    m = re.search(re.escape(sel) + r"\s*\{(.*?)\n\}", css, re.S)
    if not m: sys.exit(f"selector block not found: {sel}")
    return dict(re.findall(r"--traverse-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})", m.group(1)))
fixed = block(":root"); day = block('[data-theme="day"]'); night = block('[data-theme="night"]')
def lin(c): c/=255; return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def L(h): h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4)); return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def cr(a,b): x,y=sorted((L(a),L(b)),reverse=True); return (x+0.05)/(y+0.05)
S=["surface-page","surface-panel","surface-raised","surface-hover","surface-selected"]
PAIRS=[]  # (fg, bg, threshold)
for t in ["text-primary","text-secondary","text-muted","action-primary"]: PAIRS += [(t,s,4.5) for s in S]
PAIRS += [("action-on",a,4.5) for a in ["action-primary","action-hover","action-active"]]
for st in ["danger","warning","success","info","unknown"]:
    PAIRS += [(f"status-{st}-fg",f"status-{st}-bg",4.5),(f"status-{st}-fg","surface-panel",4.5),(f"status-{st}-fg","surface-page",4.5)]
PAIRS += [("ai-fg","ai-bg",4.5),("ai-fg","surface-panel",4.5),("action-on","status-danger-fg",4.5)]
for s in ["surface-page","surface-panel","surface-raised"]: PAIRS += [("border-strong",s,3.0),("focus",s,3.0),("action-primary",s,3.0)]
PAIRS += [(f"chart-series-{i}","surface-panel",3.0) for i in range(1,7)]
EXCEPT={("border-subtle","surface-panel"):"decorative divider by definition (guide p.3)",
        ("diag-c-fill","surface-panel"):"Day chip: code letter carries meaning (SKILL §5)",
        ("diag-s-fill","surface-panel"):"Day chip: code letter carries meaning (SKILL §5)",
        ("diag-m-fill","surface-panel"):"Day chip: code letter carries meaning (SKILL §5)"}
rows=[]; fails=[]
for th,t in (("day",day),("night",night)):
    tt={**t, **fixed}
    for fg,bg,thr in PAIRS + [("border-subtle","surface-panel",3.0)] + [(f"diag-{c}-fill","surface-panel",3.0) for c in "fcsm"]:
        r=cr(tt[fg],tt[bg]); ok=r>=thr; rows.append((th,fg,bg,thr,r,ok))
        if not ok and (fg,bg) not in EXCEPT: fails.append((th,fg,bg,r))
for c in "fcsm":
    r=cr(fixed[f"diag-{c}-text"],fixed[f"diag-{c}-fill"]); rows.append(("both",f"diag-{c}-text",f"diag-{c}-fill",4.5,r,r>=4.5))
    if r<4.5: fails.append(("both",f"diag-{c}-text",f"diag-{c}-fill",r))
print(f"{'theme':6} {'fg':22} {'bg':20} {'min':4} {'ratio':6} result")
for th,fg,bg,thr,r,ok in rows:
    note="" if ok else ("  exception: "+EXCEPT.get((fg,bg),"NEW FAILURE"))
    print(f"{th:6} {fg:22} {bg:20} {thr:<4} {r:6.2f} {'PASS' if ok else 'FAIL'}{note}")
passing=[x for x in rows if x[5]]
print(f"\n{len(rows)} pairings, {len(passing)} pass, {len(rows)-len(passing)} documented exceptions/failures")
print("min passing text:", round(min(r for _,_,_,thr,r,ok in rows if ok and thr==4.5),3), " min passing non-text:", round(min(r for _,_,_,thr,r,ok in rows if ok and thr==3.0),3))
if fails: print("\nNEW FAILURES:", fails); sys.exit(1)
