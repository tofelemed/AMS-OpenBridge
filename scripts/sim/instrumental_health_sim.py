#!/usr/bin/env python3
"""
Instrumental NE107 transmitter-health publisher SIMULATOR (v2.5 Task 1H.1, spec v6 §4.3-4.5).

Instrumental's real publisher is external and not yet delivered; this simulator produces the
v1 contract messages so the CPA ingestion -> Kafka -> Flink -> API -> UI path can be built and
tested in the lab. Payloads are built by PURE functions (validated by test_instrumental_health_sim.py
against contracts/instrumental-health/v1/*.schema.json); publishing is separate.

Topics (spec §4.3):
  traverse/instrumental/v1/{tenant}/{site}/devices/{device}/state          retained, QoS 1
  traverse/instrumental/v1/{tenant}/{site}/devices/{device}/events         not retained, QoS 1
  traverse/instrumental/v1/{tenant}/{site}/sources/{source}/availability   retained, QoS 1 (+ LWT OFFLINE)

Scenarios (--scenario): f-on-pv | c-test | s-degraded | m-only | clear | stale | dup | conflict |
  epoch-reset | late-correction | replace-device | offline | online | all

  python scripts/sim/instrumental_health_sim.py --scenario f-on-pv --loop FIC10302 --print
  python scripts/sim/instrumental_health_sim.py --scenario f-on-pv --loop FIC10302 --broker 127.0.0.1 --port 1884
"""
import argparse
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)  # paho 2.x callback-API notice; the v1 API is used deliberately
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

SCHEMA_VERSION = "1.0"
PREFIX = "traverse/instrumental/v1"
MAPPING_VERSION = "ne107-2025-07-15/sim-1"


def iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def now() -> datetime:
    return datetime.now(timezone.utc)


class Producer:
    """Identity + counters of one simulated Instrumental bridge (one epoch per process start)."""

    def __init__(self, tenant, site, source, producer_id, epoch=None):
        self.tenant = tenant
        self.site = site
        self.source = source
        self.producer_id = producer_id
        self.epoch = epoch if epoch is not None else int(now().timestamp())
        self.sequence = {}     # device -> next sequence
        self.revision = {}     # device -> state_revision

    def next_seq(self, device):
        n = self.sequence.get(device, 0)
        self.sequence[device] = n + 1
        return n

    def next_revision(self, device):
        n = self.revision.get(device, 0) + 1
        self.revision[device] = n
        return n

    def topic_state(self, device):
        return f"{PREFIX}/{self.tenant}/{self.site}/devices/{device}/state"

    def topic_events(self, device):
        return f"{PREFIX}/{self.tenant}/{self.site}/devices/{device}/events"

    def topic_availability(self):
        return f"{PREFIX}/{self.tenant}/{self.site}/sources/{self.source}/availability"


# ── pure payload builders ────────────────────────────────────────────────────

def diagnostic(diag_id, code, message, flags, affected, impact, first_observed, cause, remedy, ref, category=None):
    d = {
        "diagnostic_id": diag_id,
        "native_code": code,
        "message": message,
        "flags": list(flags),
        "affected_variable_ids": list(affected),
        "measurement_impact": impact,
        "first_observed_at": iso(first_observed),
        "cause": cause,
        "remedy": remedy,
        "source_record_ref": ref,
    }
    if category:
        d["native_category"] = category
    return d


def state(active_flags, native_status, collection_state, impact, diagnostics, primary_flag=None):
    s = {
        "active_flags": list(active_flags),
        "native_status": native_status,
        "collection_state": collection_state,
        "measurement_impact": impact,
        "diagnostics": list(diagnostics),
    }
    if primary_flag:
        s["primary_flag"] = primary_flag
        s["primary_flag_policy_version"] = "sim-primary-1"
    return s


def envelope(p: Producer, kind, device, observed, verified, st, complete=True, installation=None,
             observation_id=None, sequence=None, revision=None, scan_interval_s=30.0):
    seq = p.next_seq(device) if sequence is None else sequence
    rev = p.next_revision(device) if revision is None else revision
    e = {
        "schema_version": SCHEMA_VERSION,
        "message_kind": kind,
        "observation_id": observation_id or f"obs-{uuid.uuid4()}",
        "tenant_id": p.tenant,
        "site_id": p.site,
        "producer_id": p.producer_id,
        "producer_epoch": p.epoch,
        "sequence": seq,
        "source_id": p.source,
        "device_id": device,
        "observed_at": iso(observed),
        "verified_at": iso(verified),
        "published_at": iso(now()),
        "state_revision": rev,
        "state_complete": bool(complete),
        "verification_kind": "UPSTREAM_DATABASE_POLL",
        "scan_interval_s": scan_interval_s,
        "mapping_version": MAPPING_VERSION,
        "state": st,
    }
    if installation:
        e["installation_id"] = installation
    return e


def snapshot(p, device, observed, verified, st, **kw):
    return envelope(p, "STATE_SNAPSHOT", device, observed, verified, st, **kw)


def event(p, device, observed, verified, st, change_kind, diagnostic_ids, corrects=None, **kw):
    e = envelope(p, "STATE_EVENT", device, observed, verified, st, **kw)
    e["event_id"] = f"evt-{uuid.uuid4()}"
    e["change_kind"] = change_kind
    e["diagnostic_ids"] = list(diagnostic_ids)
    if corrects:
        e["corrects_observation_id"] = corrects
    return e


def availability(p: Producer, av_state, since, last_will=False):
    return {
        "schema_version": SCHEMA_VERSION,
        "message_kind": "SOURCE_AVAILABILITY",
        "tenant_id": p.tenant,
        "site_id": p.site,
        "source_id": p.source,
        "producer_id": p.producer_id,
        "producer_epoch": p.epoch,
        "state": av_state,
        "since": iso(since),
        "published_at": iso(now()),
        "last_will": bool(last_will),
        "scan_interval_s": 30.0,
        "expected_collection_latency_s": 5.0,
    }


# ── scenarios: each returns [(topic, payload, retain)] ────────────────────────

def scenarios(p: Producer, device, loop, installation="inst-1"):
    t = now()
    pv = f"{loop}.PV"
    ok = state([], "Good", "VERIFIED", "VALID", [])

    def f_on_pv():
        d = diagnostic("occ-F-0001", "F210", "Sensor element failure", ["F"], [pv], "INVALID", t - timedelta(minutes=2),
                       "Open circuit on the measuring cell", "Replace the sensor element", "prm://instrumental/occurrences/occ-F-0001",
                       category="Failure")
        st = state(["F"], "Failure", "VERIFIED", "INVALID", [d], primary_flag="F")
        obs = f"obs-{uuid.uuid4()}"
        return [
            (p.topic_state(device), snapshot(p, device, t - timedelta(minutes=2), t, st, installation=installation, observation_id=obs), True),
            # the event is its OWN observation (fresh observation_id): reusing the snapshot's id is an
            # INTEGRITY_CONFLICT at the gateway (same id, different payload) - see the 'conflict' scenario.
            (p.topic_events(device), event(p, device, t - timedelta(minutes=2), t, st, "DIAGNOSTIC_RAISED", ["occ-F-0001"],
                                           installation=installation), False),
        ]

    def c_test():
        d = diagnostic("occ-C-0002", "C102", "Function check: simulated output active", ["C"], [pv], "INVALID",
                       t - timedelta(minutes=1), "Loop test in progress", "Ends automatically when the test completes",
                       "prm://instrumental/occurrences/occ-C-0002", category="Function check")
        st = state(["C"], "Function check", "VERIFIED", "INVALID", [d], primary_flag="C")
        return [(p.topic_state(device), snapshot(p, device, t - timedelta(minutes=1), t, st, installation=installation), True)]

    def s_degraded():
        d = diagnostic("occ-S-0003", "S310", "Process temperature outside specified range", ["S"], [pv], "DEGRADED",
                       t - timedelta(minutes=5), "Ambient above the transmitter's specification", "Check insulation / relocate",
                       "prm://instrumental/occurrences/occ-S-0003", category="Out of specification")
        st = state(["S"], "Out of specification", "VERIFIED", "DEGRADED", [d], primary_flag="S")
        return [(p.topic_state(device), snapshot(p, device, t - timedelta(minutes=5), t, st, installation=installation), True)]

    def m_only():
        d = diagnostic("occ-M-0004", "M401", "Calibration interval expired", ["M"], [], "VALID",
                       t - timedelta(hours=3), "Scheduled calibration due", "Plan calibration at the next maintenance window",
                       "prm://instrumental/occurrences/occ-M-0004", category="Maintenance required")
        st = state(["M"], "Maintenance required", "VERIFIED", "VALID", [d], primary_flag="M")
        return [(p.topic_state(device), snapshot(p, device, t - timedelta(hours=3), t, st, installation=installation), True)]

    def clear():
        return [(p.topic_state(device), snapshot(p, device, t, t, ok, installation=installation, complete=True), True)]

    def stale():
        st = state(["M"], "Maintenance required", "STALE", "UNKNOWN",
                   [diagnostic("occ-M-0004", "M401", "Calibration interval expired", ["M"], [], "VALID", t - timedelta(hours=5),
                               "Scheduled calibration due", "Plan calibration", "prm://instrumental/occurrences/occ-M-0004")])
        # verified two hours ago: freshness expired under any sane policy
        return [(p.topic_state(device), snapshot(p, device, t - timedelta(hours=5), t - timedelta(hours=2), st, installation=installation), True)]

    def dup():
        one = f_on_pv()[0]
        return [one, one]

    def conflict():
        a = f_on_pv()[0]
        b = (a[0], json.loads(json.dumps(a[1])), True)
        b[1]["state"]["native_status"] = "Failure (edited)"          # same observation_id, different payload
        return [a, b]

    def epoch_reset():
        # a producer restart: new epoch, sequence 0. An EVENT arriving before that epoch's first
        # complete snapshot must be parked (EPOCH_WITHOUT_SNAPSHOT); the snapshot then supersedes.
        p.epoch += 1
        p.sequence.pop(device, None)
        st = state([], "Good", "VERIFIED", "VALID", [])
        ev = event(p, device, t, t, st, "STATE_RESYNC", [], installation=installation)
        snap = snapshot(p, device, t, t, st, installation=installation, complete=True)
        return [(p.topic_events(device), ev, False), (p.topic_state(device), snap, True)]

    def late_correction():
        first = f_on_pv()
        obs_original = first[0][1]["observation_id"]
        d = diagnostic("occ-F-0001", "F210", "Sensor element failure", ["F"], [pv], "INVALID", t - timedelta(minutes=30),
                       "Open circuit on the measuring cell", "Replace the sensor element", "prm://instrumental/occurrences/occ-F-0001")
        st = state(["F"], "Failure", "VERIFIED", "INVALID", [d], primary_flag="F")
        corr = event(p, device, t - timedelta(minutes=30), t, st, "LATE_CORRECTION", ["occ-F-0001"],
                     corrects=obs_original, installation=installation)
        return first + [(p.topic_events(device), corr, False)]

    def replace_device():
        # the old transmitter's last state, then the replacement (another device_id / installation_id)
        old = snapshot(p, device, t - timedelta(hours=1), t - timedelta(hours=1), ok, installation=installation, complete=True)
        new_dev = device + "-R2"
        new = snapshot(p, new_dev, t, t, ok, installation="inst-2", complete=True)
        return [(p.topic_state(device), old, True), (p.topic_state(new_dev), new, True)]

    def offline():
        return [(p.topic_availability(), availability(p, "OFFLINE", t, last_will=True), True)]

    def online():
        return [(p.topic_availability(), availability(p, "ONLINE", t), True)]

    return {
        "f-on-pv": f_on_pv, "c-test": c_test, "s-degraded": s_degraded, "m-only": m_only, "clear": clear,
        "stale": stale, "dup": dup, "conflict": conflict, "epoch-reset": epoch_reset,
        "late-correction": late_correction, "replace-device": replace_device, "offline": offline, "online": online,
    }


# ── publishing ───────────────────────────────────────────────────────────────

def publish(messages, broker, port, username, password, producer: Producer, keep_open=False):
    import paho.mqtt.client as mqtt
    client = mqtt.Client(client_id=f"instrumental-sim-{producer.producer_id}", protocol=mqtt.MQTTv311)
    if username:
        client.username_pw_set(username, password or None)
    # Last will: the broker publishes OFFLINE on our behalf if we drop.
    lwt = availability(producer, "OFFLINE", now(), last_will=True)
    client.will_set(producer.topic_availability(), json.dumps(lwt), qos=1, retain=True)
    client.connect(broker, port, keepalive=30)
    client.loop_start()
    # A scenario that states availability itself (offline / online) must not be preceded by a
    # connect-time ONLINE whose `since` is later than the scenario's record.
    if not any(topic == producer.topic_availability() for topic, _, _ in messages):
        online = availability(producer, "ONLINE", now())
        client.publish(producer.topic_availability(), json.dumps(online), qos=1, retain=True).wait_for_publish(10)
    for topic, payload, retain in messages:
        info = client.publish(topic, json.dumps(payload), qos=1, retain=retain)
        info.wait_for_publish(10)
        print(f"published {payload.get('message_kind')} -> {topic} (retain={retain})")
    if keep_open:
        print("holding the connection open (Ctrl+C to drop and trigger the last will)")
        try:
            while True:
                client.loop_misc()
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    client.loop_stop()
    client.disconnect()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenario", required=True)
    ap.add_argument("--tenant", default="default")
    ap.add_argument("--site", default="hdpe")
    ap.add_argument("--source", default="instr-prm-1")
    ap.add_argument("--producer", default="instrumental-sim")
    ap.add_argument("--device", default="TT-10302")
    ap.add_argument("--loop", default="FIC10302")
    ap.add_argument("--epoch", type=int, default=None)
    # Lab defaults = the mosquitto-test broker the OT simulator uses (host 1884, ams_ingest).
    ap.add_argument("--broker", default=os.environ.get("SIM_OT_MQTT_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIM_OT_MQTT_PORT", "1884")))
    ap.add_argument("--username", default=os.environ.get("SIM_OT_MQTT_USERNAME", "ams_ingest"))
    ap.add_argument("--password", default=os.environ.get("SIM_OT_MQTT_PASSWORD", "ams-ingest-test"))
    ap.add_argument("--print", action="store_true", help="print the payloads instead of publishing")
    ap.add_argument("--hold", action="store_true", help="keep the connection open after publishing (LWT test)")
    args = ap.parse_args(argv)

    p = Producer(args.tenant, args.site, args.source, args.producer, args.epoch)
    table = scenarios(p, args.device, args.loop)
    names = list(table) if args.scenario == "all" else [args.scenario]
    unknown = [n for n in names if n not in table]
    if unknown:
        sys.exit(f"unknown scenario(s) {unknown}; choose from {sorted(table)}")
    messages = []
    for n in names:
        messages += table[n]()
    if args.print:
        for topic, payload, retain in messages:
            print(f"# {topic} retain={retain}")
            print(json.dumps(payload, indent=2))
        return 0
    publish(messages, args.broker, args.port, args.username, args.password, p, keep_open=args.hold)
    return 0


if __name__ == "__main__":
    sys.exit(main())
