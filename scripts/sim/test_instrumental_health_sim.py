"""
v2.5 Task 1H.1 — every payload the Instrumental simulator can publish validates against the
STRICT v1 contract (contracts/instrumental-health/v1), and the contract rejects the aliases
the spec forbids (first_seen, code) and an incomplete envelope.

    python -m pytest scripts/sim/test_instrumental_health_sim.py -q
"""
import copy
import json
import os
import sys

import pytest
from jsonschema import Draft7Validator, RefResolver

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import instrumental_health_sim as sim  # noqa: E402

CONTRACTS = os.path.join(HERE, "..", "..", "contracts", "instrumental-health", "v1")


def load(name):
    with open(os.path.join(CONTRACTS, name), encoding="utf-8") as f:
        return json.load(f)


SCHEMAS = {n: load(n) for n in ("state.schema.json", "event.schema.json", "availability.schema.json")}
STORE = {s["$id"]: s for s in SCHEMAS.values()}


def validator(name):
    schema = SCHEMAS[name]
    return Draft7Validator(schema, resolver=RefResolver(base_uri=schema["$id"], referrer=schema, store=STORE))


def schema_for(payload):
    return {"STATE_SNAPSHOT": "state.schema.json", "STATE_EVENT": "event.schema.json",
            "SOURCE_AVAILABILITY": "availability.schema.json"}[payload["message_kind"]]


def errors(payload):
    return sorted(e.message for e in validator(schema_for(payload)).iter_errors(payload))


def producer():
    return sim.Producer("default", "hdpe", "instr-prm-1", "instrumental-sim", epoch=1)


@pytest.mark.parametrize("name", sorted(sim.scenarios(producer(), "TT-1", "FIC1").keys()))
def test_every_scenario_payload_validates(name):
    p = producer()
    for topic, payload, retain in sim.scenarios(p, "TT-10302", "FIC10302")[name]():
        assert errors(payload) == [], f"{name}: {topic}: {errors(payload)}"
        # the topic captures must match the payload identity (spec §4.3)
        parts = topic.split("/")
        assert parts[3] == payload["tenant_id"] and parts[4] == payload["site_id"]
        if parts[5] == "devices":
            assert parts[6] == payload["device_id"]
        else:
            assert parts[6] == payload["source_id"]


def test_snapshot_and_event_are_distinct_observations_with_distinct_ids():
    # The gateway dedupes by tenant/site/source/observation_id and treats a second record with the SAME id
    # and a different payload as INTEGRITY_CONFLICT (-> DLQ). A state event is therefore its own
    # observation: it carries the full post-state and its own observation_id (event_id correlates it).
    msgs = sim.scenarios(producer(), "TT-10302", "FIC10302")["f-on-pv"]()
    snap, ev = msgs[0][1], msgs[1][1]
    assert snap["message_kind"] == "STATE_SNAPSHOT" and ev["message_kind"] == "STATE_EVENT"
    assert snap["observation_id"] != ev["observation_id"]
    assert ev["event_id"].startswith("evt-")
    assert ev["state"] == snap["state"], "an event carries the same full post-state as the snapshot"
    assert msgs[0][2] is True and msgs[1][2] is False, "snapshots are retained, events are not"


def test_the_strict_schema_rejects_forbidden_aliases_and_incomplete_envelopes():
    snap = sim.scenarios(producer(), "TT-10302", "FIC10302")["f-on-pv"]()[0][1]
    d = copy.deepcopy(snap)
    d["state"]["diagnostics"][0]["first_seen"] = d["state"]["diagnostics"][0]["first_observed_at"]
    assert any("first_seen" in e for e in errors(d)), "alias first_seen must be rejected"
    d = copy.deepcopy(snap)
    d["state"]["diagnostics"][0]["code"] = "F210"
    assert any("code" in e for e in errors(d)), "alias code must be rejected"
    d = copy.deepcopy(snap)
    del d["state_complete"]
    assert any("state_complete" in e for e in errors(d)), "missing state_complete is a schema failure, not a clear"
    d = copy.deepcopy(snap)
    del d["verified_at"]
    assert errors(d), "missing verified_at makes freshness unknown: reject"
    d = copy.deepcopy(snap)
    d["state"]["active_flags"] = ["F", "X"]
    assert errors(d), "only F/C/S/M are NE107 categories"
    d = copy.deepcopy(snap)
    d["schema_version"] = "0.9"
    assert errors(d), "unsupported versions are rejected"


def test_flags_are_preserved_not_collapsed_to_a_scalar():
    p = producer()
    t = sim.now()
    two = sim.state(["F", "M"], "Failure; Maintenance required", "VERIFIED", "INVALID", [
        sim.diagnostic("occ-1", "F210", "Sensor failure", ["F"], ["FIC1.PV"], "INVALID", t, "c", "r", "prm://x/1"),
        sim.diagnostic("occ-2", "M401", "Calibration due", ["M"], [], "VALID", t, "c", "r", "prm://x/2"),
    ], primary_flag="F")
    snap = sim.snapshot(p, "TT-1", t, t, two)
    assert errors(snap) == []
    assert snap["state"]["active_flags"] == ["F", "M"]
    assert snap["state"]["primary_flag"] == "F"


def test_availability_offline_is_a_last_will_capable_retained_message():
    p = producer()
    msgs = sim.scenarios(p, "TT-1", "FIC1")["offline"]()
    topic, payload, retain = msgs[0]
    assert retain is True and payload["state"] == "OFFLINE" and payload["last_will"] is True
    assert errors(payload) == []
