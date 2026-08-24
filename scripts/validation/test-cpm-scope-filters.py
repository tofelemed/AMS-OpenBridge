"""
V2/V3 — plant scope + search filter verification against the live stack.

Every assertion compares an API answer to ground truth taken straight from
Postgres, so a filter that silently ignores a parameter fails here rather than
looking plausible.
"""
import json, subprocess, urllib.request, urllib.error, sys

GW = 'http://localhost:8081'
results = []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}{f' — {detail}' if detail else ''}")

def api(path, token=None, method='GET', body=None):
    req = urllib.request.Request(GW + path, method=method)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]

def sql(db, q):
    out = subprocess.run(
        ['docker', 'exec', 'ams-postgres', 'psql', '-U', 'ams_user', '-d', db, '-tA', '-c', q],
        capture_output=True, text=True, timeout=60)
    return out.stdout.strip()

_, login = api('/api/auth/login', method='POST',
               body={'username': 'admin', 'password': 'ChangeMe123!'})
TOKEN = login['token']

# ── pick a real scope from the data ──────────────────────────────────────────
row = sql('traverse_cplm', """
  SELECT site||'|'||COALESCE(area,'')||'|'||COALESCE(unit,'')||'|'||COUNT(*)
  FROM cpm.loop_registry GROUP BY site, area, unit ORDER BY COUNT(*) DESC LIMIT 1;""")
SITE, AREA, UNIT, N = row.split('|')
print(f"\nground truth: site={SITE!r} area={AREA!r} unit={UNIT!r} loops={N}\n")

TOTAL = int(sql('traverse_cplm', 'SELECT COUNT(*) FROM cpm.loop_registry;'))
SITE_N = int(sql('traverse_cplm', f"SELECT COUNT(*) FROM cpm.loop_registry WHERE site='{SITE}';"))
UNIT_N = int(N)

# ── V2.1 summary ladder ──────────────────────────────────────────────────────
print("── V2.1  /fleet/summary scope ladder ──")
_, unscoped = api('/api/v1/cpm/fleet/summary', TOKEN)
check('summary unscoped == registry total',
      unscoped['loops']['total'] == TOTAL, f"{unscoped['loops']['total']} vs {TOTAL}")

_, by_site = api(f'/api/v1/cpm/fleet/summary?site={SITE}', TOKEN)
check('summary ?site= matches SQL count',
      by_site['loops']['total'] == SITE_N, f"{by_site['loops']['total']} vs {SITE_N}")

unit_q = f'/api/v1/cpm/fleet/summary?site={SITE}'
if UNIT: unit_q += f'&unit={UNIT}'
_, by_unit = api(unit_q, TOKEN)
check('summary ?site&unit= matches SQL count',
      by_unit['loops']['total'] == UNIT_N, f"{by_unit['loops']['total']} vs {UNIT_N}")

check('summary counts narrow monotonically',
      unscoped['loops']['total'] >= by_site['loops']['total'] >= by_unit['loops']['total'],
      f"{unscoped['loops']['total']} >= {by_site['loops']['total']} >= {by_unit['loops']['total']}")

# ── V2.2 rankings ────────────────────────────────────────────────────────────
print("\n── V2.2  /fleet/rankings scope ladder ──")
_, r_all = api('/api/v1/cpm/fleet/rankings?limit=500', TOKEN)
_, r_site = api(f'/api/v1/cpm/fleet/rankings?limit=500&site={SITE}', TOKEN)
check('rankings ?site= narrows', r_site['count'] <= r_all['count'],
      f"{r_site['count']} <= {r_all['count']}")
off = [l['loopId'] for l in r_site['loops'] if l.get('site') != SITE]
check('every ranked loop is in the requested site', not off, f"offenders: {off[:3]}")

if UNIT:
    _, r_unit = api(f'/api/v1/cpm/fleet/rankings?limit=500&site={SITE}&unit={UNIT}', TOKEN)
    bad = [l['loopId'] for l in r_unit['loops'] if l.get('unit') != UNIT]
    check('every ranked loop is in the requested unit', not bad, f"offenders: {bad[:3]}")
    check('unit ranking <= site ranking', r_unit['count'] <= r_site['count'],
          f"{r_unit['count']} <= {r_site['count']}")

# ── V2.3 heatmap ─────────────────────────────────────────────────────────────
print("\n── V2.3  /fleet/heatmap scope ladder ──")
_, h_all = api('/api/v1/cpm/fleet/heatmap?limit=500', TOKEN)
_, h_site = api(f'/api/v1/cpm/fleet/heatmap?limit=500&site={SITE}', TOKEN)
check('heatmap ?site= narrows', h_site['count'] <= h_all['count'],
      f"{h_site['count']} <= {h_all['count']}")

# ── V2.4 unknown scope ───────────────────────────────────────────────────────
print("\n── V2.4  unknown scope is empty, not an error ──")
st, ghost = api('/api/v1/cpm/fleet/summary?site=atlantis', TOKEN)
check('unknown site → 200 with zero loops',
      st == 200 and ghost['loops']['total'] == 0, f"HTTP {st}")
st2, ghost2 = api(f'/api/v1/cpm/fleet/rankings?site={SITE}&area=does_not_exist', TOKEN)
check('unknown area → 200 with zero loops',
      st2 == 200 and ghost2['count'] == 0, f"HTTP {st2}")

# ── V2.5 scope echoed ────────────────────────────────────────────────────────
print("\n── V2.5  applied scope echoed back ──")
q = f'/api/v1/cpm/fleet/rankings?site={SITE}' + (f'&unit={UNIT}' if UNIT else '')
_, echo = api(q, TOKEN)
check('rankings echoes site', echo.get('site') == SITE, str(echo.get('site')))
if UNIT:
    check('rankings echoes unit', echo.get('unit') == UNIT, str(echo.get('unit')))
_, echo2 = api(f'/api/v1/cpm/fleet/summary?site={SITE}', TOKEN)
check('summary echoes site', echo2.get('site') == SITE, str(echo2.get('site')))

# ── V2.6 asset cascade (source of the dropdown options) ──────────────────────
print("\n── V2.6  /assets/filters cascade still correct ──")
_, sites = api('/api/assets/filters/sites', TOKEN)
db_sites = int(sql('traverse_assets',
                   "SELECT COUNT(*) FROM assets.assets WHERE asset_type=1 AND NOT is_deleted;"))
check('filters/sites count matches SQL', len(sites) == db_sites, f"{len(sites)} vs {db_sites}")
st3, _ = api('/api/assets/filters/areas', TOKEN)
check('filters/areas without site → 400', st3 == 400, f"HTTP {st3}")
_, areas = api('/api/assets/filters/areas?site=hdpe', TOKEN)
db_areas = int(sql('traverse_assets', """
  SELECT COUNT(*) FROM assets.assets a JOIN assets.assets p ON a.parent_id=p.id
  WHERE a.asset_type=2 AND NOT a.is_deleted AND p.contextual_path='hdpe';"""))
check('filters/areas?site=hdpe matches SQL', len(areas) == db_areas, f"{len(areas)} vs {db_areas}")

# ── V3 search predicate parity ───────────────────────────────────────────────
print("\n── V3.1  loop search predicate parity (UI filter vs SQL) ──")
_, loops = api('/api/v1/cpm/loops', TOKEN)
all_loops = loops['loops']

def ui_match(l, q):
    q = q.strip().lower()
    if not q: return True
    return (q in l['loopId'].lower() or q in l['displayName'].lower()
            or q in (l.get('area') or '').lower() or q in (l.get('unit') or '').lower()
            or q in l['site'].lower() or q in l['loopType'].lower())

for term in ['fic', 'crude1', 'demo', 'lic']:
    ui = sorted(l['loopId'] for l in all_loops if ui_match(l, term))
    db = sorted(x for x in sql('traverse_cplm', f"""
        SELECT loop_id FROM cpm.loop_registry
        WHERE lower(loop_id) LIKE '%{term}%' OR lower(display_name) LIKE '%{term}%'
           OR lower(COALESCE(area,'')) LIKE '%{term}%' OR lower(COALESCE(unit,'')) LIKE '%{term}%'
           OR lower(site) LIKE '%{term}%' OR lower(loop_type) LIKE '%{term}%';""").split('\n') if x)
    check(f'search "{term}" matches SQL predicate', ui == db, f"{len(ui)} vs {len(db)}")

print("\n── V3.2  scope ∩ search (intersection, not union) ──")
scoped = [l for l in all_loops if l['site'] == SITE]
both = [l for l in scoped if ui_match(l, 'fic')]
check('scope ∩ search ⊆ scope', len(both) <= len(scoped), f"{len(both)} <= {len(scoped)}")
check('scope ∩ search ⊆ search',
      len(both) <= len([l for l in all_loops if ui_match(l, 'fic')]))
check('intersection is not a union',
      all(l['site'] == SITE and ui_match(l, 'fic') for l in both))

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
