#!/usr/bin/env python3
"""v2.5 Task 3A.1 (spec v6 §5.1, R16 / R18): the 165-property gate configuration catalogue AS CODE.

Source of truth: docs/next-release/spec/xlsx_Gate_properties.tsv (the workbook sheet, checked in).
Output (all four written from one run, so no consumer can drift from the others):
  contracts/gate-config/v1/property-catalogue.json                       canonical
  src/services/cplm-api/Config/property-catalogue.json                   cplm-api embedded resource (its Docker context)
  src/flink/src/main/resources/cplm/gate-config/property-catalogue.json  Flink classpath resource (its Docker mount)
  src/frontend-ob/src/api/cpm/configCatalogue.generated.ts               typed catalogue for the configuration workspace

Each entry: {id, gate, property, type, unit, default (null = "Commissioning required"), validation,
change_class (POLICY | STATE_BOUNDARY | DEPLOYMENT), consumers[], dependencies[] (properties whose
change reaches this one - the change-class promotion walks them), effect}. The catalogue hash is the
SHA-256 of the canonical entries JSON; /capabilities and the Flink CAPABILITY ACK both report it.

  python scripts/gen-property-catalogue.py            # (re)generate
  python scripts/gen-property-catalogue.py --check    # verify every copy equals the canonical file (CI / 4.2)
"""
import csv
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TSV = os.path.join(ROOT, "docs", "next-release", "spec", "xlsx_Gate_properties.tsv")
CANONICAL = os.path.join(ROOT, "contracts", "gate-config", "v1", "property-catalogue.json")
COPIES = [
    os.path.join(ROOT, "src", "services", "cplm-api", "Config", "property-catalogue.json"),
    os.path.join(ROOT, "src", "flink", "src", "main", "resources", "cplm", "gate-config", "property-catalogue.json"),
]
TS_OUT = os.path.join(ROOT, "src", "frontend-ob", "src", "api", "cpm", "configCatalogue.generated.ts")

TIER_OF = {"G0": "short", "G1": "short", "G2": "short", "G2r": "short", "G3": "short", "G4": "short",
           "G5": "long", "G6": "long", "G7": "long", "G8": "long", "G9": "long", "G10": "long", "G11": "long",
           "G12": "response", "G13": "long", "G14": "fusion", "G15": "fusion"}

# properties read outside the gate's own tier (a property with no reader is a release defect - 3A.2 tests it)
EXTRA_CONSUMERS = {
    "G10.limit_tolerance_pp": ["flink:condition"], "G10.limit_dwell_warn_s": ["flink:condition"],
    "G11.freeze_tolerance_pv_eu": ["flink:condition"], "G11.freeze_dwell_s": ["flink:condition"],
    "G12.model_max_age_s": ["api"], "G14.require_independent_review": ["api"], "G14.confirmation_record_max_age_s": ["api"],
    "G15.notification_repeat_s": ["api"], "G15.recovery_support_s": ["api"], "G15.episode_persistence_s": ["api"],
    "G13.peer_binding_ids": ["api"], "G0.acquisition_mode": ["api"],
}
API_ONLY = {"evidence_retention_days"}                       # the retention sweeper reads these, no job does

# "X depends on Y": a change to Y reaches X, so an edit of Y is promoted to X's change class
DEPENDENCIES = {
    "G0.max_gap_s": ["G0.acquisition_mode"], "G0.required_signal_max_age_s": ["G0.acquisition_mode"], "G0.alignment_tolerance_s": ["G0.acquisition_mode"],
    "G0.jitter_warn_fraction": ["G0.acquisition_mode"],
    "G1.transition_guard_s": ["G1.auto_tokens"], "G1.auto_fraction_min": ["G1.auto_tokens"], "G1.authority_max_age_s": ["G1.auto_tokens"],
    "G2.step_min_pv_eu": ["G2.stability_band_pv_eu", "G2.stability_band_span_fraction"], "G2.event_dwell_s": ["G2.step_min_pv_eu"],
    "G2.ramp_min_pv_eu_per_s": ["G2.stability_band_pv_eu", "G2.stability_band_span_fraction"],
    "G2r.pv_region_max": ["G2r.pv_region_min"], "G2r.applied_input_region_max": ["G2r.applied_input_region_min"],
    "G2r.out_of_domain_warn_fraction": ["G2r.pv_region_min", "G2r.pv_region_max", "G2r.applied_input_region_min", "G2r.applied_input_region_max"],
    "G3.error_band_abs_pv_eu": ["G3.objective_type"], "G3.error_band_span_fraction": ["G3.objective_type"],
    "G3.objective_compliance_min": ["G3.error_band_abs_pv_eu", "G3.error_band_span_fraction"], "G3.baseline_min_valid_s": ["G3.ewma_alpha"],
    "G4.activity_high_ratio": ["G4.activity_warn_ratio"], "G4.travel_rate_min_support_s": ["G4.reversal_deadband_pp"],
    "G5.period_max_s": ["G5.period_min_s"], "G5.acf_lag_max_s": ["G5.period_max_s"], "G5.min_samples_per_period": ["G5.period_min_s", "G0.acquisition_mode"],
    "G5.regularity_min": ["G5.min_complete_cycles"],
    "G6.period_max_s": ["G6.period_min_s"], "G6.segment_samples": ["G6.period_max_s", "G6.estimator"], "G6.overlap_fraction": ["G6.segment_samples"],
    "G6.harmonic_max_order": ["G6.period_min_s"], "G6.peak_to_background_min": ["G6.estimator"], "G6.spectral_concentration_warn": ["G6.estimator"],
    "G7.shape_score_high": ["G7.shape_score_warn"], "G7.min_accepted_cycles": ["G5.min_complete_cycles"], "G7.min_cycle_amplitude": ["G7.shape_method"],
    "G8.asymmetry_display_threshold": ["G8.method"], "G8.significance_alpha": ["G8.surrogate_repetitions"], "G8.max_lag_s": ["G5.period_max_s"],
    "G9.min_accepted_cycles": ["G5.min_complete_cycles"], "G9.area_valid_max": ["G9.area_valid_min"], "G9.area_display_threshold": ["G9.area_valid_min", "G9.area_valid_max"],
    "G9.geometry_contribution_cap": ["G9.corner_angle_deg"],
    "G10.occupancy_warn_fraction": ["G10.limit_dwell_warn_s"], "G10.nonfollowing_dwell_s": ["G10.nonfollowing_error_pp"], "G10.limit_dwell_warn_s": ["G10.limit_tolerance_pp"],
    "G11.freeze_dwell_s": ["G11.freeze_tolerance_pv_eu"], "G11.late_health_correction_horizon_s": ["G11.instrument_verified_max_age_s"],
    "G12.step_min_span_fraction": ["G12.step_min_input_eu"], "G12.post_support_min_s": ["G12.pre_support_s"], "G12.capture_max_s": ["G12.post_support_min_s"],
    "G12.settling_tail_dwell_s": ["G12.crossing_dwell_s"], "G12.settling_abs_band_pv_eu": ["G12.settling_relative_band"],
    "G12.delay_max_s": ["G12.delay_min_s"], "G12.tau_max_s": ["G12.tau_min_s"], "G12.estimator": ["G12.model_families"],
    "G12.uncertainty_method": ["G12.estimator"], "G12.bootstrap_repetitions": ["G12.uncertainty_method"], "G12.fit_relative_tolerance": ["G12.fit_max_iterations"],
    "G12.validation_rmse_max_pv_eu": ["G12.settling_abs_band_pv_eu"], "G12.confidence_level": ["G12.uncertainty_method"], "G12.lambda_s": ["G12.tau_min_s"],
    "G13.coherence_display_min": ["G13.lag_max_s"], "G13.max_peers": ["G13.peer_binding_ids"], "G13.min_compatible_support_s": ["G13.lag_max_s"],
    "G14.confirmation_record_max_age_s": ["G14.allowed_evidence_types"],
    "G15.recovery_support_s": ["G15.episode_persistence_s"], "G15.hypothesis_score_display_min": ["G15.minimum_evidence_groups"],
    "G15.notification_repeat_s": ["G15.episode_persistence_s"],
}

TYPES = {"enum", "number", "integer", "boolean", "string_array"}
CLASSES = {"POLICY", "STATE_BOUNDARY", "DEPLOYMENT"}


def parse_default(raw, ptype):
    v = (raw or "").strip()
    if v == "" or v.lower() == "commissioning required":
        return None
    if ptype == "boolean":
        return v.lower() == "true"
    if ptype == "integer":
        return int(float(v))
    if ptype == "number":
        return float(v)
    return v


def load_entries():
    rows = []
    with open(TSV, encoding="utf-8", newline="") as f:
        for line in f:
            rows.append(line.rstrip("\r\n").split("\t"))
    header_index = next(i for i, r in enumerate(rows) if r and r[0] == "ID")
    entries = []
    for r in rows[header_index + 1:]:
        if len(r) < 8 or not r[0].startswith("CFG-"):
            continue
        pid, gate, prop, ptype, unit, default, validation, change_class, effect = (r + [""] * 9)[:9]
        ptype = ptype.strip()
        if ptype not in TYPES:
            raise SystemExit(f"{pid}: unknown type {ptype!r}")
        change_class = change_class.strip()
        if change_class not in CLASSES:
            raise SystemExit(f"{pid}: unknown change class {change_class!r}")
        vtext = validation.strip()
        if vtext.startswith('"') and vtext.endswith('"'):
            vtext = vtext[1:-1].replace('""', '"')
        vparsed = json.loads(vtext) if vtext else {}
        consumers = []
        short_name = prop.split(".", 1)[1]
        if short_name in API_ONLY:
            consumers = ["api"]
        else:
            consumers = [f"flink:{TIER_OF[gate]}"]
            if short_name in ("mode", "role"):
                consumers.append("api")
        for extra in EXTRA_CONSUMERS.get(prop, []):
            if extra not in consumers:
                consumers.append(extra)
        entries.append({
            "id": pid, "gate": gate, "property": prop, "type": ptype, "unit": unit.strip(),
            "default": parse_default(default, ptype), "validation": vparsed, "change_class": change_class,
            "consumers": consumers, "dependencies": list(DEPENDENCIES.get(prop, [])), "effect": effect.strip(),
        })
    return entries


def check_graph(entries):
    ids = {e["property"] for e in entries}
    for e in entries:
        for d in e["dependencies"]:
            if d not in ids:
                raise SystemExit(f"{e['property']} depends on unknown property {d}")
    # cycle check (DFS)
    deps = {e["property"]: e["dependencies"] for e in entries}
    state = {}

    def visit(p, stack):
        if state.get(p) == 1:
            raise SystemExit("dependency cycle: " + " -> ".join(stack + [p]))
        if state.get(p) == 2:
            return
        state[p] = 1
        for d in deps[p]:
            visit(d, stack + [p])
        state[p] = 2

    for p in deps:
        visit(p, [])


def canonical_json(entries):
    return json.dumps(entries, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def build():
    entries = load_entries()
    if len(entries) != 165:
        raise SystemExit(f"expected 165 properties, parsed {len(entries)}")
    if len({e["id"] for e in entries}) != 165 or len({e["property"] for e in entries}) != 165:
        raise SystemExit("duplicate ids or properties")
    check_graph(entries)
    catalogue_hash = hashlib.sha256(canonical_json(entries).encode("utf-8")).hexdigest()
    doc = {
        "schema": "traverse.cpa.gate-config.property-catalogue/v1",
        "source": "docs/next-release/spec/xlsx_Gate_properties.tsv (spec v6 sheet '165 PROPOSED GATE PROPERTIES')",
        "generated_by": "scripts/gen-property-catalogue.py",
        "catalogue_hash": catalogue_hash,
        "count": len(entries),
        "change_classes": ["POLICY", "STATE_BOUNDARY", "DEPLOYMENT"],
        "consumers": sorted({c for e in entries for c in e["consumers"]}),
        "properties": entries,
    }
    return doc


def ts_module(doc):
    lines = [
        "// GENERATED by scripts/gen-property-catalogue.py from docs/next-release/spec/xlsx_Gate_properties.tsv - do not edit.",
        "// v2.5 Task 3A.1: the 165-property gate configuration catalogue, typed for the configuration workspace.",
        "export type ChangeClass = 'POLICY' | 'STATE_BOUNDARY' | 'DEPLOYMENT';",
        "export type PropertyType = 'enum' | 'number' | 'integer' | 'boolean' | 'string_array';",
        "export interface CatalogueProperty {",
        "  id: string; gate: string; property: string; type: PropertyType; unit: string;",
        "  /** null = \"Commissioning required\" (no starting value; the site must declare it). */",
        "  default: number | string | boolean | null;",
        "  validation: Record<string, unknown> | string[];",
        "  change_class: ChangeClass; consumers: string[]; dependencies: string[]; effect: string;",
        "}",
        f"export const CATALOGUE_HASH = '{doc['catalogue_hash']}';",
        f"export const CATALOGUE_COUNT = {doc['count']};",
        "export const CATALOGUE: CatalogueProperty[] = " + json.dumps(doc["properties"], indent=2, ensure_ascii=False) + ";",
        "export const CATALOGUE_BY_PROPERTY: Record<string, CatalogueProperty> = Object.fromEntries(CATALOGUE.map(p => [p.property, p]));",
        "",
    ]
    return "\n".join(lines)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def main():
    doc = build()
    text = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        problems = []
        for path in [CANONICAL] + COPIES:
            if not os.path.exists(path) or open(path, encoding="utf-8").read() != text:
                problems.append(path)
        if not os.path.exists(TS_OUT) or open(TS_OUT, encoding="utf-8").read() != ts_module(doc):
            problems.append(TS_OUT)
        if problems:
            print("STALE catalogue copies (run scripts/gen-property-catalogue.py):\n  " + "\n  ".join(problems))
            return 1
        print(f"catalogue OK: {doc['count']} properties, hash {doc['catalogue_hash'][:16]}…, 4 copies identical")
        return 0
    for path in [CANONICAL] + COPIES:
        write(path, text)
    write(TS_OUT, ts_module(doc))
    print(f"wrote {doc['count']} properties, catalogue_hash {doc['catalogue_hash']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
