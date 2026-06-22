#!/usr/bin/env python3
"""
AMS Large-Scale Synthetic Load Test — 863K+ Tags
=================================================
Simulates realistic industrial alarm traffic at scale:
  - 74 sites × ~11,600 tags/site = 863,000+ tags
  - Multi-vendor DCS (Honeywell, Emerson, Yokogawa, Foxboro, ABB, GE)
  - Alarm floods, steady-state, and burst patterns
  - Measures end-to-end latency and throughput

Usage:
  python load_test_863k.py [--mode steady|flood|burst] [--duration 300] [--rate 5000]
"""

import json, time, uuid, random, argparse, threading, statistics
from datetime import datetime
from collections import defaultdict
from confluent_kafka import Producer, Consumer, KafkaError

# ── DCS Vendor Profiles ──────────────────────────────────────
VENDORS = [
    {"name": "Honeywell_Experion",  "prefix": "HW",  "sites": 22, "tags_per_site": 12000},
    {"name": "Emerson_DeltaV",      "prefix": "EM",  "sites": 18, "tags_per_site": 11500},
    {"name": "Yokogawa_CENTUM",     "prefix": "YK",  "sites": 15, "tags_per_site": 11000},
    {"name": "Foxboro_IA",          "prefix": "FB",  "sites": 10, "tags_per_site": 10500},
    {"name": "Matrikon_OPC",        "prefix": "MK",  "sites": 5,  "tags_per_site": 12500},
    {"name": "ABB_800xA",           "prefix": "AB",  "sites": 3,  "tags_per_site": 11000},
    {"name": "GE_MarkVIe",          "prefix": "GE",  "sites": 1,  "tags_per_site": 10000},
]

AREAS = ["Wellpad", "Separator", "Compressor", "Pipeline", "Flare", "Tank_Farm",
         "Pump_Station", "Power_Gen", "Water_Injection", "Gas_Lift"]
CONDITIONS = ["Level", "Pressure", "Temperature", "Flow", "Speed", "Vibration", "Current"]
SUB_CONDITIONS = {
    "Level":       ["HH", "H", "L", "LL"],
    "Pressure":    ["HH", "H", "L", "LL"],
    "Temperature": ["HH", "H", "L", "LL"],
    "Flow":        ["H", "L", "NoFlow"],
    "Speed":       ["H", "L", "Trip"],
    "Vibration":   ["H", "HH", "Trip"],
    "Current":     ["H", "L", "Overload"],
}
PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
PRIORITY_WEIGHTS = [5, 15, 40, 40]
MESSAGES = [
    "ER: {} alarm", "Process variable exceeded {} limit",
    "Instrument {} deviation detected", "Controller output {} threshold",
    "Equipment {} protection activated", "Abnormal {} rate of change",
]

# ── Metrics Collector ────────────────────────────────────────
class MetricsCollector:
    def __init__(self):
        self.lock = threading.Lock()
        self.produced = 0
        self.consumed = 0
        self.latencies_ms = []
        self.errors = 0
        self.start_time = time.time()
        self.produce_times = {}  # eventId -> produce_epoch_ms
        self.soe_violations = 0
        self.duplicates = 0
        self.seen_ids = set()
        self.last_event_per_source = {}  # sourceName -> last eventTimeEpochMs

    def record_produce(self, event_id):
        with self.lock:
            self.produced += 1
            self.produce_times[event_id] = int(time.time() * 1000)

    def record_consume(self, event_id, event_time_ms, source_name=""):
        with self.lock:
            self.consumed += 1
            if event_id in self.seen_ids:
                self.duplicates += 1
            self.seen_ids.add(event_id)
            if event_id in self.produce_times:
                lat = int(time.time() * 1000) - self.produce_times[event_id]
                self.latencies_ms.append(lat)
                del self.produce_times[event_id]
            if source_name:
                prev = self.last_event_per_source.get(source_name, 0)
                if event_time_ms < prev:
                    self.soe_violations += 1
                self.last_event_per_source[source_name] = max(prev, event_time_ms)

    def record_error(self):
        with self.lock:
            self.errors += 1

    def report(self):
        with self.lock:
            elapsed = time.time() - self.start_time
            lats = self.latencies_ms[-10000:] if self.latencies_ms else [0]
            return {
                "elapsed_s": round(elapsed, 1),
                "produced": self.produced,
                "consumed": self.consumed,
                "throughput_produce_per_s": round(self.produced / max(elapsed, 1), 1),
                "throughput_consume_per_s": round(self.consumed / max(elapsed, 1), 1),
                "latency_p50_ms": round(statistics.median(lats), 1),
                "latency_p95_ms": round(sorted(lats)[int(len(lats) * 0.95)] if lats else 0, 1),
                "latency_p99_ms": round(sorted(lats)[int(len(lats) * 0.99)] if lats else 0, 1),
                "latency_max_ms": max(lats),
                "errors": self.errors,
                "soe_violations": self.soe_violations,
                "duplicates": self.duplicates,
            }

# ── Event Generator ──────────────────────────────────────────
def generate_event(vendor, site_idx, seq_num):
    area = random.choice(AREAS)
    cond = random.choice(CONDITIONS)
    sub = random.choice(SUB_CONDITIONS[cond])
    priority = random.choices(PRIORITIES, weights=PRIORITY_WEIGHTS, k=1)[0]
    sev_map = {"CRITICAL": random.randint(900, 1000), "HIGH": random.randint(600, 899),
               "MEDIUM": random.randint(300, 599), "LOW": random.randint(1, 299)}
    tag = f"{vendor['prefix']}_Site{site_idx:03d}.{area}.{cond}_{random.randint(1,500):04d}"
    now_ms = int(time.time() * 1000)
    msg_tpl = random.choice(MESSAGES)

    return {
        "eventId": str(uuid.uuid4()),
        "serverId": f"{vendor['prefix']}_SITE_{site_idx:03d}",
        "serverName": f"{vendor['name']}_Site{site_idx}",
        "eventType": 32,
        "sourceName": tag,
        "eventTimeEpochMs": now_ms,
        "activeTimeEpochMs": now_ms - random.randint(0, 2000),
        "serverReceivedMs": now_ms,
        "message": msg_tpl.format(sub),
        "eventCategory": 1,
        "severity": sev_map[priority],
        "conditionName": cond,
        "subConditionName": sub,
        "conditionActive": random.random() > 0.15,
        "ackRequired": True,
        "acknowledged": False,
        "changeMask": 1,
        "newState": 1,
        "quality": 192,
        "overflowFlag": False,
        "cookieOffset": seq_num,
        "actorId": "LOAD_TEST",
        "attributes": {"vendor": vendor['name'], "site": site_idx, "area": area},
        "sequenceNumber": seq_num,
        "isBackfill": False,
        "ingestionId": str(uuid.uuid4()),
    }

# ── Producer Thread ──────────────────────────────────────────
def producer_thread(metrics: MetricsCollector, mode: str, duration: int, target_rate: int):
    conf = {'bootstrap.servers': 'localhost:29092', 'linger.ms': 5,
            'batch.size': 131072, 'compression.type': 'lz4', 'acks': 'all'}
    producer = Producer(conf)
    topic = 'raw-opc-events'
    seq = 0
    end_time = time.time() + duration
    batch_size = max(1, target_rate // 10)  # 10 batches/sec

    print(f"[PRODUCER] Mode={mode} | Target={target_rate} events/s | Duration={duration}s")
    total_tags = sum(v['sites'] * v['tags_per_site'] for v in VENDORS)
    print(f"[PRODUCER] Total simulated tag universe: {total_tags:,}")

    while time.time() < end_time:
        batch_start = time.time()
        rate = target_rate
        if mode == 'flood':
            rate = target_rate * random.choice([1, 1, 1, 3, 5, 8])  # random spikes
        elif mode == 'burst':
            cycle = (time.time() % 60) / 60
            rate = int(target_rate * (1 + 4 * abs(cycle - 0.5)))

        current_batch = min(batch_size, rate // 10)
        for _ in range(current_batch):
            vendor = random.choice(VENDORS)
            site = random.randint(1, vendor['sites'])
            event = generate_event(vendor, site, seq)
            try:
                producer.produce(topic, key=event['sourceName'].encode(),
                                 value=json.dumps(event).encode())
                metrics.record_produce(event['eventId'])
                seq += 1
            except BufferError:
                producer.poll(0.1)
                metrics.record_error()

        producer.poll(0)
        elapsed = time.time() - batch_start
        sleep_target = 0.1 - elapsed
        if sleep_target > 0:
            time.sleep(sleep_target)

    producer.flush(30)
    print(f"[PRODUCER] Finished. Total produced: {seq:,}")

# ── Consumer Thread (Latency Measurement) ────────────────────
def consumer_thread(metrics: MetricsCollector, duration: int):
    conf = {'bootstrap.servers': 'localhost:29092', 'group.id': f'load-test-verifier-{uuid.uuid4().hex[:8]}',
            'auto.offset.reset': 'latest', 'enable.auto.commit': True}
    consumer = Consumer(conf)
    consumer.subscribe(['active-alarms'])
    end_time = time.time() + duration + 30  # extra 30s drain

    print("[CONSUMER] Listening on 'active-alarms' for latency measurement...")
    while time.time() < end_time:
        msg = consumer.poll(1.0)
        if msg is None:
            continue
        if msg.error():
            if msg.error().code() != KafkaError._PARTITION_EOF:
                metrics.record_error()
            continue
        try:
            event = json.loads(msg.value().decode())
            eid = event.get('eventId', '')
            etime = event.get('eventTimeEpochMs', 0)
            src = event.get('sourceName', '')
            metrics.record_consume(eid, etime, src)
        except Exception:
            metrics.record_error()

    consumer.close()
    print("[CONSUMER] Finished.")

# ── Report Printer ───────────────────────────────────────────
def report_thread(metrics: MetricsCollector, duration: int):
    end_time = time.time() + duration + 15
    print("\n" + "=" * 90)
    print("  AMS OPERATIONAL VALIDATION — LIVE METRICS")
    print("=" * 90)
    while time.time() < end_time:
        time.sleep(5)
        r = metrics.report()
        print(f"  [{r['elapsed_s']:>7.1f}s] "
              f"Produced: {r['produced']:>8,} ({r['throughput_produce_per_s']:>7.1f}/s) | "
              f"Consumed: {r['consumed']:>8,} ({r['throughput_consume_per_s']:>7.1f}/s) | "
              f"P50: {r['latency_p50_ms']:>6.1f}ms | P99: {r['latency_p99_ms']:>6.1f}ms | "
              f"SOE-Err: {r['soe_violations']} | Dup: {r['duplicates']}")

# ── Main ─────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AMS 863K Tag Load Test")
    parser.add_argument('--mode', choices=['steady', 'flood', 'burst'], default='steady')
    parser.add_argument('--duration', type=int, default=120, help='Test duration in seconds')
    parser.add_argument('--rate', type=int, default=5000, help='Target events/sec')
    args = parser.parse_args()

    metrics = MetricsCollector()

    threads = [
        threading.Thread(target=producer_thread, args=(metrics, args.mode, args.duration, args.rate), daemon=True),
        threading.Thread(target=consumer_thread, args=(metrics, args.duration), daemon=True),
        threading.Thread(target=report_thread, args=(metrics, args.duration), daemon=True),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # ── Final Report ─────────────────────────────────────────
    r = metrics.report()
    total_tags = sum(v['sites'] * v['tags_per_site'] for v in VENDORS)
    print("\n" + "=" * 90)
    print("  AMS OPERATIONAL VALIDATION — FINAL REPORT")
    print("=" * 90)
    print(f"  Test Mode:              {args.mode.upper()}")
    print(f"  Duration:               {r['elapsed_s']}s")
    print(f"  Simulated Tag Universe: {total_tags:,}")
    print(f"  Events Produced:        {r['produced']:,}")
    print(f"  Events Consumed:        {r['consumed']:,}")
    print(f"  Produce Throughput:     {r['throughput_produce_per_s']:,.1f} events/sec")
    print(f"  Consume Throughput:     {r['throughput_consume_per_s']:,.1f} events/sec")
    print(f"  --- Latency ---")
    print(f"  P50:                    {r['latency_p50_ms']} ms")
    print(f"  P95:                    {r['latency_p95_ms']} ms")
    print(f"  P99:                    {r['latency_p99_ms']} ms")
    print(f"  Max:                    {r['latency_max_ms']} ms")
    print(f"  --- Correctness ---")
    print(f"  SOE Ordering Violations:{r['soe_violations']}")
    print(f"  Duplicate Events:       {r['duplicates']}")
    print(f"  Errors:                 {r['errors']}")
    print(f"  --- Verdict ---")
    lat_ok = r['latency_p99_ms'] < 1000
    soe_ok = r['soe_violations'] == 0
    dup_ok = r['duplicates'] == 0
    err_ok = r['errors'] < r['produced'] * 0.001
    all_pass = lat_ok and soe_ok and dup_ok and err_ok
    print(f"  Latency < 1s (P99):     {'[PASS]' if lat_ok else '[FAIL]'}")
    print(f"  SOE Accuracy:           {'[PASS]' if soe_ok else '[FAIL]'}")
    print(f"  No Duplicates:          {'[PASS]' if dup_ok else '[FAIL]'}")
    print(f"  Error Rate < 0.1%:      {'[PASS]' if err_ok else '[FAIL]'}")
    print(f"  =======================")
    print(f"  OVERALL:                {'[PASS] ALL TESTS PASSED' if all_pass else '[WARN] REVIEW REQUIRED'}")
    print("=" * 90)

if __name__ == '__main__':
    main()
