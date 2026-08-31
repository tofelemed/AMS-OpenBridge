#!/usr/bin/env python3
"""Generate scripts/fixtures/hdpe-all-loops.csv — the full HDPE loop registry import.

Source: the plant's OT loop export ("Loops.csv", 2026-08-31): 1288 rows of
FCS.LOOP.PARAM with 8 params per loop (PV, SV, MV, MODE, P, I, D, GW — Yokogawa
naming: SV = setpoint, MV = controller output). Unique loops embedded below:
161 total = FCS0101:73 + FCS0102:68 + FCS0103:11 + FCS0104:9, matching the broker
topic counts (584+544+88+72 topics / 8).

Output columns match scripts/import-cpm-loops.ps1 / the Loop Registry bulk import.
Placement: site=hdpe, area/unit assigned pseudo-randomly (seeded — regeneration is
stable) from the REAL seeded tree (database/scripts/48_hdpe_plant_hierarchy.sql).
Source tags carry the full OT identity incl. the FCS (FCS0101.FIC10301.PV) — the
registry has no FCS column, so the tags + display name preserve the station.

    python scripts/make-hdpe-all-loops.py
"""
import csv
import random
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent / "fixtures" / "hdpe-all-loops.csv"

# ── Unique loops from the export (verified against broker counts) ─────────────
LOOPS = {
    "FCS0101": [
        # FIC (23)
        "FIC10301", "FIC10302", "FIC10303A", "FIC10303B", "FIC10401", "FIC10402",
        "FIC10403", "FIC10404", "FIC10405", "FIC10406", "FIC10409", "FIC10501",
        "FIC10502", "FIC10503", "FIC10504", "FIC10505", "FIC10506", "FIC10509",
        "FIC10513", "FIC10710", "FIC30701", "FIC80103", "FIC80104",
        # LIC (8)
        "LIC10401", "LIC10404", "LIC10501", "LIC10601", "LIC10704", "LIC10719",
        "LIC80101", "LIC80102",
        # PIC (32)
        "PIC00521", "PIC00551", "PIC00605", "PIC00609", "PIC00610", "PIC00620",
        "PIC10101", "PIC10104", "PIC10116", "PIC10201A", "PIC10201B", "PIC10201C",
        "PIC10320", "PIC10323", "PIC10407_2", "PIC10411", "PIC10412", "PIC10413",
        "PIC10511", "PIC10512", "PIC10513", "PIC10603", "PIC10703", "PIC10704",
        "PIC80103", "PIC80105", "PIC80140", "PIC80141", "PIC80142", "PIC80142B",
        "PIC80143", "PIC80150",
        # TIC (10)
        "TIC10101", "TIC10102", "TIC10403", "TIC10503", "TIC10603", "TIC10608",
        "TIC10704", "TIC80104", "TIC80105", "TIC80150",
    ],
    "FCS0102": [
        # FIC (12)
        "FIC00701", "FIC20209", "FIC20301", "FIC20404", "FIC30102", "FIC30201",
        "FIC30202", "FIC30203", "FIC30303", "FIC30501", "FIC30502", "FIC30603",
        # LIC (17)
        "LIC20202", "LIC20401", "LIC20402", "LIC20541", "LIC20601", "LIC20602",
        "LIC30101", "LIC30102", "LIC30103", "LIC30104", "LIC30206", "LIC30302",
        "LIC30307", "LIC30310", "LIC30501", "LIC30601", "LIC30608",
        # PIC (22)
        "PIC20120", "PIC20203", "PIC20204", "PIC20317", "PIC20406", "PIC20501",
        "PIC20603", "PIC30102", "PIC30104", "PIC30108", "PIC30204", "PIC30305",
        "PIC30306", "PIC30307", "PIC30325", "PIC30601", "PIC30611", "PIC40101",
        "PIC40102", "PIC40108", "PIC40201", "PIC40202",
        # TIC (17)
        "TIC00705", "TIC20305", "TIC20405", "TIC20601", "TIC20607", "TIC30104",
        "TIC30107", "TIC30109", "TIC30110", "TIC30206", "TIC30304", "TIC30306",
        "TIC30309", "TIC30501", "TIC30502", "TIC30603", "TIC30604",
    ],
    "FCS0103": [
        "FIC50201", "FIC60210", "LIC50303", "PIC50206", "PIC50216", "PIC51208",
        "PIC51309", "TIC30401", "TIC50302", "TIC51402", "TIC51406",
    ],
    "FCS0104": [
        "FIC30303_WR", "LIC30320", "PIC30322", "PIC30323", "TIC30320", "TIC30325",
        "TIC31001", "TIC31002", "TIC31003",
    ],
}
EXPECTED = {"FCS0101": 73, "FCS0102": 68, "FCS0103": 11, "FCS0104": 9}

# ── The real HDPE tree (48_hdpe_plant_hierarchy.sql) ─────────────────────────
UNITS = [
    ("section_100", "u1001_polymerization_reactor_1"),
    ("section_100", "u1002_polymerization_ii_reactor_2"),
    ("section_100", "u1003_polymerization_ii_post_reactor"),
    ("section_100", "u1004_suspension_receiver_off_gas_system"),
    ("section_100", "u1005_catalyst_dosage"),
    ("section_100", "u1006_catalyst_storage"),
    ("section_100", "u1007_catalyst_preparation"),
    ("section_200", "u2002_powder_drying_i"),
    ("section_200", "u2003_powder_drying_ii_scrubber"),
    ("section_200", "u2005_refrigeration_unit_hexane_supply"),
    ("section_300", "u3001_hexane_purification_i_distillation"),
    ("section_300", "u3002_hexane_purification_ii_adsorbtion"),
    ("section_300", "u3003_wax_recovery_thinfilm_evaporator"),
    ("section_300", "u3004_wax_pretreatment"),
    ("section_300", "u3005_butene_recovery"),
    ("section_300", "u3006_waste_water_pretreatment"),
    ("section_400", "u4001_hexane_tankfarm"),
    ("section_400", "u4002_catalyst_tankfarm"),
    ("section_400", "u4003_hexane_tankfarm_fire_fighting_water_spray_fixed_system"),
    ("section_500", "u5002_hdpe_extruder_feed"),
    ("section_500", "u5003_pellet_water_transport_system_drying"),
    ("section_600", "u6001_pellet_homogenization_i_silo_1_2_3"),
    ("section_600", "u6002_pellet_homogenization_ii_silo_4_5"),
    ("section_800", "u8001_condensate_and_steam_supply_system"),
    ("section_800", "u8002_utility_supply"),
]

TYPE_NAME = {"FIC": "Flow controller", "PIC": "Pressure controller",
             "LIC": "Level controller", "TIC": "Temperature controller"}


def safe_node(name: str) -> str:
    """Mirror of IotDbWriteClient.SafeNode: non-alphanumeric -> _, digit-prefix guard."""
    s = re.sub(r"[^A-Za-z0-9]", "_", name)
    return ("_" + s) if s and s[0].isdigit() else s


def main():
    # Verify the embedded list against the export's arithmetic before writing anything.
    all_ids = [loop for loops in LOOPS.values() for loop in loops]
    assert len(all_ids) == 161, f"expected 161 loops, embedded {len(all_ids)}"
    assert len(set(all_ids)) == 161, "duplicate loop_id across FCS stations - registry PK would collide"
    for fcs, expected in EXPECTED.items():
        assert len(LOOPS[fcs]) == expected, f"{fcs}: {len(LOOPS[fcs])} != {expected}"
        assert len(set(LOOPS[fcs])) == expected, f"{fcs}: duplicates within station"
    nodes = [safe_node(l) for l in all_ids]
    assert len(set(n.lower() for n in nodes)) == 161, "historian-node collision (LOOP_ID_HISTORIAN_COLLISION)"

    rng = random.Random(48)  # seeded: regeneration yields the identical file
    rows = []
    for fcs in sorted(LOOPS):
        for loop in LOOPS[fcs]:
            prefix = loop[:3]
            area, unit = rng.choice(UNITS)
            rows.append({
                "loop_id": loop,
                "display_name": f"{TYPE_NAME[prefix]} {loop} ({fcs})",
                "site": "hdpe",
                "area": area,
                "unit": unit,
                "loop_type": prefix,
                "criticality": "medium",
                # Full OT identity incl. the FCS; SV/MV are the Yokogawa names from
                # the export (ingestion accepts SP/OP and SV/MV alike).
                "pv_ot_tag": f"{fcs}.{loop}.PV",
                "sp_ot_tag": f"{fcs}.{loop}.SV",
                "op_ot_tag": f"{fcs}.{loop}.MV",
                "mode_ot_tag": f"{fcs}.{loop}.MODE",
                "vp_ot_tag": "",
                "op_min": "0",
                "op_max": "100",
                "enable_monitoring": "true",
                "profile": "",
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="ascii") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    per_fcs = {fcs: len(loops) for fcs, loops in LOOPS.items()}
    per_type = {}
    for loop in all_ids:
        per_type[loop[:3]] = per_type.get(loop[:3], 0) + 1
    print(f"wrote {OUT} - {len(rows)} loops")
    print(f"  per FCS : {per_fcs}")
    print(f"  per type: {per_type}")


if __name__ == "__main__":
    main()
