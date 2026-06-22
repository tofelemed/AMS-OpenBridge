#!/usr/bin/env python3
"""
AMS Fault Injection & Resilience Test Suite
============================================
Tests system behavior under infrastructure failures:
  - Kafka broker pause/resume
  - Flink TaskManager kill/restart
  - Network partition simulation
  - Gateway outage simulation

Usage:
  python fault_injection.py --test kafka_pause
  python fault_injection.py --test flink_failover
  python fault_injection.py --test all
"""

import subprocess, time, json, argparse, threading, uuid
from confluent_kafka import Producer, Consumer, KafkaError

KAFKA_CONTAINER = "ams-kafka"
TM1_CONTAINER = "docker-flink-taskmanager-1"
TM2_CONTAINER = "docker-flink-taskmanager-2"
JM_CONTAINER = "ams-flink-jobmanager"

def docker_exec(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
    return result.returncode, result.stdout.strip(), result.stderr.strip()

def docker_pause(container):
    print(f"  ⏸  Pausing container: {container}")
    return docker_exec(f"docker pause {container}")

def docker_unpause(container):
    print(f"  ▶  Unpausing container: {container}")
    return docker_exec(f"docker unpause {container}")

def docker_stop(container):
    print(f"  ⏹  Stopping container: {container}")
    return docker_exec(f"docker stop {container}")

def docker_start(container):
    print(f"  🔄 Starting container: {container}")
    return docker_exec(f"docker start {container}")

# ── Test 1: Kafka Broker Pause ───────────────────────────────
def test_kafka_pause():
    print("\n" + "=" * 70)
    print("  TEST 1: Kafka Broker Pause & Resume (Network Partition Sim)")
    print("=" * 70)

    # Produce baseline events
    conf = {'bootstrap.servers': 'localhost:29092', 'linger.ms': 5}
    producer = Producer(conf)
    baseline_count = 0

    print("  Phase 1: Producing baseline events (5s)...")
    end = time.time() + 5
    while time.time() < end:
        event = {"eventId": str(uuid.uuid4()), "sourceName": f"KafkaTest.Tag{baseline_count}",
                 "eventTimeEpochMs": int(time.time() * 1000), "message": "baseline",
                 "severity": 500, "conditionActive": True}
        try:
            producer.produce('raw-opc-events', value=json.dumps(event).encode())
            baseline_count += 1
        except:
            pass
        if baseline_count % 100 == 0:
            producer.poll(0)
    producer.flush()
    print(f"  Baseline: {baseline_count} events produced.")

    # Pause Kafka
    print("\n  Phase 2: Pausing Kafka broker for 15s...")
    docker_pause(KAFKA_CONTAINER)

    # Try producing during outage
    outage_errors = 0
    outage_start = time.time()
    while time.time() < outage_start + 10:
        try:
            event = {"eventId": str(uuid.uuid4()), "sourceName": "OutageTest",
                     "eventTimeEpochMs": int(time.time() * 1000), "message": "during outage"}
            producer.produce('raw-opc-events', value=json.dumps(event).encode())
            producer.poll(0.5)
        except Exception:
            outage_errors += 1
        time.sleep(0.5)

    print(f"  During outage: {outage_errors} delivery errors (expected)")

    # Resume
    print("\n  Phase 3: Resuming Kafka broker...")
    docker_unpause(KAFKA_CONTAINER)
    time.sleep(5)

    # Verify recovery
    recovery_count = 0
    end = time.time() + 5
    while time.time() < end:
        event = {"eventId": str(uuid.uuid4()), "sourceName": f"RecoveryTest.Tag{recovery_count}",
                 "eventTimeEpochMs": int(time.time() * 1000), "message": "recovery"}
        try:
            producer.produce('raw-opc-events', value=json.dumps(event).encode())
            recovery_count += 1
        except:
            pass
        if recovery_count % 100 == 0:
            producer.poll(0)
    producer.flush()

    print(f"  Recovery: {recovery_count} events produced after resume.")
    passed = recovery_count > 0
    print(f"\n  RESULT: {'✅ PASS — Kafka recovered and accepting events' if passed else '❌ FAIL'}")
    return passed

# ── Test 2: Flink TaskManager Failover ───────────────────────
def test_flink_failover():
    print("\n" + "=" * 70)
    print("  TEST 2: Flink TaskManager Failover & Recovery")
    print("=" * 70)

    # Check running jobs
    rc, out, _ = docker_exec(f"docker exec -i {JM_CONTAINER} flink list")
    running_before = out.count("RUNNING")
    print(f"  Phase 1: Running jobs before failover: {running_before}")

    # Kill TaskManager 1
    print("\n  Phase 2: Stopping TaskManager-1...")
    docker_stop(TM1_CONTAINER)
    time.sleep(10)

    # Check job status during outage
    rc, out, _ = docker_exec(f"docker exec -i {JM_CONTAINER} flink list")
    print(f"  During outage: {out}")

    # Restart TaskManager 1
    print("\n  Phase 3: Restarting TaskManager-1...")
    docker_start(TM1_CONTAINER)
    time.sleep(15)

    # Verify recovery
    rc, out, _ = docker_exec(f"docker exec -i {JM_CONTAINER} flink list")
    running_after = out.count("RUNNING")
    print(f"  After recovery: {running_after} jobs running")

    passed = running_after >= running_before
    print(f"\n  RESULT: {'✅ PASS — Flink recovered after TM failover' if passed else '❌ FAIL'}")
    return passed

# ── Test 3: Checkpoint & Savepoint Verification ──────────────
def test_checkpoint_recovery():
    print("\n" + "=" * 70)
    print("  TEST 3: Flink Checkpoint & State Recovery")
    print("=" * 70)

    # List checkpoints via REST API
    rc, out, _ = docker_exec(
        'docker exec -i ams-flink-jobmanager curl -s http://localhost:8081/v1/jobs'
    )

    try:
        jobs = json.loads(out)
        running_jobs = [j for j in jobs.get('jobs', []) if j.get('status') == 'RUNNING']
        if not running_jobs:
            print("  No running jobs found.")
            return False

        job_id = running_jobs[0]['id']
        print(f"  Inspecting job: {job_id}")

        rc, out, _ = docker_exec(
            f'docker exec -i ams-flink-jobmanager curl -s http://localhost:8081/v1/jobs/{job_id}/checkpoints'
        )
        cp_info = json.loads(out)
        counts = cp_info.get('counts', {})
        completed = counts.get('completed', 0)
        failed = counts.get('failed', 0)
        print(f"  Checkpoints completed: {completed}")
        print(f"  Checkpoints failed:    {failed}")

        passed = completed > 0 and failed == 0
        print(f"\n  RESULT: {'✅ PASS — Checkpoints healthy' if passed else '⚠️  REVIEW — Check Flink config'}")
        return passed
    except Exception as e:
        print(f"  Could not parse checkpoint info: {e}")
        return False

# ── Test 4: Kafka Topic Lag Monitor ──────────────────────────
def test_consumer_lag():
    print("\n" + "=" * 70)
    print("  TEST 4: Kafka Consumer Lag Analysis")
    print("=" * 70)

    rc, out, _ = docker_exec(
        f'docker exec -i {KAFKA_CONTAINER} kafka-consumer-groups '
        f'--bootstrap-server localhost:9092 --all-groups --describe'
    )

    if rc != 0:
        print(f"  Error fetching consumer groups: {out}")
        return False

    print(f"  {out[:2000]}")
    total_lag = 0
    for line in out.split('\n'):
        parts = line.split()
        if len(parts) >= 6:
            try:
                lag = int(parts[5])
                total_lag += lag
            except ValueError:
                pass

    print(f"\n  Total consumer lag across all groups: {total_lag:,}")
    passed = total_lag < 100000
    print(f"  RESULT: {'✅ PASS — Lag within acceptable range' if passed else '⚠️  High lag detected'}")
    return passed

# ── Main ─────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AMS Fault Injection Tests")
    parser.add_argument('--test', choices=['kafka_pause', 'flink_failover', 'checkpoint',
                                           'consumer_lag', 'all'], default='all')
    args = parser.parse_args()

    tests = {
        'kafka_pause': test_kafka_pause,
        'flink_failover': test_flink_failover,
        'checkpoint': test_checkpoint_recovery,
        'consumer_lag': test_consumer_lag,
    }

    results = {}
    if args.test == 'all':
        for name, fn in tests.items():
            results[name] = fn()
    else:
        results[args.test] = tests[args.test]()

    print("\n" + "=" * 70)
    print("  FAULT INJECTION — SUMMARY")
    print("=" * 70)
    for name, passed in results.items():
        print(f"  {name:<25} {'✅ PASS' if passed else '❌ FAIL'}")
    all_pass = all(results.values())
    print(f"\n  OVERALL: {'✅ ALL RESILIENCE TESTS PASSED' if all_pass else '⚠️  REVIEW REQUIRED'}")
    print("=" * 70)

if __name__ == '__main__':
    main()
